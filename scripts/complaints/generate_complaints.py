#!/usr/bin/env python3
"""Generate strict-schema synthetic CASHNET complaint.json records.

The output records have exactly the fields in the legacy complaint schema.
Ground truth, provenance, account mapping and graph links are sidecar files.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "synthetic" / "complaints"
BM = ROOT / "scripts" / "complaints" / "generate_bm_c.py"
spec = importlib.util.spec_from_file_location("bm_generator", BM)
bm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bm)

TOP = (
    "complaint_id",
    "complaint_date",
    "victim_details",
    "fraud_details",
    "transaction_details",
    "time_details",
)
VICTIM = ("name", "age", "gender", "phone", "email", "address", "bank_details")
ADDRESS = ("street", "city", "district", "state", "pincode", "coordinates")
BANK = ("bank_name", "account_number", "ifsc_code", "upi_id")
FRAUD = ("type", "sub_type", "description", "reported_through", "fraudster_contact")
TX = (
    "transaction_id",
    "date",
    "amount",
    "currency",
    "method",
    "from_account",
    "to_account",
    "reference",
)


def picked(data, keys):
    return {key: data[key] for key in keys}


def strict(record, index):
    victim = record["victim_details"]
    bank = picked(victim["bank_details"], BANK)
    source = record["account_references"]["victim_account_id"]
    bank["upi_id"] = f"account-{source.lower()}@cashnet.invalid"
    destination = record["account_references"]["mule_account_id"]
    transactions = []
    for tx in record["transaction_details"]["transactions"]:
        tx = picked(tx, TX)
        # UPI uses a stable synthetic UPI mapping; bank rails use masked numbers.
        if tx["method"] == "UPI":
            tx["from_account"] = bank["upi_id"]
            tx["to_account"] = f"mule-{destination.lower()}@cashnet.invalid"
        transactions.append(tx)
    contact = dict(record["fraud_details"]["fraudster_contact"])
    contact.setdefault("whatsapp_number", f"+91 00000 {index:05d}")
    return {
        "complaint_id": record["complaint_id"],
        "complaint_date": record["complaint_date"],
        "victim_details": {
            **picked(victim, VICTIM),
            "address": picked(victim["address"], ADDRESS),
            "bank_details": bank,
        },
        "fraud_details": {
            **picked(record["fraud_details"], FRAUD),
            "fraudster_contact": contact,
        },
        "transaction_details": {
            "transactions": transactions,
            "total_amount_lost": record["transaction_details"]["total_amount_lost"],
            "currency": "INR",
        },
        "time_details": record["time_details"],
    }


def generate(count, days, seed):
    source = bm.generate(count, days, seed)
    records = [strict(row, i) for i, row in enumerate(source["complaints"], 1)]
    registry = []
    account_map = {a["account_id"]: a for a in bm.load_accounts()}
    used = {x for r in source["complaints"] for x in r["account_references"].values()}
    for account_id in sorted(used):
        a = account_map[account_id]
        registry.append(
            {
                "account_id": account_id,
                "account_number": a["account_number"],
                "upi_id": (
                    f"mule-{account_id.lower()}@cashnet.invalid"
                    if a.get("role") == "MULE"
                    else f"account-{account_id.lower()}@cashnet.invalid"
                ),
                "bank_name": a["bank_name"],
                "ifsc_code": a["ifsc_code"],
                "city": a["city"],
                "state": a["state"],
            }
        )
    metadata = {
        "data_provenance": bm.prov(seed),
        "records": [
            {
                "complaint_id": r["complaint_id"],
                "case_metadata": r["case_metadata"],
                "account_references": r["account_references"],
                "cross_dataset_links": r.get("cross_dataset_links"),
            }
            for r in source["complaints"]
        ],
        "atm_links": source["atm_links"],
        "bank_registry_source": "../bank/account_registry.json",
    }
    return records, metadata, registry


def validate(records, metadata):
    errors = []
    accounts = {a["account_id"] for a in bm.load_accounts()}
    ids = set()
    txids = set()
    metadata_by_id = {r["complaint_id"]: r for r in metadata["records"]}
    for row in records:
        if tuple(row) != TOP:
            errors.append("schema keys differ")
        if row["complaint_id"] in ids:
            errors.append("duplicate complaint")
        ids.add(row["complaint_id"])
        m = metadata_by_id.get(row["complaint_id"])
        if not m or any(x not in accounts for x in m["account_references"].values()):
            errors.append("unresolved bank account")
        address = row["victim_details"]["address"]
        if bm.GEO.get(address["city"], (None,))[0] != address["state"]:
            errors.append("city state mismatch")
        if not row["victim_details"]["bank_details"]["account_number"].startswith(
            "XXXXXXXXX"
        ):
            errors.append("unmasked account")
        total = 0
        for tx in row["transaction_details"]["transactions"]:
            if tuple(tx) != TX:
                errors.append("transaction schema differs")
            if tx["transaction_id"] in txids:
                errors.append("duplicate tx")
            txids.add(tx["transaction_id"])
            total += tx["amount"]
            if tx["method"] not in ("UPI", "IMPS", "NEFT", "RTGS") or tx["amount"] <= 0:
                errors.append("invalid tx")
        if total != row["transaction_details"]["total_amount_lost"]:
            errors.append("bad total")
    return errors


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--complaints", type=int, default=1000)
    p.add_argument("--days", type=int, default=90)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--output", default=str(OUT / "complaint.json"))
    p.add_argument("--fraud-rate", type=float, default=1.0)
    p.add_argument("--validate", action="store_true")
    args = p.parse_args()
    path = Path(args.output)
    if not 0 < args.fraud_rate <= 1:
        sys.exit("complaints are fraud reports; --fraud-rate must be in (0, 1]")
    if args.validate:
        meta = OUT / "complaint_metadata.json"
        if not path.exists() or not meta.exists():
            sys.exit("complaint.json or its metadata is missing")
        errors = validate(json.loads(path.read_text()), json.loads(meta.read_text()))
        if errors:
            sys.exit("Validation failed: " + "; ".join(errors))
        print("Validated", path)
        return
    records, metadata, registry = generate(args.complaints, args.days, args.seed)
    errors = validate(records, metadata)
    if errors:
        sys.exit("Validation failed: " + "; ".join(errors))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(records, indent=2))
    (OUT / "complaint_metadata.json").write_text(json.dumps(metadata, indent=2))
    (OUT / "complaint_account_registry.json").write_text(
        json.dumps(
            {"data_provenance": bm.prov(args.seed), "accounts": registry}, indent=2
        )
    )
    cases = path.parent / "cases"
    cases.mkdir(parents=True, exist_ok=True)
    for record in records:
        (cases / f"{record['complaint_id']}.json").write_text(
            json.dumps(record, indent=2)
        )
    print(f"Generated {len(records)} strict-schema synthetic complaints in {path}")


if __name__ == "__main__":
    main()
