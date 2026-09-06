"""Model Manager — Load, cache, and serve ML models as endpoints.

This module manages model lifecycle:
1. Train models (if not exists)
2. Cache in memory with LRU eviction
3. Provide thread-safe access for API endpoints
4. Support model versioning and reloading
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import lib.artifacts as art
import lib.io_utils as io

logger = logging.getLogger(__name__)

# Model registry
_models: dict[str, Any] = {}
_model_metadata: dict[str, dict[str, Any]] = {}


def load_or_train_model(
    model_id: int | str, force_retrain: bool = False
) -> tuple[Any, dict[str, Any]]:
    """Load model from cache or disk, train if missing."""
    model_id_str = str(model_id)
    model_path = io.MODELS_DIR / f"{model_id_str}_model.pkl"

    # Check cache first
    if model_id_str in _models and not force_retrain:
        logger.info(f"Loaded model {model_id} from cache")
        return _models[model_id_str], _model_metadata.get(model_id_str, {})

    # Try to load from disk
    if model_path.exists() and not force_retrain:
        try:
            model, metadata = art.load_model(model_path)
            _models[model_id_str] = model
            _model_metadata[model_id_str] = metadata
            logger.info(f"Loaded model {model_id} from disk: {model_path}")
        except (OSError, ValueError, TypeError) as e:
            logger.warning(f"Error loading model {model_id}: {e}")
        else:
            return model, metadata

    # Train new model
    logger.info(f"Training new model {model_id}")
    model, metadata = _train_model(model_id)

    # Save to disk
    try:
        art.save_model(
            model,
            model_path,
            provenance={
                "model_id": model_id,
                "created_at": datetime.now(UTC).isoformat(),
                "version": "1.0",
                "type": "illicit_classifier",
            },
        )
        logger.info(f"Saved model {model_id} to {model_path}")
    except (OSError, ValueError, TypeError):
        logger.exception(f"Error saving model {model_id}")

    _models[model_id_str] = model
    _model_metadata[model_id_str] = metadata

    return model, metadata


def _train_model(model_id: int | str) -> tuple[Any, dict[str, Any]]:
    """Train a new model based on model_id."""
    model_id = int(model_id)

    if model_id == 182:
        return _train_model_182()
    elif model_id == 183:
        return _train_model_183()
    elif model_id == 184:
        return _train_model_184()
    else:
        raise ValueError(f"Unknown model_id: {model_id}")


def _train_model_182() -> tuple[Any, dict[str, Any]]:
    """Train Model 182 - Crypto/VASP/Cross-Border.

    Features:
    - Illicit classifier (Elliptic-based)
    - VASP attribution (weak-labeled)
    - Cross-border routing classification
    """
    logger.info("Training Model 182")

    try:
        # Load 182 data
        _ = io.load_182_cases()
        elliptic_features, elliptic_classes, _ = io.load_elliptic(labeled_only=True)

        if elliptic_features.empty:
            logger.warning("No Elliptic data available, using synthetic model")
            return _create_synthetic_model_182(), {
                "status": "synthetic",
                "reason": "No training data available",
            }

        # Extract labels
        y = (
            elliptic_classes.set_index("txId")
            .loc[elliptic_features["txId"]]["class"]
            .values
        )
        X = elliptic_features.drop("txId", axis=1).values

        # Train illicit classifier
        model = Pipeline(
            [
                ("scaler", StandardScaler()),
                ("clf", LogisticRegression(max_iter=1000, random_state=42)),
            ]
        )
        model.fit(X, y)

        metadata = {
            "model_id": 182,
            "type": "illicit_classifier",
            "training_samples": len(X),
            "features": len(X[0]),
            "accuracy": float(model.score(X, y)),
            "timestamp": datetime.now(UTC).isoformat(),
        }

        logger.info(f"Model 182 trained: {metadata}")
    except (FileNotFoundError, ValueError) as e:
        logger.warning(f"Error training Model 182: {e}, using synthetic")
        return _create_synthetic_model_182(), {"status": "synthetic", "reason": str(e)}
    else:
        return model, metadata


def _train_model_183() -> tuple[Any, dict[str, Any]]:
    """Train Model 183 - AML Detection.

    Features:
    - Elliptic-based AML detection
    - Transaction pattern analysis
    """
    logger.info("Training Model 183")

    try:
        # Load Elliptic data
        features, classes, _ = io.load_elliptic(labeled_only=True)

        if features.empty:
            logger.warning("No Elliptic data, using synthetic Model 183")
            return _create_synthetic_model_183(), {
                "status": "synthetic",
                "reason": "No training data available",
            }

        # Extract data
        y = classes.set_index("txId").loc[features["txId"]]["class"].values
        X = features.drop("txId", axis=1).values

        # Train model
        model = Pipeline(
            [
                ("scaler", StandardScaler()),
                (
                    "clf",
                    RandomForestClassifier(
                        n_estimators=100, random_state=42, n_jobs=-1
                    ),
                ),
            ]
        )
        model.fit(X, y)

        metadata = {
            "model_id": 183,
            "type": "aml_classifier",
            "training_samples": len(X),
            "features": len(X[0]),
            "accuracy": float(model.score(X, y)),
            "timestamp": datetime.now(UTC).isoformat(),
        }

        logger.info(f"Model 183 trained: {metadata}")
    except (FileNotFoundError, ValueError) as e:
        logger.warning(f"Error training Model 183: {e}, using synthetic")
        return _create_synthetic_model_183(), {"status": "synthetic", "reason": str(e)}
    else:
        return model, metadata


def _train_model_184() -> tuple[Any, dict[str, Any]]:
    """Train Model 184 - Complaint Typology.

    Features:
    - Consumer complaint classification
    - Typology detection (fraud, identity theft, etc.)
    """
    logger.info("Training Model 184")

    try:
        # Load CFPB complaint data
        df = io.load_cfpb_sample(n=10000)

        if df.empty:
            logger.warning("No CFPB data, using synthetic Model 184")
            return _create_synthetic_model_184(), {
                "status": "synthetic",
                "reason": "No training data available",
            }

        # Simple feature extraction: text length, word count
        # CFPB uses "Consumer complaint narrative" as the column name
        narrative_col = next(
            (
                c
                for c in ("Consumer complaint narrative", "narrative")
                if c in df.columns
            ),
            None,
        )
        if narrative_col is None:
            logger.warning(
                "No narrative column in CFPB data, using synthetic Model 184"
            )
            return _create_synthetic_model_184(), {
                "status": "synthetic",
                "reason": "Narrative column not found in CFPB data",
            }
        X = np.column_stack(
            [
                df[narrative_col].str.len().fillna(0),
                df[narrative_col].str.split().str.len().fillna(0),
            ]
        )

        # Target: product category
        product_col = next(
            (c for c in ("Product", "product") if c in df.columns),
            None,
        )
        if product_col is None:
            logger.warning("No product column in CFPB data, using synthetic Model 184")
            return _create_synthetic_model_184(), {
                "status": "synthetic",
                "reason": "Product column not found in CFPB data",
            }
        y = pd.factorize(df[product_col])[0]

        # Train model
        model = Pipeline(
            [
                ("scaler", StandardScaler()),
                ("clf", LogisticRegression(max_iter=1000, random_state=42)),
            ]
        )
        model.fit(X, y)

        metadata = {
            "model_id": 184,
            "type": "typology_classifier",
            "training_samples": len(X),
            "features": len(X[0]),
            "accuracy": float(model.score(X, y)),
            "timestamp": datetime.now(UTC).isoformat(),
        }

        logger.info(f"Model 184 trained: {metadata}")
    except (FileNotFoundError, ValueError) as e:
        logger.warning(f"Error training Model 184: {e}, using synthetic")
        return _create_synthetic_model_184(), {"status": "synthetic", "reason": str(e)}
    else:
        return model, metadata


def _create_synthetic_model_182() -> Any:
    """Create a synthetic Model 182 for testing when training data is unavailable.

    Fitted on minimal dummy data so predict() / predict_proba() work without error.
    """
    pipe = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(random_state=42)),
        ]
    )
    X = np.array([[0.1, 1, 1000.0, 0], [0.9, 50, 100000.0, 30]])
    y = np.array([0, 1])
    pipe.fit(X, y)
    return pipe


def _create_synthetic_model_183() -> Any:
    """Create a synthetic Model 183 for testing.

    Fitted on minimal dummy data so predict() / predict_proba() work without error.
    """
    pipe = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "clf",
                RandomForestClassifier(n_estimators=10, random_state=42, n_jobs=-1),
            ),
        ]
    )
    X = np.array([[0.1, 1, 1000.0, 0], [0.9, 50, 100000.0, 30]])
    y = np.array([0, 1])
    pipe.fit(X, y)
    return pipe


def _create_synthetic_model_184() -> Any:
    """Create a synthetic Model 184 for testing.

    Fitted on minimal dummy data so predict() / predict_proba() work without error.
    """
    pipe = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(random_state=42)),
        ]
    )
    X = np.array([[0.1, 1, 1000.0, 0], [0.9, 50, 100000.0, 30]])
    y = np.array([0, 1])
    pipe.fit(X, y)
    return pipe


def predict(model_id: int | str, record: dict[str, Any]) -> dict[str, Any]:
    """Make a prediction using the specified model.

    Routes to the real class-based models (Model182/183/184) when the loaded
    object is a domain model instance, and falls back to the sklearn Pipeline
    feature-list path only for plain Pipeline objects.
    """
    model, metadata = load_or_train_model(model_id)

    # Class-based domain models (Model182 / Model183 / Model184) are not
    # sklearn Pipelines — they have no `named_steps` attribute and expect the
    # full domain record dict passed directly to predict().
    if hasattr(model, "predict") and not hasattr(model, "named_steps"):
        try:
            result = model.predict(record)
            if isinstance(result, dict):
                result.setdefault("model_id", model_id)
                result.setdefault("timestamp", datetime.now(UTC).isoformat())
                result.setdefault("metadata", metadata)
                return result
        except Exception as e:
            logger.exception(f"Error predicting with model {model_id}")
            return {
                "model_id": model_id,
                "error": str(e),
                "timestamp": datetime.now(UTC).isoformat(),
            }

    # sklearn Pipeline fallback — convert record to a flat feature vector.
    features = _extract_features(record, model_id)
    try:
        prediction = model.predict([features])[0]
        probability = float(model.predict_proba([features])[0].max())

        return {
            "model_id": model_id,
            "prediction": int(prediction),
            "confidence": probability,
            "timestamp": datetime.now(UTC).isoformat(),
            "metadata": metadata,
        }
    except (ValueError, AttributeError) as e:
        logger.exception(f"Error predicting with model {model_id}")
        return {
            "model_id": model_id,
            "error": str(e),
            "timestamp": datetime.now(UTC).isoformat(),
        }


def _extract_features(record: dict[str, Any], model_id: int | str) -> list[float]:
    """Extract features from record for model."""
    model_id = int(model_id)

    # Generic feature extraction - adapt per model
    features = [
        float(record.get("risk_score", 0.0)),
        float(record.get("transaction_count", 0)),
        float(record.get("amount", 0.0)),
        float(record.get("age_days", 0)),
    ]

    return features


def get_model_status() -> dict[str, Any]:
    """Get status of all loaded models."""
    status = {}
    for model_id in ["182", "183", "184"]:
        try:
            _, metadata = load_or_train_model(model_id)
            status[model_id] = {
                "loaded": True,
                "metadata": metadata,
                "cached": model_id in _models,
            }
        except Exception as e:  # broader catch — load_or_train_model can raise anything
            status[model_id] = {
                "loaded": False,
                "error": str(e),
            }

    return status


def reload_models() -> dict[str, Any]:
    """Reload all models (clearing cache)."""
    _models.clear()
    _model_metadata.clear()
    return get_model_status()


if __name__ == "__main__":
    # Test model loading/training
    io.ensure_dirs()

    for mid in [182, 183, 184]:
        try:
            model, metadata = load_or_train_model(mid)
            print(f"✓ Model {mid}: {metadata}")
        except Exception as e:
            print(f"✗ Model {mid}: {e}")
