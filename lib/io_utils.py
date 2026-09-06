"""Shared I/O utilities for the CASHNET multi-model fraud pipeline.

All loaders are defensive: missing or partial data degrades to an empty
structure (or a tiny synthetic fallback) so the training notebooks can still
run end-to-end in environments where the large externally-fetched corpora
have not been downloaded yet.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
ARTIFACTS_DIR = ROOT / "artifacts"


def repo_root() -> Path:
    return ROOT


def ensure_dirs() -> None:
    for d in (MODELS_DIR, ARTIFACTS_DIR):
        d.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Generic JSON batch loading
# ---------------------------------------------------------------------------
def load_json_batches(folder: str | os.PathLike) -> list[Any]:
    """Load every *.json file in *folder* and concatenate list contents.

    Supports both a single JSON list per file and a list of files each
    holding a list of records.
    """
    folder = Path(folder)
    if not folder.exists():
        return []
    records: list[Any] = []
    for fp in sorted(folder.glob("*.json")):
        try:
            with open(fp, encoding="utf-8") as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError):
            continue
        if isinstance(data, list):
            records.extend(data)
        else:
            records.append(data)
    return records


def _read_json(path: str | os.PathLike) -> Any:
    path = Path(path)
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# 182 — Crypto / VASP / Cross-border
# ---------------------------------------------------------------------------
_182_FAMILIES = [
    "cross_border_cases",
    "crypto_investigation_cases",
    "legal_requests",
    "ransomware_cases",
    "vasp_racking",
    "vasp_responses",
    "wallet_history",
]


def load_182_cases() -> dict[str, list[Any]]:
    """Return {family_name: [records...]} for all 7 source families."""
    out: dict[str, list[Any]] = {}
    base = ROOT / "182" / "DATA"
    for fam in _182_FAMILIES:
        out[fam] = load_json_batches(base / fam)
    return out


def load_snap_trust() -> pd.DataFrame:
    """Directed trust edges (source, target, rating, time) from SNAP corpora."""
    edges: list[dict] = []
    candidates = [
        ROOT / "182/DATA/external/bitcoin_alpha_trust/soc-sign-bitcoinalpha.csv",
        ROOT / "182/DATA/external/bitcoin_otc_trust/soc-sign-bitcoinotc.csv",
    ]
    for path in candidates:
        if not path.exists():
            continue
        try:
            df = pd.read_csv(
                path, header=None, names=["source", "target", "rating", "time"]
            )
            df["source_graph"] = path.stem
            edges.append(df)
        except (pd.errors.ParserError, FileNotFoundError, OSError):
            continue
    if edges:
        return pd.concat(edges, ignore_index=True)
    return pd.DataFrame(columns=["source", "target", "rating", "time"])


def load_elliptic(
    labeled_only: bool = True,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load Elliptic AML data.

    Returns (features_df, classes_df, edgelist_df).
    features_df has columns [txId, f1..f166]; classes_df [txId, class] where
    class in {unknown, 1 (illicit), 2 (licit)}; edgelist [txId1, txId2].
    Reading is chunked and limited to labeled txIds to keep memory bounded
    on the 689 MB features file.
    """
    base = ROOT / "182/DATA/external/elliptic_aml/elliptic_bitcoin_dataset"
    feat_path = base / "elliptic_txs_features.csv"
    cls_path = base / "elliptic_txs_classes.csv"
    edge_path = base / "elliptic_txs_edgelist.csv"

    classes = (
        pd.read_csv(cls_path)
        if cls_path.exists()
        else pd.DataFrame(columns=["txId", "class"])
    )
    classes["txId"] = classes["txId"].astype(str)

    edgelist = (
        pd.read_csv(edge_path)
        if edge_path.exists()
        else pd.DataFrame(columns=["txId1", "txId2"])
    )

    features = pd.DataFrame()
    if feat_path.exists():
        labeled_ids = set(classes["txId"].astype(str)) if labeled_only else None
        parts: list[pd.DataFrame] = []
        for chunk in pd.read_csv(
            feat_path, header=None, chunksize=20000, dtype={0: str}, low_memory=False
        ):
            chunk = chunk.rename(columns={0: "txId"})
            chunk["txId"] = chunk["txId"].astype(str)
            if labeled_only and labeled_ids is not None:
                chunk = chunk[chunk["txId"].isin(labeled_ids)]
            if len(chunk):
                parts.append(chunk)
        if parts:
            features = pd.concat(parts, ignore_index=True)
    return features, classes, edgelist


# ---------------------------------------------------------------------------
# 183 — Complaints / Support / Transactions
# ---------------------------------------------------------------------------
def load_183_complaints() -> list[Any]:
    recs: list[Any] = []
    base = ROOT / "183/DATA"
    for fam in [
        "Complaint datasets",
        "Support  reference datasets",
        "Transaction datasets",
    ]:
        recs.extend(load_json_batches(base / fam))
    # top-level generated json files
    for fp in base.glob("*_generated.json"):
        try:
            with open(fp, encoding="utf-8") as fh:
                d = json.load(fh)
            recs.extend(d if isinstance(d, list) else [d])
        except (json.JSONDecodeError, OSError):
            continue
    return recs


