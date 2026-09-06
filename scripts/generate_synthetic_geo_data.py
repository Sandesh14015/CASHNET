"""Generate deterministic CASHNET demonstration geography.

The generated records are synthetic and must never be represented as NCRP,
bank, UPI, ATM, I4C, SAHYOG, or law-enforcement records.
"""

from __future__ import annotations

import json
import math
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "services" / "geospatial" / "data"
RNG = random.Random(20260818)
CITIES = [
    ("Bhubaneswar", "Odisha", "Khordha", "751001", 20.2961, 85.8245, 78),
    ("Mumbai", "Maharashtra", "Mumbai", "400001", 19.0760, 72.8777, 72),
    ("Delhi", "Delhi", "New Delhi", "110001", 28.6139, 77.2090, 70),
    ("Bengaluru", "Karnataka", "Bengaluru Urban", "560001", 12.9716, 77.5946, 54),
    ("Hyderabad", "Telangana", "Hyderabad", "500001", 17.3850, 78.4867, 48),
    ("Cuttack", "Odisha", "Cuttack", "753001", 20.4625, 85.8830, 42),
    ("Kolkata", "West Bengal", "Kolkata", "700001", 22.5726, 88.3639, 28),
    ("Chennai", "Tamil Nadu", "Chennai", "600001", 13.0827, 80.2707, 25),
    ("Pune", "Maharashtra", "Pune", "411001", 18.5204, 73.8567, 22),
    ("Ahmedabad", "Gujarat", "Ahmedabad", "380001", 23.0225, 72.5714, 20),
    ("Lucknow", "Uttar Pradesh", "Lucknow", "226001", 26.8467, 80.9462, 17),
    ("Jaipur", "Rajasthan", "Jaipur", "302001", 26.9124, 75.7873, 15),
    ("Guwahati", "Assam", "Kamrup Metropolitan", "781001", 26.1445, 91.7362, 13),
    ("Patna", "Bihar", "Patna", "800001", 25.5941, 85.1376, 12),
    ("Ranchi", "Jharkhand", "Ranchi", "834001", 23.3441, 85.3096, 10),
]
FRAUD_TYPES = [
    "UPI_FRAUD",
    "PHISHING",
    "INVESTMENT_FRAUD",
    "TASK_FRAUD",
    "IMPERSONATION_FRAUD",
    "CARD_FRAUD",
    "ACCOUNT_TAKEOVER",
    "ROMANCE_SCAM",
    "CRYPTO_FRAUD",
    "OTHER",
]
LOCATION_TYPES = [
    "ATM",
    "ATM",
    "ATM",
    "BANK_BRANCH",
    "BANK_BRANCH",
    "MERCHANT",
    "MERCHANT",
    "UPI_MERCHANT",
    "UNKNOWN",
    "OTHER",
]


def pick_city():
    return RNG.choices(CITIES, weights=[city[-1] for city in CITIES], k=1)[0]


def offset(latitude: float, longitude: float, km: float):
    angle = RNG.random() * math.tau
    return (
        latitude + km * math.cos(angle) / 111.32,
        longitude + km * math.sin(angle) / (111.32 * math.cos(math.radians(latitude))),
    )


def risk_category(score: int) -> str:
    return (
        "CRITICAL"
        if score >= 88
        else "HIGH" if score >= 72 else "MEDIUM" if score >= 52 else "LOW"
    )


def build():
    now = datetime(2026, 8, 28, 12, tzinfo=UTC)
    transactions = []
    for index in range(520):
        city, state, district, pincode, latitude, longitude, _ = pick_city()
        distance = RNG.uniform(3.5, 12) if index >= 475 else abs(RNG.gauss(0, 0.8))
        lat, lng = offset(latitude, longitude, distance)
        score = max(
            35, min(99, round(57 + RNG.random() * 38 - (10 if index >= 475 else 0)))
        )
        timestamp = now - timedelta(
            days=RNG.randrange(90), seconds=RNG.randrange(86400)
        )
        transactions.append(
            {
                "id": f"HST-{index + 1:05}",
                "case_id": (
                    "CASE-CASHNET-001"
                    if index % 7 == 0
                    else f"CASE-SYN-{index % 36 + 1:03}"
                ),
                "transaction_id": f"TXN-HIST-{index + 1:05}",
                "transaction_type": RNG.choice(
                    ["ATM_WITHDRAWAL", "TRANSFER", "CARD_PAYMENT", "UPI_TRANSFER"]
                ),
                "amount": round(8000 + RNG.random() ** 2 * 260000),
                "currency": "INR",
                "timestamp": timestamp.isoformat(),
                "source_entity_id": f"SRC-{RNG.randrange(1800)}",
                "destination_entity_id": f"DST-{RNG.randrange(1800)}",
                "latitude": round(lat, 6),
                "longitude": round(lng, 6),
                "state": state,
                "district": district,
                "city": city,
                "pincode": pincode,
                "location_type": RNG.choice(LOCATION_TYPES),
                "risk_score": score,
                "risk_category": risk_category(score),
                "fraud_type": RNG.choice(FRAUD_TYPES),
                "data_source": "SYNTHETIC",
                "created_at": timestamp.isoformat(),
            }
        )

    def poi(prefix, count, branch=False):
        output = []
        for index in range(count):
            city, state, district, pincode, latitude, longitude, _ = CITIES[
                index % len(CITIES)
            ]
            lat, lng = offset(latitude, longitude, RNG.random() * (4 if branch else 5))
            output.append(
                {
                    "id": f"{prefix}-{index + 1:03}",
                    "name": f"{city} Synthetic {'Branch' if branch else 'ATM'} {index + 1:03}",
                    "bank_name": RNG.choice(
                        [
                            "Synthetic National Bank",
                            "Demo Cooperative Bank",
                            "Prototype Bank",
                        ]
                    ),
                    "ifsc": f"SYNB0{index + 1:06}" if branch else None,
                    "latitude": round(lat, 6),
                    "longitude": round(lng, 6),
                    "city": city,
                    "district": district,
                    "state": state,
                    "pincode": pincode,
                    "status": "ACTIVE" if not branch else None,
                    "data_source": "SYNTHETIC",
                }
            )
        return output

    return {
        "metadata": {
            "data_source": "SYNTHETIC",
            "seed": 20260818,
            "generated_at": now.isoformat(),
        },
        "transactions": transactions,
        "atms": poi("ATM", 210),
        "branches": poi("BRANCH", 60, branch=True),
    }


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "synthetic-geospatial.json").write_text(
        json.dumps(build(), indent=2), encoding="utf-8"
    )
    print(f"Wrote {OUTPUT / 'synthetic-geospatial.json'}")
