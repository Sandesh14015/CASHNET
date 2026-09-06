#!/usr/bin/env python3
"""Model Server — Flask application to serve ML models as REST API.

This runs as a separate service that:
1. Manages model lifecycle (training, caching, loading)
2. Exposes endpoints for predictions
3. Provides health checks and status
4. Handles batch predictions efficiently

Deploy this alongside the main API server.
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np

# Add project root to path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import lib.io_utils as io
import lib.model_manager as mm

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Ensure directories exist
io.ensure_dirs()


# Helper to make objects JSON-serialisable (convert numpy types)
def make_serialisable(obj):
    """Convert numpy types to Python native types for JSON serialisation."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.ndarray,)):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: make_serialisable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [make_serialisable(i) for i in obj]
    return obj


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return (
        jsonify(
            {
                "status": "healthy",
                "service": "model-server",
                "version": "1.0.0",
            }
        ),
        200,
    )


@app.route("/models/status", methods=["GET"])
def models_status():
    """Get status of all models."""
    try:
        status = mm.get_model_status()
        # Ensure all values are JSON-serialisable
        status = make_serialisable(status)
        return (
            jsonify(
                {
                    "timestamp": datetime.now(UTC).isoformat(),
                    "models": status,
                }
            ),
            200,
        )
    except (ValueError, KeyError) as e:
        logger.exception("Error getting model status")
        return jsonify({"error": str(e)}), 500


@app.route("/models/predict/182", methods=["POST"])
def predict_182():
    """Predict using Model 182 (Crypto/VASP/Cross-Border)."""
    try:
        data = request.get_json()
        record = data.get("record", {})

        if not record:
            return jsonify({"error": "record is required"}), 400

        prediction = mm.predict(182, record)
        return jsonify(prediction), 200
    except (ValueError, KeyError, TypeError) as e:
        logger.exception("Prediction error (182)")
        return jsonify({"error": str(e)}), 500


@app.route("/models/predict/183", methods=["POST"])
def predict_183():
    """Predict using Model 183 (AML Detection)."""
    try:
        data = request.get_json()
        record = data.get("record", {})

        if not record:
            return jsonify({"error": "record is required"}), 400

        prediction = mm.predict(183, record)
        return jsonify(prediction), 200
    except (ValueError, KeyError, TypeError) as e:
        logger.exception("Prediction error (183)")
        return jsonify({"error": str(e)}), 500


@app.route("/models/predict/184", methods=["POST"])
def predict_184():
    """Predict using Model 184 (Complaint Typology)."""
    try:
        data = request.get_json()
        record = data.get("record", {})

        if not record:
            return jsonify({"error": "record is required"}), 400

        prediction = mm.predict(184, record)
        return jsonify(prediction), 200
    except (ValueError, KeyError, TypeError) as e:
        logger.exception("Prediction error (184)")
        return jsonify({"error": str(e)}), 500


@app.route("/models/reload", methods=["POST"])
def reload_models():
    """Reload all models (clear cache)."""
    try:
        logger.info("Reloading all models...")
        status = mm.reload_models()
        return (
            jsonify(
                {
                    "message": "Models reloaded successfully",
                    "status": status,
                }
            ),
            200,
        )
    except (ValueError, RuntimeError) as e:
        logger.exception("Error reloading models")
        return jsonify({"error": str(e)}), 500


@app.route("/models/train", methods=["POST"])
def train_model():
    """Manually trigger model training."""
    try:
        data = request.get_json()
        model_id = data.get("model_id")

        if not model_id or model_id not in [182, 183, 184]:
            return jsonify({"error": "model_id must be 182, 183, or 184"}), 400

        logger.info(f"Training model {model_id}...")
        _, metadata = mm.load_or_train_model(model_id, force_retrain=True)

        return (
            jsonify(
                {
                    "message": f"Model {model_id} trained successfully",
                    "metadata": metadata,
                }
            ),
            200,
        )
    except (ValueError, RuntimeError) as e:
        logger.exception("Error training model")
        return jsonify({"error": str(e)}), 500


@app.route("/models/batch-predict", methods=["POST"])
def batch_predict():
    """Batch predictions for multiple records."""
    try:
        data = request.get_json()
        records = data.get("records", [])
        model_ids = data.get("model_ids", [182, 183, 184])

        if not records:
            return jsonify({"error": "records array is required"}), 400

        results = []

        for model_id in model_ids:
            batch_results = []

            for record in records:
                try:
                    prediction = mm.predict(model_id, record)
                    batch_results.append(prediction)
                except (ValueError, KeyError, TypeError) as e:
                    batch_results.append(
                        {
                            "model_id": model_id,
                            "error": str(e),
                        }
                    )

            results.append(
                {
                    "model_id": model_id,
                    "count": len(batch_results),
                    "predictions": batch_results,
                }
            )

        # Convert numpy types to JSON-serialisable Python types
        results = make_serialisable(results)

        return (
            jsonify(
                {
                    "timestamp": datetime.now(UTC).isoformat(),
                    "total_records": len(records),
                    "models_processed": len(model_ids),
                    "results": results,
                }
            ),
            200,
        )
    except (ValueError, KeyError) as e:
        logger.exception("Error in batch prediction")
        return jsonify({"error": str(e)}), 500


@app.route("/models/info", methods=["GET"])
def models_info():
    """Get information about available models."""
    return (
        jsonify(
            {
                "models": [
                    {
                        "id": 182,
                        "name": "Crypto/VASP/Cross-Border Classifier",
                        "type": "illicit_classifier",
                        "description": "Detects illicit crypto transactions, VASP attribution, cross-border routing",
                        "endpoint": "/models/predict/182",
                    },
                    {
                        "id": 183,
                        "name": "AML Detection",
                        "type": "aml_classifier",
                        "description": "Anti-Money Laundering transaction detection",
                        "endpoint": "/models/predict/183",
                    },
                    {
                        "id": 184,
                        "name": "Complaint Typology Classifier",
                        "type": "typology_classifier",
                        "description": "Consumer complaint classification and typology detection",
                        "endpoint": "/models/predict/184",
                    },
                ],
                "batch_endpoint": "/models/batch-predict",
                "status_endpoint": "/models/status",
            }
        ),
        200,
    )


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    logger.error(f"Internal server error: {error}")
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "False") == "True"

    logger.info(f"Starting Model Server on port {port}")
    logger.info("Available models: 182, 183, 184")
    logger.info("Documentation: GET /models/info")

    app.run(host="0.0.0.0", port=port, debug=debug)
