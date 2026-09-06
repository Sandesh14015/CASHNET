"""Pipeline bundle (plan.md §4.5 Option A).

Bundles the router config plus references to the loaded sub-models and the
shared writer into one object, so `final_model.pkl` alone can re-run the
full subset-selectable pipeline elsewhere.
"""

from __future__ import annotations

import traceback
from typing import Any

import lib.io_utils as io
from lib import schema


def load_input(mid: int) -> list[dict[str, Any]]:
    if mid == 182:
        return io.load_182_cases()["cross_border_cases"][:20]
    if mid == 183:
        recs = io.load_183_complaints()
        return [r for r in recs if isinstance(r, dict) and r.get("fraud_details")][:20]
    if mid == 184:
        tx = (io.load_184_synthetic().get("bank_transactions") or {}).get(
            "transactions", []
        )
        return tx[:20]
    return []


class PipelineBundle:
    def __init__(self, cfg: dict[str, Any], models: dict[int, Any]):
        self.cfg = cfg
        self.models = models  # {mid: model_obj}

    def run(self) -> dict[str, Any]:
        summary: dict[str, Any] = {
            "active": list(self.models.keys()),
            "per_model": {},
            "errors": [],
            "consolidated_actions": [],
        }
        for mid, model in self.models.items():
            try:
                records = load_input(mid)
                for rec in records:
                    payload = model.predict(
                        rec, threshold=self.cfg.get("thresholds", {}).get("alert", 0.7)
                    )
                    schema.validate(payload)
                    if self.cfg.get("write_outputs", True):
                        cid = (
                            rec.get("sahyog_case_id")
                            or rec.get("complaint_id")
                            or (rec.get("bank_transaction_data", {}) or {}).get(
                                "transaction_id"
                            )
                            or f"case_{mid}"
                        )
                        io.write_out(mid, payload, "pred", case_id=str(cid))
                    summary["consolidated_actions"].extend(
                        payload.get("routing_action_list", [])
                    )
                summary["per_model"][mid] = {"n": len(records), "status": "ok"}
            except (
                ValueError,
                AttributeError,
                KeyError,
                TypeError,
            ) as e:  # error isolation: one model must not block others
                summary["errors"].append({"model": mid, "error": str(e)})
                summary["per_model"][mid] = {"status": "failed", "error": str(e)}
                traceback.print_exc()
        return summary
