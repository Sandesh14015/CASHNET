"""ML Training Pipeline Service.

Provides data preparation, model training, hyperparameter tuning,
evaluation, and experiment tracking capabilities.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class TrainingStatus(StrEnum):
    """Training run status."""

    PENDING = "pending"
    PREPARING_DATA = "preparing_data"
    TRAINING = "training"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DatasetSplit(StrEnum):
    """Dataset split types."""

    TRAIN = "train"
    VALIDATION = "validation"
    TEST = "test"


class DataType(StrEnum):
    """Data source types."""

    TRANSACTIONS = "transactions"
    ADDRESSES = "addresses"
    LABELS = "labels"
    FEATURES = "features"
    GRAPH = "graph"
    TEMPORAL = "temporal"
    COMBINED = "combined"


class TrainingConfig(BaseModel):
    """Training configuration."""

    # Model parameters
    model_type: str  # "random_forest", "gradient_boosting", "neural_network", etc.
    model_params: dict[str, Any] = {}

    # Training parameters
    epochs: int | None = None
    batch_size: int | None = None
    learning_rate: float | None = None

    # Data parameters
    feature_columns: list[str] = []
    target_column: str = ""
    data_types: list[DataType] = []

    # Split ratios
    train_ratio: float = 0.7
    validation_ratio: float = 0.15
    test_ratio: float = 0.15

    # Preprocessing
    normalize: bool = True
    handle_imbalance: bool = True
    imbalance_method: str = (
        "smote"  # "smote", "undersample", "oversample", "class_weights"
    )

    # Validation
    cross_validation_folds: int = 5

    # Hyperparameter tuning
    tune_hyperparameters: bool = False
    tuning_method: str = "grid"  # "grid", "random", "bayesian"
    tuning_params: dict[str, Any] = {}

    # Reproducibility
    random_seed: int = 42

    # Metadata
    experiment_name: str | None = None
    tags: list[str] = []
    notes: str | None = None


class DatasetInfo(BaseModel):
    """Dataset information."""

    dataset_id: str
    data_type: DataType
    name: str

    # Size
    total_records: int = 0
    feature_count: int = 0

    # Splits
    splits: dict[DatasetSplit, int] = {}  # split -> record count

    # Statistics
    class_distribution: dict[str, int] = {}  # For classification
    feature_statistics: dict[str, dict[str, float]] = {}  # feature -> stats

    # Quality
    missing_values_pct: float = 0.0
    duplicate_pct: float = 0.0

    # Hash
    data_hash: str = ""

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = {}


class TrainingMetrics(BaseModel):
    """Training metrics."""

    # Loss
    train_loss: list[float] = []
    val_loss: list[float] = []

    # Metrics per epoch
    train_metrics: list[dict[str, float]] = []
    val_metrics: list[dict[str, float]] = []

    # Best epoch
    best_epoch: int | None = None
    best_val_score: float | None = None

    # Final metrics
    final_train_score: float | None = None
    final_val_score: float | None = None

    # Timing
    epoch_times: list[float] = []
    total_training_time: float = 0.0


class EvaluationResults(BaseModel):
    """Model evaluation results."""

    # Test set metrics
    test_metrics: dict[str, float] = {}

    # Confusion matrix
    confusion_matrix: list[list[int]] | None = None
    class_labels: list[str] = []

    # Per-class metrics
    per_class_metrics: dict[str, dict[str, float]] = {}

    # ROC/PR curves data
    roc_auc: float | None = None
    pr_auc: float | None = None

    # Feature importance
    feature_importance: dict[str, float] = {}

    # Threshold analysis
    optimal_threshold: float | None = None
    threshold_analysis: dict[str, dict[str, float]] = {}


class TrainingRun(BaseModel):
    """A training run."""

    run_id: str
    model_name: str

    # Configuration
    config: TrainingConfig

    # Status
    status: TrainingStatus = TrainingStatus.PENDING

    # Data
    dataset_info: DatasetInfo | None = None

    # Metrics
    training_metrics: TrainingMetrics | None = None
    evaluation_results: EvaluationResults | None = None

    # Model output
    model_path: str | None = None
    model_hash: str | None = None

    # Timing
    started_at: datetime | None = None
    completed_at: datetime | None = None

    # Error
    error_message: str | None = None

    # Metadata
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    tags: list[str] = []
    metadata: dict[str, Any] = {}


class TrainingPipeline:
    """ML Training Pipeline."""

    def __init__(self):
        self._runs: dict[str, TrainingRun] = {}
        self._model_index: dict[str, list[str]] = {}  # model_name -> [run_ids]
        self._experiment_index: dict[str, list[str]] = {}  # experiment -> [run_ids]

    def create_run(
        self,
        model_name: str,
        config: TrainingConfig,
        created_by: str = "",
    ) -> TrainingRun:
        """Create a new training run."""
        import uuid

        run = TrainingRun(
            run_id=str(uuid.uuid4()),
            model_name=model_name,
            config=config,
            created_by=created_by,
        )

        # Store run
        self._runs[run.run_id] = run

        # Update indexes
        if model_name not in self._model_index:
            self._model_index[model_name] = []
        self._model_index[model_name].append(run.run_id)

        if config.experiment_name:
            if config.experiment_name not in self._experiment_index:
                self._experiment_index[config.experiment_name] = []
            self._experiment_index[config.experiment_name].append(run.run_id)

        return run

    def prepare_data(
        self,
        run_id: str,
        data_source: str,
        data_type: DataType,
        feature_columns: list[str],
        target_column: str,
    ) -> DatasetInfo:
        """Prepare data for training."""
        import hashlib
        import uuid

        run = self._runs.get(run_id)
        if not run:
            raise ValueError(f"Run not found: {run_id}")

        run.status = TrainingStatus.PREPARING_DATA
        run.started_at = datetime.now(UTC)

        # Simulate data preparation (in production, this would load and process data)
        dataset = DatasetInfo(
            dataset_id=str(uuid.uuid4()),
            data_type=data_type,
            name=f"{data_type.value}_dataset",
            total_records=10000,  # Placeholder
            feature_count=len(feature_columns),
            data_hash=hashlib.sha256(f"{data_source}:{data_type}".encode()).hexdigest()[
                :16
            ],
        )

        # Simulate splits
        total = dataset.total_records
        train_count = int(total * run.config.train_ratio)
        val_count = int(total * run.config.validation_ratio)
        test_count = total - train_count - val_count

        dataset.splits = {
            DatasetSplit.TRAIN: train_count,
            DatasetSplit.VALIDATION: val_count,
            DatasetSplit.TEST: test_count,
        }

        # Simulate class distribution
        dataset.class_distribution = {
            "legitimate": int(train_count * 0.95),
            "fraudulent": int(train_count * 0.05),
        }

        run.dataset_info = dataset

        return dataset

    def start_training(self, run_id: str) -> TrainingRun:
        """Start model training."""
        run = self._runs.get(run_id)
        if not run:
            raise ValueError(f"Run not found: {run_id}")

        run.status = TrainingStatus.TRAINING

        # Simulate training metrics
        metrics = TrainingMetrics()

        # Simulate epochs
        num_epochs = run.config.epochs or 50
        best_val_score = 0.0

        for epoch in range(num_epochs):
            # Simulate decreasing loss
            train_loss = 1.0 / (epoch + 1) + 0.1 * (1.0 / (epoch + 1))
            val_loss = 1.0 / (epoch + 1) + 0.15 * (1.0 / (epoch + 1))

            metrics.train_loss.append(train_loss)
            metrics.val_loss.append(val_loss)

            # Simulate improving metrics
            train_score = min(0.95, 0.5 + epoch * 0.01 + 0.05 * (epoch / num_epochs))
            val_score = min(0.92, 0.48 + epoch * 0.009 + 0.04 * (epoch / num_epochs))

            metrics.train_metrics.append(
                {"accuracy": train_score, "f1": train_score * 0.95}
            )
            metrics.val_metrics.append({"accuracy": val_score, "f1": val_score * 0.93})

            if val_score > best_val_score:
                best_val_score = val_score
                metrics.best_epoch = epoch
                metrics.best_val_score = val_score

            metrics.epoch_times.append(1.5)  # Simulated epoch time

        metrics.final_train_score = metrics.train_metrics[-1]["accuracy"]
        metrics.final_val_score = metrics.val_metrics[-1]["accuracy"]
        metrics.total_training_time = sum(metrics.epoch_times)

        run.training_metrics = metrics

        return run

    def evaluate_model(self, run_id: str) -> EvaluationResults:
        """Evaluate the trained model."""
        run = self._runs.get(run_id)
        if not run:
            raise ValueError(f"Run not found: {run_id}")

        run.status = TrainingStatus.EVALUATING

        # Simulate evaluation results
        results = EvaluationResults(
            test_metrics={
                "accuracy": 0.92,
                "precision": 0.88,
                "recall": 0.85,
                "f1_score": 0.865,
                "auc_roc": 0.94,
                "false_positive_rate": 0.03,
                "false_negative_rate": 0.15,
            },
            confusion_matrix=[
                [9450, 50],  # True negatives, false positives
                [75, 425],  # False negatives, true positives
            ],
            class_labels=["legitimate", "fraudulent"],
            per_class_metrics={
                "legitimate": {"precision": 0.99, "recall": 0.99, "f1": 0.99},
                "fraudulent": {"precision": 0.89, "recall": 0.85, "f1": 0.87},
            },
            roc_auc=0.94,
            pr_auc=0.82,
            feature_importance={
                "transaction_value": 0.25,
                "velocity_24h": 0.20,
                "address_risk_score": 0.18,
                "time_of_day": 0.12,
                "counterparty_count": 0.10,
                "chain_risk_score": 0.08,
                "token_type": 0.07,
            },
            optimal_threshold=0.45,
        )

        run.evaluation_results = results
        run.status = TrainingStatus.COMPLETED
        run.completed_at = datetime.now(UTC)

        return results

    def get_run(self, run_id: str) -> TrainingRun | None:
        """Get a training run."""
        return self._runs.get(run_id)

    def get_runs_for_model(self, model_name: str) -> list[TrainingRun]:
        """Get all training runs for a model."""
        run_ids = self._model_index.get(model_name, [])
        return [self._runs[rid] for rid in run_ids if rid in self._runs]

    def get_runs_for_experiment(self, experiment_name: str) -> list[TrainingRun]:
        """Get all training runs for an experiment."""
        run_ids = self._experiment_index.get(experiment_name, [])
        return [self._runs[rid] for rid in run_ids if rid in self._runs]

    def get_best_run(
        self,
        model_name: str,
        metric: str = "f1_score",
    ) -> TrainingRun | None:
        """Get the best training run for a model based on a metric."""
        runs = self.get_runs_for_model(model_name)
        completed = [r for r in runs if r.status == TrainingStatus.COMPLETED]

        if not completed:
            return None

        # Sort by metric
        def get_metric(run: TrainingRun) -> float:
            if run.evaluation_results:
                return run.evaluation_results.test_metrics.get(metric, 0.0)
            return 0.0

        completed.sort(key=get_metric, reverse=True)
        return completed[0]

    def cancel_run(self, run_id: str) -> TrainingRun:
        """Cancel a training run."""
        run = self._runs.get(run_id)
        if not run:
            raise ValueError(f"Run not found: {run_id}")

        if run.status in [
            TrainingStatus.COMPLETED,
            TrainingStatus.FAILED,
            TrainingStatus.CANCELLED,
        ]:
            raise ValueError(f"Cannot cancel run in status: {run.status}")

        run.status = TrainingStatus.CANCELLED
        run.completed_at = datetime.now(UTC)

        return run

    def compare_runs(
        self,
        run_ids: list[str],
    ) -> dict[str, Any]:
        """Compare multiple training runs."""
        runs = [self._runs[rid] for rid in run_ids if rid in self._runs]

        if len(runs) < 2:
            return {"error": "At least 2 runs required for comparison"}

        comparison = {
            "run_ids": run_ids,
            "model_name": runs[0].model_name,
            "runs": [],
        }

        for run in runs:
            run_info = {
                "run_id": run.run_id,
                "status": run.status.value,
                "config_summary": {
                    "model_type": run.config.model_type,
                    "epochs": run.config.epochs,
                    "learning_rate": run.config.learning_rate,
                },
                "metrics": {},
                "duration": None,
            }

            if run.evaluation_results:
                run_info["metrics"] = run.evaluation_results.test_metrics

            if run.started_at and run.completed_at:
                duration = (run.completed_at - run.started_at).total_seconds()
                run_info["duration"] = duration

            comparison["runs"].append(run_info)

        return comparison

    def get_statistics(self) -> dict[str, Any]:
        """Get training pipeline statistics."""
        runs = list(self._runs.values())

        if not runs:
            return {"total_runs": 0}

        # Count by status
        by_status = {}
        for r in runs:
            status = r.status.value
            by_status[status] = by_status.get(status, 0) + 1

        # Count by model
        by_model = {}
        for r in runs:
            model = r.model_name
            by_model[model] = by_model.get(model, 0) + 1

        # Average training time
        durations = []
        for r in runs:
            if r.started_at and r.completed_at:
                duration = (r.completed_at - r.started_at).total_seconds()
                durations.append(duration)

        avg_duration = sum(durations) / len(durations) if durations else 0

        return {
            "total_runs": len(runs),
            "by_status": by_status,
            "by_model": by_model,
            "average_duration_seconds": round(avg_duration, 2),
            "completed_count": by_status.get("completed", 0),
            "failed_count": by_status.get("failed", 0),
        }
