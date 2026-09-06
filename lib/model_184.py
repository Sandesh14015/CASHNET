"""Model 184 — Banking / ATM / Geospatial (predictive withdrawal intelligence).

Heads:
  * risk_clf   : supervised on 184's own synthetic `is_suspicious` flag
                 (transaction-graph + amount + route features), now evaluated
                 on a held-out split.
  * city_clf   : geospatial head predicting the destination / cash-out CITY from
                 transaction features (weak proxy for withdrawal location, since
                 external `synthetic_financial_fraud` is empty). Reported with
                 hit-rate@k per the roadmap P3 KPI.

predict() normalises a bank-transaction record to the canonical contract.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier

import lib.eval_utils as ev
import lib.io_utils as io
from lib.schema import empty_contract

CITY_MAP = {
    "DEL": "Delhi",
    "MUM": "Mumbai",
    "BLR": "Bengaluru",
    "AHM": "Ahmedabad",
    "HYD": "Hyderabad",
    "GUR": "Gurugram",
}


def _atm_city(atm_id: str) -> str | None:
    if not atm_id or "-" not in atm_id:
        return None
    return CITY_MAP.get(atm_id.split("-")[1])


def _tx_features(tx: dict[str, Any]) -> dict[str, Any]:
    b = tx.get("bank_transaction_data", {}) or {}
    amt = b.get("transaction_amount", 0) or 0
    src = (b.get("source_account", {}) or {}).get("city", "")
    dst = (b.get("destination_account", {}) or {}).get("city", "")
    return {
        "amount": float(np.log1p(amt)),
        "transaction_type": str(b.get("transaction_type", "")),
        "src_city": str(src),
        "dst_city": str(dst),
    }


def _vectorize(
    rows: list[dict[str, Any]], cols: list[str] | None = None, le_city=None
) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    cat = ["transaction_type", "src_city", "dst_city"]
    X = pd.get_dummies(df, columns=cat)
    if le_city is not None:
        # keep city columns stable across train/predict
        X = X.reindex(columns=cols, fill_value=0)
    elif cols is not None:
        for c in cols:
            if c not in X.columns:
                X[c] = 0
        X = X[cols]
    return X


class Model184:
    def __init__(self, test_size: float = 0.2, random_state: int = 42):
        self.test_size = test_size
        self.random_state = random_state
        self.risk_clf = DecisionTreeClassifier(
            max_depth=8, random_state=random_state, class_weight="balanced"
        )
        self.city_clf = RandomForestClassifier(
            n_estimators=300,
            max_depth=12,
            class_weight="balanced",
            random_state=random_state,
            n_jobs=-1,
        )
        self._risk_cols: list[str] = []
        self._city_cols: list[str] = []
        self._city_classes: list[str] = []
        self.metrics: dict[str, Any] = {}
        self.train_metrics: dict[str, Any] = {}
        self.trained = False
        self.atm_counts: dict[str, int] = {}

    def fit(self) -> Model184:
        syn = io.load_184_synthetic()
        txns = (syn.get("bank_transactions") or {}).get("transactions", [])
        links = (syn.get("atm_withdrawal_links") or {}).get("links", [])

        osm = io.load_184_external_osm()
        for city_file, content in osm.items():
            atms = content.get("atms") if isinstance(content, dict) else None
            if isinstance(atms, list):
                self.atm_counts[city_file.replace("atm_", "")] = len(atms)

        if not txns:
            self.trained = True
            return self

        feats = [_tx_features(t) for t in txns]
        y_risk = [
            1 if (t.get("scenario_metadata", {}) or {}).get("is_suspicious") else 0
            for t in txns
        ]
        X = _vectorize(feats)
        self._risk_cols = list(X.columns)
        if len(set(y_risk)) > 1:
            tr, te = ev.split_idx(y_risk, self.test_size, self.random_state)
            self.risk_clf.fit(X.values[tr], np.array(y_risk)[tr])
            pred = self.risk_clf.predict(X.values[te])
            proba = self.risk_clf.predict_proba(X.values[te])[:, 1]
            self.metrics["risk"] = ev.binary_metrics(np.array(y_risk)[te], pred, proba)
            self.train_metrics["risk"] = ev.binary_metrics(
                np.array(y_risk)[tr], self.risk_clf.predict(X.values[tr])
            )

        # geospatial destination-city head (weak proxy for cash-out city)
        scen2city: dict[str, str] = {}
        for link in links:
            c = _atm_city(link.get("atm_id", ""))
            if c:
                scen2city[link.get("scenario_id")] = c
        city_rows, city_y = [], []
        for t in txns:
            sm = t.get("scenario_metadata", {}) or {}
            dst = (t.get("bank_transaction_data", {}) or {}).get(
                "destination_account", {}
            ) or {}
            cid = sm.get("scenario_id")
            # prefer ATM-link city, else destination-account city as weak label
            city = scen2city.get(cid) or dst.get("city")
            if city:
                city_rows.append(_tx_features(t))
                city_y.append(city)
        if len(city_rows) >= 10:
            city_y = ev.collapse_rare(city_y, min_count=5)
            Xc = _vectorize(city_rows)
            self._city_cols = list(Xc.columns)
            tr, te = ev.split_idx(city_y, self.test_size, self.random_state)
            self.city_clf.fit(Xc.values[tr], np.array(city_y)[tr])
            self._city_classes = list(self.city_clf.classes_)
            pred = self.city_clf.predict(Xc.values[te])
            proba = self.city_clf.predict_proba(Xc.values[te])
            self.metrics["withdrawal_city"] = {
                **ev.clf_metrics(np.array(city_y)[te], pred, "macro"),
                "top3": ev.topk_metric(
                    np.array(city_y)[te], proba, k=3, classes=self._city_classes
                ),
                "note": "hit-rate@k; weak proxy (ATM-link/dest-city)",
            }
            self.train_metrics["withdrawal_city"] = ev.clf_metrics(
                np.array(city_y)[tr], self.city_clf.predict(Xc.values[tr]), "macro"
            )
        self.trained = True
        return self

    def predict(self, record: dict[str, Any], threshold: float = 0.7) -> dict[str, Any]:
        f = _tx_features(record)
        Xr = _vectorize([f], self._risk_cols if self._risk_cols else None)
        Xc = _vectorize([f], self._city_cols if self._city_cols else None)

        is_susp = False
        risk_conf = 0.5
        if self._risk_cols:
            proba = self.risk_clf.predict_proba(Xr.values)[0]
            is_susp = bool(np.argmax(proba))
            risk_conf = float(proba[int(is_susp)])

        pred_city = "unknown"
        city_conf = 0.5
        if self._city_classes:
            proba = self.city_clf.predict_proba(Xc.values)[0]
            idx = int(np.argmax(proba))
            pred_city = self._city_classes[idx]
            city_conf = float(proba[idx])

        risk_score = float(risk_conf) if is_susp else float(0.3 * risk_conf)
        confidence = float(min(risk_conf, city_conf))
        needs_review = confidence < threshold

        payload = empty_contract(confidence=confidence, needs_review=needs_review)
        payload["risk_object"] = {
            "risk_score": risk_score,
            "risk_label": (
                "high"
                if risk_score >= 0.7
                else "medium" if risk_score >= 0.4 else "low"
            ),
            "entities": [
                {
                    "type": "account",
                    "id": (record.get("bank_transaction_data", {}) or {})
                    .get("source_account", {})
                    .get("account_number"),
                }
            ],
        }
        payload["dashboard"] = {
            "title": "Model 184 — Banking / ATM / Geospatial",
            "metrics": {
                "is_suspicious": is_susp,
                "predicted_withdrawal_city": pred_city,
                "atms_in_city": self.atm_counts.get(pred_city.lower(), 0),
            },
        }
        actions = []
        if is_susp:
            actions.append(
                {
                    "action": "FREEZE_ACCOUNTS",
                    "target": "source",
                    "priority": "URGENT",
                    "confidence": risk_conf,
                }
            )
        if pred_city != "unknown":
            actions.append(
                {
                    "action": "DEPLOY_TO_CITY",
                    "target": pred_city,
                    "priority": "HIGH",
                    "confidence": city_conf,
                }
            )
        payload["routing_action_list"] = actions
        payload["metadata"] = {"model": "184", "predicted_withdrawal_city": pred_city}
        return payload
