#!/usr/bin/env python3
"""Train and Package Models for Deployment.

This script:
1. Trains all three models (182, 183, 184)
2. Generates PKL artifacts
3. Creates model metadata
4. Verifies model loading
5. Outputs deployment manifest

Run this locally or in build pipeline to pre-generate models.
Usage: python scripts/train_and_package_models.py
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

# Add project root
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import lib.io_utils as io
import lib.model_manager as mm

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def train_and_package_models() -> dict[str, dict]:
    """Train all models and create deployment manifest."""
    logger.info("=" * 80)
    logger.info("CASHNET MODEL TRAINING AND PACKAGING")
    logger.info("=" * 80)

    # Ensure directories exist
    io.ensure_dirs()

    results = {}

    for model_id in [182, 183, 184]:
        logger.info(f"\n{'=' * 60}")
        logger.info(f"Processing Model {model_id}")
        logger.info("=" * 60)

        try:
            # Train/load model
            logger.info(f"Loading model {model_id}...")
            _, metadata = mm.load_or_train_model(model_id, force_retrain=False)

            # Verify model exists
            model_path = io.MODELS_DIR / f"{model_id}_model.pkl"
            if model_path.exists():
                file_size_mb = model_path.stat().st_size / (1024 * 1024)
                logger.info(
                    f"✓ Model file exists: {model_path} ({file_size_mb:.2f} MB)"
                )
            else:
                logger.warning(f"✗ Model file not found: {model_path}")

            # Test prediction
            logger.info(f"Testing prediction with model {model_id}...")
            test_record = {
                "risk_score": 0.5,
                "transaction_count": 100,
                "amount": 10000.0,
                "age_days": 30,
            }
            prediction = mm.predict(model_id, test_record)
            logger.info(f"✓ Prediction successful: {prediction}")

            results[str(model_id)] = {
                "status": "success",
                "model_path": str(model_path),
                "file_size_mb": file_size_mb if model_path.exists() else 0,
                "metadata": metadata,
                "prediction_test": prediction,
            }

            logger.info(f"✓ Model {model_id} ready for deployment")

        except Exception as e:
            logger.error(f"✗ Error processing model {model_id}: {e}", exc_info=True)
            results[str(model_id)] = {
                "status": "error",
                "error": str(e),
            }

    # Create deployment manifest
    logger.info(f"\n{'=' * 60}")
    logger.info("Creating Deployment Manifest")
    logger.info("=" * 60)

    manifest = {
        "version": "1.0.0",
        "timestamp": mm.datetime.now(mm.timezone.utc).isoformat(),
        "models_dir": str(io.MODELS_DIR),
        "models": results,
        "summary": {
            "total": 3,
            "successful": sum(1 for r in results.values() if r["status"] == "success"),
            "failed": sum(1 for r in results.values() if r["status"] == "error"),
        },
        "deployment_instructions": {
            "backend": "Include models directory in deployment package",
            "docker": "Copy models/ directory in Dockerfile: COPY models /app/models/",
            "render": "Upload models as build output or pre-warm on first request",
            "environment": {
                "MODELS_DIR": "/app/models/",
                "PYTHON_SERVICE_URL": "http://localhost:5000",
            },
        },
    }

    # Save manifest
    manifest_path = ROOT / "MODEL_MANIFEST.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    logger.info(f"✓ Manifest saved: {manifest_path}")

    # Print summary
    logger.info(f"\n{'=' * 80}")
    logger.info("SUMMARY")
    logger.info("=" * 80)
    logger.info(f"Successful: {manifest['summary']['successful']}/3")
    logger.info(f"Failed: {manifest['summary']['failed']}/3")
    logger.info(f"Models Directory: {io.MODELS_DIR}")
    logger.info(f"Manifest: {manifest_path}")

    # List files
    logger.info("\nGenerated Model Files:")
    for model_file in sorted(io.MODELS_DIR.glob("*_model.pkl")):
        size_mb = model_file.stat().st_size / (1024 * 1024)
        logger.info(f"  - {model_file.name} ({size_mb:.2f} MB)")

    logger.info("\n" + "=" * 80)
    logger.info("MODEL PACKAGING COMPLETE")
    logger.info("=" * 80)
    logger.info("\nNext steps:")
    logger.info("1. Include models/ directory in your deployment")
    logger.info("2. Start model server: python scripts/model_server.py")
    logger.info("3. Configure backend to use model endpoints")
    logger.info("4. Frontend can now call /api/models/predict/* endpoints")

    return manifest


if __name__ == "__main__":
    try:
        manifest = train_and_package_models()
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)
