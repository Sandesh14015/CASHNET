#!/usr/bin/env python3
"""Validate BANK.json records and their complaint/registry joins."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REG = ROOT / "data/synthetic/complaints/complaint_account_registry.json"
COMPLAINTS = ROOT / "data/synthetic/complaints/complaint.json"
SCHEMA = (
    "transaction_id",
    "source_account",
    "destination_account",
    "transaction_amount",
    "currency",
    "timestamp",
    "transaction_type",
    "status",
)


def validate_file(path):
    rows = json.loads(path.read_text())
    registry = json.loads(REG.read_text())["accounts"]
    ids = {a["account_number"] for a in registry}
    _ = {a["upi_id"] for a in registry}
    tids = set()
    errors = []
    if not isinstance(rows, list):
        return ["BANK.json must be an array"]
    for row in rows:
        d = row.get("bank_transaction_data", {})
        if tuple(d) != SCHEMA:
            errors.append("schema mismatch")
        if d.get("transaction_id") in tids:
            errors.append("duplicate transaction id")
        tids.add(d.get("transaction_id"))
        for side in ("source_account", "destination_account"):
            a = d.get(side, {})
            if a.get("account_number") not in ids:
                errors.append("account not in authoritative registry")
            if not str(a.get("account_number", "")).startswith("XXXXXXXXX"):
                errors.append("unmasked account")
        if (
            d.get("currency") != "INR"
            or d.get("transaction_type") not in ("UPI", "IMPS", "NEFT", "RTGS")
            or d.get("status") != "completed"
        ):
            errors.append("invalid transaction fields")
        try:
            __import__("datetime").datetime.fromisoformat(
                d["timestamp"].replace("Z", "+00:00")
            )
        except Exception:
            errors.append("invalid timestamp")
    return errors