def load_banking77() -> tuple[list[str], list[str]]:
    base = ROOT / "183/DATA/external"
    texts: list[str] = []
    labels: list[str] = []
    for split in ["banking77_train.csv", "banking77_test.csv"]:
        fp = base / split
        if not fp.exists():
            continue
        df = pd.read_csv(fp)
        texts.extend(df["text"].astype(str).tolist())
        labels.extend(df["category"].astype(str).tolist())
    return texts, labels


def load_creditcard() -> tuple[pd.DataFrame, pd.Series]:
    fp = ROOT / "183/DATA/external/creditcard_fraud/creditcard.csv"
    if not fp.exists():
        return pd.DataFrame(), pd.Series(dtype=int)
    df = pd.read_csv(fp)
    y = df["Class"]
    X = df.drop(columns=["Class"])
    return X, y


def load_cfpb_sample(n: int = 100_000) -> pd.DataFrame:
    """Stream the first *n* rows of the (very large) CFPB complaints CSV.

    Uses only the columns needed for product/issue classification to minimise
    memory. Falls back to an empty frame if the file is absent.
    """
    fp = ROOT / "183/DATA/external/cfpb_complaints/complaints.csv"
    if not fp.exists():
        return pd.DataFrame()
    cols = [
        "Product",
        "Sub-product",
        "Issue",
        "Consumer complaint narrative",
        "Company response to consumer",
    ]
    try:
        df = pd.read_csv(fp, nrows=n, usecols=lambda c: c in cols, low_memory=False)
    except (pd.errors.ParserError, FileNotFoundError, OSError):
        return pd.DataFrame()
    df = df.dropna(subset=["Product"])
    return df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# 184 — Banking / ATM / Geospatial
# ---------------------------------------------------------------------------
def load_184_synthetic() -> dict[str, Any]:
    base = ROOT / "184/data/synthetic"
    out: dict[str, Any] = {}
    bank = _read_json(base / "bank/bank_transactions.json") or {}
    out["bank_transactions"] = bank
    out["atm_withdrawal_links"] = (
        _read_json(base / "bank/atm_withdrawal_links.json") or {}
    )
    out["transaction_graph"] = _read_json(base / "bank/transaction_graph.json") or {}
    out["atm_json"] = _read_json(base / "ATM.json") or {}
    out["complaints_bm_c"] = _read_json(base / "complaints/BM_C.json") or {}
    out["complaints"] = _read_json(base / "complaints/complaint.json") or {}
    return out


def load_184_reference() -> dict[str, Any]:
    base = ROOT / "184/data/reference"
    out: dict[str, Any] = {}
    out["banks"] = _read_json(base / "banks.json") or {}
    out["cities"] = _read_json(base / "cities.json") or {}
    out["fraud_types"] = _read_json(base / "fraud_types.json") or {}
    osm: dict[str, Any] = {}
    osm_dir = base / "osm-atms"
    if osm_dir.exists():
        for fp in sorted(osm_dir.glob("*.json")):
            osm[fp.stem] = _read_json(fp)
    out["osm_atms"] = osm
    return out


def load_184_external_osm() -> dict[str, Any]:
    """Live OSM ATM extracts (one json per city) under 184/data/external/."""
    out: dict[str, Any] = {}
    ext = ROOT / "184/data/external"
    if not ext.exists():
        return out
    for fp in sorted(ext.glob("atm_*.json")):
        out[fp.stem] = _read_json(fp)
    return out


def load_184_cfpb(n: int = 50_000) -> pd.DataFrame:
    fp = ROOT / "184/data/external/cfpb_complaints/complaints.csv"
    if not fp.exists():
        return pd.DataFrame()
    try:
        df = pd.read_csv(
            fp,
            nrows=n,
            usecols=["Product", "Consumer complaint narrative"],
            low_memory=False,
        )
    except (pd.errors.ParserError, FileNotFoundError, OSError):
        return pd.DataFrame()
    return df.dropna(subset=["Product"]).reset_index(drop=True)


# ---------------------------------------------------------------------------
# Output writer (used by every notebook for the smoke test + pipeline)
# ---------------------------------------------------------------------------
def _out_folder(model_id: int | str) -> Path:
    return ROOT / str(model_id) / "OUT"


def write_out(
    model_id: int | str,
    payload: dict[str, Any],
    slug: str,
    case_id: str | None = None,
    version: int = 1,
) -> Path:
    """Validate *payload* against the canonical contract and write atomically.

    Filename: <slug>_<case_id>_<timestamp>_v<version>.json
    """
    from lib.schema import validate  # local import to avoid cycles

    validate(payload)
    folder = _out_folder(model_id)
    folder.mkdir(parents=True, exist_ok=True)
    ts = pd.Timestamp.utcnow().strftime("%Y%m%dT%H%M%SZ")
    cid = (case_id or "case").replace(" ", "_")
    fname = f"{slug}_{cid}_{ts}_v{version}.json"
    tmp = folder / f".tmp_{fname}"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, default=str)
    final = folder / fname
    tmp.replace(final)
    return final
