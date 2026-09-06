"""Model 183 — Complaints / Support / Transactions.

Multi-head model:
  * intent_clf  : supervised on Banking77 (77 intents) over TF-IDF text.
  * product_clf : supervised on CFPB product classification (narrative text).
  * risk_clf    : supervised on the creditcard fraud `Class` (PCA features).

183's own JSON complaints are synthetic/LLM-generated (data.md §2.3) — they are
used only as augmentation/domain text, never as the primary label source.
predict() normalises a complaint record to the canonical contract.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import lib.eval_utils as ev
import lib.io_utils as io
from lib.schema import empty_contract


def _complaint_text(rec: dict[str, Any]) -> str:
    parts: list[str] = []
    if isinstance(rec, dict):
        fd = rec.get("fraud_details") or {}
        parts.append(str(fd.get("type", "")))
        parts.append(str(fd.get("sub_type", "")))
        parts.append(str(fd.get("description", "")))
        parts.append(str(fd.get("platform_used", "")))
        victim = rec.get("victim_details") or {}
        parts.append(str(victim.get("city", "")))
    return " ".join(p for p in parts if p)


class Model183:
    def __init__(self):
        self.intent = Pipeline(
            [
                ("tfidf", TfidfVectorizer(max_features=20000, ngram_range=(1, 2))),
                ("scale", StandardScaler(with_mean=False)),
                ("clf", LogisticRegression(max_iter=1000)),
            ]
        )
        self.product = Pipeline(
            [
                ("tfidf", TfidfVectorizer(max_features=20000, ngram_range=(1, 2))),
                ("scale", StandardScaler(with_mean=False)),
                ("clf", LogisticRegression(max_iter=1000)),
            ]
        )
        self.risk_clf = Pipeline(
            [("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=1000))]
        )
        self.risk_cols: list[str] = []
        self.metrics: dict[str, Any] = {}
        self.train_metrics: dict[str, Any] = {}
        self.trained = False

    def fit(self) -> Model183:
        rs = 42
        # intent head — Banking77 (held-out split)
        texts, labels = io.load_banking77()
        if texts:
            tr, te = ev.split_idx(labels, 0.2, rs)
            self.intent.fit([texts[i] for i in tr], [labels[i] for i in tr])
            pred = self.intent.predict([texts[i] for i in te])
            self.metrics["intent"] = {
                **ev.clf_metrics([labels[i] for i in te], pred, "macro"),
                "classes": len(set(labels)),
            }
            self.train_metrics["intent"] = ev.clf_metrics(
                [labels[i] for i in tr],
                self.intent.predict([texts[i] for i in tr]),
                "macro",
            )

        # product head — CFPB (sampled; ~9 GB file streamed)
        cfpb = io.load_cfpb_sample(n=100_000)
        if len(cfpb):
            txt = cfpb["Consumer complaint narrative"].fillna("").astype(str)
            y = cfpb["Product"].astype(str)
            tr, te = ev.split_idx(y, 0.2, rs)
            self.product.fit(txt.iloc[tr], y.iloc[tr])
            pred = self.product.predict(txt.iloc[te])
            self.metrics["product"] = {
                **ev.clf_metrics(y.iloc[te], pred, "macro"),
                "classes": int(y.nunique()),
            }
            self.train_metrics["product"] = ev.clf_metrics(
                y.iloc[tr], self.product.predict(txt.iloc[tr]), "macro"
            )

        # risk/alert head — creditcard fraud (held-out split)
        X, y = io.load_creditcard()
        if len(X):
            self.risk_cols = list(X.columns)
            tr, te = ev.split_idx(y, 0.2, rs)
            self.risk_clf.fit(X.values[tr], y.values[tr])
            pred = self.risk_clf.predict(X.values[te])
            proba = self.risk_clf.predict_proba(X.values[te])[:, 1]
            self.metrics["risk"] = ev.binary_metrics(y.values[te], pred, proba)
            self.train_metrics["risk"] = ev.binary_metrics(
                y.values[tr], self.risk_clf.predict(X.values[tr])
            )
        self.trained = True
        return self

    def predict(self, record: dict[str, Any], threshold: float = 0.7) -> dict[str, Any]:
        text = _complaint_text(record)
        intent = (
            str(self.intent.predict([text])[0])
            if self.metrics.get("intent")
            else "unknown"
        )
        intent_conf = (
            float(np.max(self.intent.predict_proba([text])[0]))
            if self.metrics.get("intent")
            else 0.5
        )
        product = (
            str(self.product.predict([text])[0])
            if self.metrics.get("product")
            else "unknown"
        )
        prod_conf = (
            float(np.max(self.product.predict_proba([text])[0]))
            if self.metrics.get("product")
            else 0.5
        )

        # risk heuristic from complaint severity flags when no PCA features present
        fd = (record.get("fraud_details") or {}) if isinstance(record, dict) else {}
        severity = (
            1.0
            if fd.get("type") in ("investment_scam", "sextortion", "ransomware")
            else 0.5
        )
        risk_score = float(min(1.0, 0.5 * severity + 0.3 * intent_conf))
        confidence = float(min(intent_conf, prod_conf))
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
                    "type": "complaint",
                    "id": (
                        record.get("complaint_id") if isinstance(record, dict) else None
                    ),
                }
            ],
        }
        payload["dashboard"] = {
            "title": "Model 183 — Complaints / Support / Transactions",
            "metrics": {"intent": intent, "product": product, "severity": severity},
        }
        actions = [
            {
                "action": "CLASSIFY_COMPLAINT",
                "target": intent,
                "confidence": intent_conf,
            },
            {"action": "ROUTE_TO_QUEUE", "target": product, "confidence": prod_conf},
        ]
        if risk_score >= threshold:
            actions.append(
                {
                    "action": "GENERATE_ALERT",
                    "target": "investigator",
                    "priority": "HIGH",
                    "confidence": risk_score,
                }
            )
        payload["routing_action_list"] = actions
        payload["metadata"] = {"model": "183", "intent": intent, "product": product}
        return payload

    def predict_risk(self, X: np.ndarray) -> np.ndarray:
        return self.risk_clf.predict(X)
