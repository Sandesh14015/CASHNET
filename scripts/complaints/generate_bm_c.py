#!/usr/bin/env python3
"""Create graph-compatible, entirely synthetic CASHNET BM_C complaints."""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / "data" / "reference"
OUT = ROOT / "data" / "synthetic" / "complaints"
BANK = ROOT / "data" / "synthetic" / "bank" / "account_registry.json"
ATM = ROOT / "data" / "synthetic" / "bank" / "atm_withdrawal_links.json"
BANKS = json.loads((REF / "banks.json").read_text())
TYPES = json.loads((REF / "fraud_types.json").read_text())
GEO = {
    "Mumbai": ("Maharashtra", "Mumbai City", "400001", 19.0760, 72.8777),
    "Delhi": ("Delhi", "New Delhi", "110001", 28.6139, 77.2090),
    "New Delhi": ("Delhi", "New Delhi", "110001", 28.6139, 77.2090),
    "Bengaluru": ("Karnataka", "Bengaluru Urban", "560001", 12.9716, 77.5946),
    "Hyderabad": ("Telangana", "Hyderabad", "500001", 17.3850, 78.4867),
    "Chennai": ("Tamil Nadu", "Chennai", "600001", 13.0827, 80.2707),
    "Ahmedabad": ("Gujarat", "Ahmedabad", "380001", 23.0225, 72.5714),
    "Pune": ("Maharashtra", "Pune", "411001", 18.5204, 73.8567),
    "Gurugram": ("Haryana", "Gurugram", "122001", 28.4595, 77.0266),
    "Noida": ("Uttar Pradesh", "Gautam Buddh Nagar", "201301", 28.5355, 77.3910),
    "Kolkata": ("West Bengal", "Kolkata", "700001", 22.5726, 88.3639),
    "Jaipur": ("Rajasthan", "Jaipur", "302001", 26.9124, 75.7873),
    "Surat": ("Gujarat", "Surat", "395003", 21.1702, 72.8311),
    "Lucknow": ("Uttar Pradesh", "Lucknow", "226001", 26.8467, 80.9462),
    "Chandigarh": ("Chandigarh", "Chandigarh", "160017", 30.7333, 76.7794),
}
NAMES = (
    "Aarav Sharma",
    "Diya Patel",
    "Rohan Singh",
    "Kavya Nair",
    "Arjun Das",
    "Meera Gupta",
    "Ishaan Khan",
    "Sana Iyer",
)
SCENARIOS = (
    "DIRECT_FRAUD_PAYMENT",
    "SINGLE_MULE_ATM",
    "MULTI_HOP_MULE_CHAIN",
    "MANY_VICTIMS_ONE_MULE",
    "MULE_TO_CRYPTO",
    "BANK_MULE_ATM",
    "MULTIPLE_MULE_ACCOUNTS",
)


def prov(seed: int):
    return {
        "source": "SYNTHETIC",
        "generation_engine": "CASHNET",
        "generator_version": "1.0.0",
        "generated_at": "2026-08-29T00:00:00Z",
        "seed": seed,
    }


def load_accounts():
    if not BANK.exists():
        raise FileNotFoundError("Generate synthetic bank data first: " + str(BANK))
    return json.loads(BANK.read_text())["accounts"]


def description(kind: str, subtype: str):
    return f"Synthetic CASHNET training complaint: victim reported a {kind.replace('_', ' ')} ({subtype.replace('_', ' ')}). Funds were sent to a synthetic recipient for controlled evaluation."


