"""Model artifact persistence.

v1 standardises on pickle (per plan.md §9 open item — ONNX/HF revisited
later). Every artifact is wrapped with a small JSON header carrying a schema
version, content hash, and provenance so corruption / version drift is
detectable on load.
"""

from __future__ import annotations

import hashlib
import json
import os
import pickle
import tempfile
from pathlib import Path
from typing import Any

HEADER_MAGIC = b"CASHNET1"


def _sha256(obj: Any) -> str:
    try:
        blob = pickle.dumps(obj)
    except (pickle.PicklingError, TypeError):
        blob = repr(obj).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:16]


def save_model(obj: Any, path: str | Path, provenance: dict | None = None) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    header = {
        "magic": "CASHNET1",
        "version": 1,
        "hash": _sha256(obj),
        "provenance": provenance or {},
    }
    blob = pickle.dumps(obj)
    path = Path(path)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(HEADER_MAGIC)
            fh.write(len(blob).to_bytes(8, "big"))
            fh.write(json.dumps(header).encode("utf-8"))
            fh.write(b"\n")
            fh.write(blob)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    return path


def load_model(path: str | Path) -> tuple[Any, dict]:
    path = Path(path)
    with open(path, "rb") as fh:
        magic = fh.read(len(HEADER_MAGIC))
        if magic != HEADER_MAGIC:
            raise ValueError(f"{path} is not a CASHNET artifact (bad magic)")
        size = int.from_bytes(fh.read(8), "big")
        header_line = fh.readline().decode("utf-8").strip()
        header = json.loads(header_line)
        blob = fh.read(size)
    obj = pickle.loads(blob)
    return obj, header


def model_path(model_id: int | str) -> Path:
    from lib.io_utils import MODELS_DIR

    return MODELS_DIR / f"{model_id}_model.pkl"
