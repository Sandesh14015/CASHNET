"""Canonical output contract shared by models 182 / 183 / 184.

Every model's prediction is normalised to this shape before being written to
its <model_id>/OUT folder, and the consolidated `pipeline.ipynb` merges the
three payloads into a single dashboard/alert feed.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent

CONTRACT_KEYS = (
    "risk_object",
    "dashboard",
    "routing_action_list",
    "confidence",
    "needs_review",
)

OPTIONAL_KEYS = ("metadata",)


def empty_contract(
    confidence: float = 0.0, needs_review: bool = True
) -> dict[str, Any]:
    return {
        "risk_object": {
            "risk_score": 0.0,
            "risk_label": "unknown",
            "entities": [],
        },
        "dashboard": {
            "title": "CASHNET risk summary",
            "metrics": {},
        },
        "routing_action_list": [],
        "confidence": confidence,
        "needs_review": needs_review,
    }


def validate(payload: dict[str, Any]) -> None:
    """Raise TypeError or ValueError if *payload* does not satisfy the contract."""
    if not isinstance(payload, dict):
        raise TypeError("payload must be a dict")
    missing = [k for k in CONTRACT_KEYS if k not in payload]
    if missing:
        raise ValueError(f"payload missing required keys: {missing}")
    if not isinstance(payload["confidence"], (int, float)):
        raise TypeError("confidence must be numeric")
    if not isinstance(payload["needs_review"], bool):
        raise TypeError("needs_review must be a bool")
    if not isinstance(payload["routing_action_list"], list):
        raise TypeError("routing_action_list must be a list")


def is_valid(payload: dict[str, Any]) -> bool:
    try:
        validate(payload)
    except (TypeError, ValueError):
        return False
    else:
        return True


def example_payload() -> dict[str, Any]:
    """A sample contract payload mirroring the hand-authored OUT examples."""
    return {
        "risk_object": {
            "risk_score": 0.89,
            "risk_label": "high",
            "entities": [
                {"type": "wallet", "id": "0xABC...", "attributed_vasp": "Binance"},
            ],
        },
        "dashboard": {
            "title": "CASHNET consolidated risk",
            "metrics": {"illicit_prob": 0.89, "cases": 1},
        },
        "routing_action_list": [
            {"action": "FREEZE_REQUEST", "target": "Binance", "priority": "CRITICAL"},
        ],
        "confidence": 0.89,
        "needs_review": False,
        "metadata": {"model": "example", "version": 1},
    }


if __name__ == "__main__":
    validate(example_payload())
    print("schema OK; contract keys:", CONTRACT_KEYS)