def generate(count: int, days: int, seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    accounts = load_accounts()
    _ = {a["account_id"]: a for a in accounts}
    victims = [a for a in accounts if a.get("role") in ("VICTIM", "CUSTOMER")]
    mules = [a for a in accounts if a.get("role") == "MULE"]
    if not victims or not mules:
        raise ValueError("Bank registry lacks synthetic victim/mule accounts")
    atm_links = json.loads(ATM.read_text()).get("links", []) if ATM.exists() else []
    records = []
    links = []
    anchor = datetime(2026, 8, 29, tzinfo=UTC)
    for i in range(1, count + 1):
        victim = rng.choice(victims)
        city = victim["city"]
        state, district, pin, lat, lon = GEO[city]
        kind = rng.choice(list(TYPES))
        subtype = rng.choice(TYPES[kind])
        scenario = SCENARIOS[(i - 1) % len(SCENARIOS)]
        mule = rng.choice(mules)
        start = anchor - timedelta(
            days=rng.randrange(days), hours=rng.randrange(24), minutes=rng.randrange(60)
        )
        payments = rng.randint(1, 5)
        txs = []
        for n in range(payments):
            amount = rng.randrange(10, 1001) * 100
            when = start + timedelta(minutes=10 + n * 10)
            txs.append(
                {
                    "transaction_id": f"TXN-SYN-{i:06d}-{n + 1:02d}",
                    "date": when.isoformat().replace("+00:00", "Z"),
                    "amount": amount,
                    "currency": "INR",
                    "method": rng.choices(
                        ["UPI", "IMPS", "NEFT", "RTGS"], [55, 25, 15, 5]
                    )[0],
                    "from_account": victim["account_number"],
                    "to_account": mule["account_number"],
                    "reference": "Synthetic CASHNET reported payment",
                }
            )
        end = start + timedelta(minutes=10 + (payments - 1) * 10 + 10)
        delay = rng.choice([0.1, 0.5, 1, 2, 6, 12, 24])
        complaint_date = end + timedelta(hours=delay)
        fraudster = {
            "phone": f"+91 00000 {i:05d}",
            "email": f"synthetic-fraud-{i}@example.invalid",
        }
        if kind == "sextortion":
            fraudster["video_call_platform"] = "Synthetic Video Platform"
        if kind in ("job_fraud", "investment_scam"):
            fraudster["telegram_id"] = f"@synthetic_offer_{i}"
        record = {
            "complaint_id": f"CMP-SYN-{i:06d}",
            "complaint_date": complaint_date.isoformat().replace("+00:00", "Z"),
            "victim_details": {
                "name": rng.choice(NAMES),
                "age": rng.randint(18, 75),
                "gender": rng.choice(["Male", "Female", "Other"]),
                "phone": f"+91 00000 {i:05d}",
                "email": f"victim-{i}@cashnet.example.invalid",
                "address": {
                    "street": f"Synthetic Address {i}",
                    "city": city,
                    "district": district,
                    "state": state,
                    "pincode": pin,
                    "coordinates": {"latitude": lat, "longitude": lon},
                },
                "bank_details": {
                    "bank_name": victim["bank_name"],
                    "account_number": victim["account_number"],
                    "ifsc_code": victim["ifsc_code"],
                    "upi_id": f"victim-{i}@cashnet.invalid",
                },
            },
            "fraud_details": {
                "type": kind,
                "sub_type": subtype,
                "description": description(kind, subtype),
                "reported_through": rng.choices(
                    [
                        "NCRP Portal",
                        "Cyber Crime Cell",
                        "Police Station",
                        "Bank Report",
                    ],
                    [70, 15, 10, 5],
                )[0],
                "fraudster_contact": fraudster,
            },
            "transaction_details": {
                "transactions": txs,
                "total_amount_lost": sum(t["amount"] for t in txs),
                "currency": "INR",
            },
            "time_details": {
                "fraud_start_time": start.isoformat().replace("+00:00", "Z"),
                "fraud_end_time": end.isoformat().replace("+00:00", "Z"),
                "reporting_delay_hours": delay,
            },
            "case_metadata": {
                "is_synthetic": True,
                "fraud_confirmed": True,
                "fraud_scenario": scenario,
                "scenario_id": f"SCENARIO-SYN-{i:06d}",
                "risk_label": "HIGH",
            },
            "data_provenance": prov(seed),
            "account_references": {
                "victim_account_id": victim["account_id"],
                "mule_account_id": mule["account_id"],
            },
        }
        if scenario in ("SINGLE_MULE_ATM", "BANK_MULE_ATM", "MULTIPLE_MULE_ACCOUNTS"):
            atm_id = rng.choice(atm_links)["atm_id"] if atm_links else "ATM-DEL-000001"
            record["cross_dataset_links"] = {
                "atm_id": atm_id,
                "mule_account_id": mule["account_id"],
            }
            links.append(
                {
                    "complaint_id": record["complaint_id"],
                    "mule_account_id": mule["account_id"],
                    "atm_id": atm_id,
                }
            )
        if scenario == "MULE_TO_CRYPTO":
            record["cross_dataset_links"] = {
                "mule_account_id": mule["account_id"],
                "crypto_wallet_id": f"WALLET-SYNTH-{i:06d}",
                "data_status": "SYNTHETIC_TEST_WALLET",
            }
        records.append(record)
    return {
        "metadata": {
            "record_count": count,
            "historical_days": days,
            "data_provenance": prov(seed),
        },
        "complaints": records,
        "atm_links": links,
        "account_registry_source": "../bank/account_registry.json",
    }


def validate(data: dict[str, Any]) -> list[str]:
    errors = []
    accounts = {a["account_id"] for a in load_accounts()}
    cids = set()
    tids = set()
    for r in data["complaints"]:
        if r["complaint_id"] in cids:
            errors.append("duplicate complaint")
        cids.add(r["complaint_id"])
        a = r["victim_details"]["address"]
        t = r["time_details"]
        if GEO.get(a["city"], (None,))[0] != a["state"]:
            errors.append("city/state mismatch")
        if not r["victim_details"]["bank_details"]["account_number"].startswith(
            "XXXXXXXXX"
        ):
            errors.append("unmasked account")
        if any(x not in accounts for x in r["account_references"].values()):
            errors.append("unknown bank account")
        total = 0
        for tx in r["transaction_details"]["transactions"]:
            total += tx["amount"]
            if tx["transaction_id"] in tids:
                errors.append("duplicate tx")
            tids.add(tx["transaction_id"])
            if (
                tx["amount"] <= 0
                or tx["currency"] != "INR"
                or tx["method"] not in ("UPI", "IMPS", "NEFT", "RTGS")
            ):
                errors.append("invalid tx")
        if total != r["transaction_details"]["total_amount_lost"]:
            errors.append("bad total")
        start = datetime.fromisoformat(t["fraud_start_time"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(t["fraud_end_time"].replace("Z", "+00:00"))
        reported = datetime.fromisoformat(r["complaint_date"].replace("Z", "+00:00"))
        if not start < end <= reported:
            errors.append("bad timeline")
    return errors


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--complaints", type=int, default=1000)
    p.add_argument("--days", type=int, default=90)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--validate", action="store_true")
    args = p.parse_args()
    path = OUT / "BM_C.json"
    if args.validate:
        if not path.exists():
            sys.exit("No BM_C dataset exists")
        errors = validate(json.loads(path.read_text()))
        if errors:
            sys.exit("Validation failed: " + "; ".join(errors))
        print("Validated", path)
        return
    data = generate(args.complaints, args.days, args.seed)
    errors = validate(data)
    if errors:
        sys.exit("Validation failed: " + "; ".join(errors))
    OUT.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))
    print(f"Generated {args.complaints} synthetic BM_C complaints in {path}")


if __name__ == "__main__":
    main()
