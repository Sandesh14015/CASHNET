#!/usr/bin/env python3
"""Generate BANK.json-compatible synthetic transactions from the complaint registry."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REG = ROOT / "data/synthetic/complaints/complaint_account_registry.json"
COMPLAINTS = ROOT / "data/synthetic/complaints/complaint.json"
DEFAULT = ROOT / "data/synthetic/bank/bank.json"
METHODS = {"UPI": "UPI", "IMPS": "IMPS", "NEFT": "NEFT", "RTGS": "RTGS"}


def account_view(a):
    return {
        k: a.get(k)
        for k in (
            "account_number",
            "bank_name",
            "ifsc_code",
            "account_holder",
            "city",
            "state",
        )
    }


def generate(output: Path, seed: int = 42):
    registry = json.loads(REG.read_text())["accounts"]
    by_number = {a["account_number"]: a for a in registry}
    by_upi = {a["upi_id"]: a for a in registry}
    complaints = json.loads(COMPLAINTS.read_text())
    rows = []
    links = []
    for complaint in complaints:
        for tx in complaint["transaction_details"]["transactions"]:
            source = by_upi.get(tx["from_account"], by_number.get(tx["from_account"]))
            dest = by_upi.get(tx["to_account"], by_number.get(tx["to_account"]))
            if not source or not dest:
                raise ValueError(f"unresolved account in {complaint['complaint_id']}")
            timestamp = tx["date"]
            rows.append(
                {
                    "bank_transaction_data": {
                        "transaction_id": f"BANK-{tx['transaction_id']}",
                        "source_account": account_view(source),
                        "destination_account": account_view(dest),
                        "transaction_amount": tx["amount"],
                        "currency": tx["currency"],
                        "timestamp": timestamp,
                        "transaction_type": METHODS[tx["method"]],
                        "status": "completed",
                    }
                }
            )
            links.append(
                {
                    "bank_transaction_id": f"BANK-{tx['transaction_id']}",
                    "complaint_id": complaint["complaint_id"],
                    "source_account_id": source["account_id"],
                    "destination_account_id": dest["account_id"],
                    "is_synthetic": True,
                }
            )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(rows, indent=2))
    (output.parent / "bank_transaction_metadata.json").write_text(
        json.dumps(
            {
                "data_provenance": {
                    "source": "SYNTHETIC",
                    "generation_engine": "CASHNET",
                    "generator_version": "1.0.0",
                    "seed": seed,
                },
                "links": links,
            },
            indent=2,
        )
    )
    print(f"Generated {len(rows)} synthetic bank transactions: {output}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output", default=str(DEFAULT))
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--validate", action="store_true")
    a = p.parse_args()
    if a.validate:
        from validate_bank_transactions import validate_file

        errors = validate_file(Path(a.output))
        if errors:
            raise SystemExit("Validation failed: " + "; ".join(errors))
        print("Bank validation passed")
        return
    generate(Path(a.output), a.seed)


if __name__ == "__main__":
    main()
