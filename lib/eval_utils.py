"""Evaluation utilities — strict held-out protocol.

The original notebooks reported training-fit metrics (optimistic). These
helpers enforce a proper train/test split (stratified for classification,
top-k accuracy for ranking heads) so reported numbers reflect generalization.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    top_k_accuracy_score,
)
from sklearn.model_selection import train_test_split


def split_idx(
    y: Sequence, test_size: float = 0.2, random_state: int = 42, stratify: bool = True
):
    import pandas as pd

    y = np.asarray(y)
    strat = y if stratify else None
    if strat is not None:
        # disable stratification when any class has <2 members (sklearn requirement)
        vc = pd.Series(y).value_counts()
        if (vc < 2).any():
            strat = None
    return train_test_split(
        np.arange(len(y)),
        test_size=test_size,
        random_state=random_state,
        stratify=strat,
    )


def clf_metrics(y_true, y_pred, average: str = "macro") -> dict[str, float]:
    p, r, f, _ = precision_recall_fscore_support(
        y_true, y_pred, average=average, zero_division=0
    )
    return {
        "precision": float(p),
        "recall": float(r),
        "f1": float(f),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "n": len(y_true),
    }


def topk_metric(y_true, y_proba: np.ndarray, k: int = 3, classes=None) -> float:
    """Top-k accuracy. y_proba shape (n_samples, n_classes). String labels are
    mapped to class indices via *classes* when supplied."""
    y_true = np.asarray(y_true)
    if classes is not None:
        idx = {c: i for i, c in enumerate(classes)}
        y_true = np.array([idx.get(x, -1) for x in y_true])
    try:
        return float(
            top_k_accuracy_score(
                y_true, y_proba, k=k, labels=np.arange(y_proba.shape[1])
            )
        )
    except (ValueError, IndexError):
        return float(accuracy_score(y_true, np.argmax(y_proba, axis=1)))


def collapse_rare(y: Sequence, min_count: int = 8, other: str = "OTHER") -> list[str]:
    """Map classes with fewer than *min_count* members to *other* so rare
    categories do not destabilise stratified splits / metrics."""
    from collections import Counter

    counts = Counter(y)
    keep = {k for k, v in counts.items() if v >= min_count}
    return [x if x in keep else other for x in y]


def binary_metrics(y_true, y_pred, y_proba=None) -> dict[str, float]:
    p, r, f, _ = precision_recall_fscore_support(
        y_true, y_pred, average="binary", zero_division=0
    )
    out = {
        "precision": float(p),
        "recall": float(r),
        "f1": float(f),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "n": len(y_true),
    }
    if y_proba is not None:
        try:
            from sklearn.metrics import roc_auc_score

            out["auc"] = float(
                roc_auc_score(
                    y_true,
                    (
                        np.asarray(y_proba)[:, 1]
                        if np.asarray(y_proba).ndim == 2
                        else y_proba
                    ),
                )
            )
        except (ValueError, IndexError):
            # AUC computation failed, skip it
            pass
    return out
