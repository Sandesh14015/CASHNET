"""Model Validation Pipeline.

Provides automated model testing, validation metrics, drift detection,
and model comparison capabilities.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ValidationStatus(StrEnum):
    """Validation status."""

    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    WARNING = "warning"
    ERROR = "error"


class MetricType(StrEnum):
    """Metric types."""

    ACCURACY = "accuracy"
    PRECISION = "precision"
    RECALL = "recall"
    F1_SCORE = "f1_score"
    AUC_ROC = "auc_roc"
    AUC_PR = "auc_pr"
    MSE = "mse"
    MAE = "mae"
    RMSE = "rmse"
    R_SQUARED = "r_squared"
    FALSE_POSITIVE_RATE = "false_positive_rate"
    FALSE_NEGATIVE_RATE = "false_negative_rate"
    LATENCY_P50 = "latency_p50"
    LATENCY_P95 = "latency_p95"
    LATENCY_P99 = "latency_p99"
    THROUGHPUT = "throughput"
    MEMORY_USAGE = "memory_usage"
    MODEL_SIZE = "model_size"
    CUSTOM = "custom"


class ValidationMetric(BaseModel):
    """A single validation metric."""

    metric_name: str
    metric_type: MetricType
    value: float

    # Thresholds
    threshold_min: float | None = None
    threshold_max: float | None = None
    is_required: bool = True

    # Status
    passed: bool = True
    deviation: float | None = None  # How far from threshold

    # Context
    dataset_name: str | None = None
    split: str | None = None  # "train", "validation", "test"
    metadata: dict[str, Any] = {}


class ValidationCheck(BaseModel):
    """A validation check configuration."""

    check_id: str
    name: str
    description: str
    check_type: (
        str  # "metric_threshold", "drift_detection", "bias_check", "fairness", "custom"
    )

    # Configuration
    config: dict[str, Any] = {}

    # Thresholds
    warning_threshold: float | None = None
    failure_threshold: float | None = None

    is_enabled: bool = True


class ValidationReport(BaseModel):
    """Model validation report."""

    report_id: str
    model_id: str
    model_version: str

    # Validation runs
    status: ValidationStatus = ValidationStatus.PENDING

    # Metrics
    metrics: list[ValidationMetric] = []

    # Checks
    checks_passed: int = 0
    checks_failed: int = 0
    checks_warning: int = 0
    total_checks: int = 0

    # Summary
    overall_score: float = 0.0  # 0-100
    recommendation: str = ""  # "approve", "reject", "review"

    # Comparison with baseline
    baseline_model_id: str | None = None
    comparison_metrics: dict[str, dict[str, float]] = (
        {}
    )  # metric -> {current, baseline, change}

    # Drift detection
    drift_detected: bool = False
    drift_details: dict[str, Any] = {}

    # Timestamps
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Metadata
    created_by: str = "system"
    notes: str | None = None
    metadata: dict[str, Any] = {}


class ModelValidationPipeline:
    """Automated model validation pipeline."""

    def __init__(self):
        self._reports: dict[str, ValidationReport] = {}
        self._model_index: dict[str, list[str]] = {}  # model_id -> [report_ids]
        self._checks: list[ValidationCheck] = []

        # Default validation checks
        self._setup_default_checks()

    def _setup_default_checks(self) -> None:
        """Setup default validation checks."""
        self._checks = [
            ValidationCheck(
                check_id="accuracy_threshold",
                name="Accuracy Threshold",
                description="Model accuracy must be >= 0.85",
                check_type="metric_threshold",
                config={
                    "metric_name": "accuracy",
                    "operator": "gte",
                    "value": 0.85,
                },
                warning_threshold=0.80,
                failure_threshold=0.75,
            ),
            ValidationCheck(
                check_id="precision_threshold",
                name="Precision Threshold",
                description="Model precision must be >= 0.80",
                check_type="metric_threshold",
                config={
                    "metric_name": "precision",
                    "operator": "gte",
                    "value": 0.80,
                },
                warning_threshold=0.75,
                failure_threshold=0.70,
            ),
            ValidationCheck(
                check_id="recall_threshold",
                name="Recall Threshold",
                description="Model recall must be >= 0.75",
                check_type="metric_threshold",
                config={
                    "metric_name": "recall",
                    "operator": "gte",
                    "value": 0.75,
                },
                warning_threshold=0.70,
                failure_threshold=0.65,
            ),
            ValidationCheck(
                check_id="f1_threshold",
                name="F1 Score Threshold",
                description="Model F1 score must be >= 0.78",
                check_type="metric_threshold",
                config={
                    "metric_name": "f1_score",
                    "operator": "gte",
                    "value": 0.78,
                },
                warning_threshold=0.73,
                failure_threshold=0.68,
            ),
            ValidationCheck(
                check_id="latency_p95",
                name="P95 Latency",
                description="P95 latency must be < 200ms",
                check_type="metric_threshold",
                config={
                    "metric_name": "latency_p95",
                    "operator": "lt",
                    "value": 200,
                },
                warning_threshold=150,
                failure_threshold=200,
            ),
            ValidationCheck(
                check_id="model_size",
                name="Model Size",
                description="Model size must be < 100MB",
                check_type="metric_threshold",
                config={
                    "metric_name": "model_size",
                    "operator": "lt",
                    "value": 100000000,  # 100MB in bytes
                },
                warning_threshold=50000000,
                failure_threshold=100000000,
            ),
            ValidationCheck(
                check_id="false_positive_rate",
                name="False Positive Rate",
                description="False positive rate must be < 0.10",
                check_type="metric_threshold",
                config={
                    "metric_name": "false_positive_rate",
                    "operator": "lt",
                    "value": 0.10,
                },
                warning_threshold=0.08,
                failure_threshold=0.10,
            ),
        ]

    def add_check(self, check: ValidationCheck) -> ValidationCheck:
        """Add a validation check."""
        self._checks.append(check)
        return check

    def remove_check(self, check_id: str) -> bool:
        """Remove a validation check."""
        initial_count = len(self._checks)
        self._checks = [c for c in self._checks if c.check_id != check_id]
        return len(self._checks) < initial_count

    def validate_model(
        self,
        model_id: str,
        model_version: str,
        metrics: dict[str, float],
        baseline_model_id: str | None = None,
        baseline_metrics: dict[str, float] | None = None,
        created_by: str = "system",
    ) -> ValidationReport:
        """Run validation on a model."""
        import uuid

        report = ValidationReport(
            report_id=str(uuid.uuid4()),
            model_id=model_id,
            model_version=model_version,
            started_at=datetime.now(UTC),
            created_by=created_by,
            baseline_model_id=baseline_model_id,
        )

        # Run checks
        for check in self._checks:
            if not check.is_enabled:
                continue

            metric_name = check.config.get("metric_name")
            operator = check.config.get("operator")
            threshold = check.config.get("value")

            if metric_name not in metrics:
                continue

            actual_value = metrics[metric_name]
            passed = self._evaluate_threshold(actual_value, operator, threshold)

            # Calculate deviation
            deviation = None
            if threshold is not None:
                deviation = actual_value - threshold

            # Determine status
            metric_passed = passed
            if not passed and check.failure_threshold is not None:
                metric_passed = self._evaluate_threshold(
                    actual_value, operator, check.failure_threshold
                )

            metric = ValidationMetric(
                metric_name=metric_name,
                metric_type=self._infer_metric_type(metric_name),
                value=actual_value,
                threshold_min=(
                    check.warning_threshold if operator in ["gte", "gt"] else None
                ),
                threshold_max=(
                    check.failure_threshold if operator in ["lt", "lte"] else None
                ),
                is_required=True,
                passed=metric_passed,
                deviation=deviation,
            )

            report.metrics.append(metric)

            if metric_passed:
                report.checks_passed += 1
            else:
                report.checks_failed += 1

            report.total_checks += 1

        # Compare with baseline
        if baseline_model_id and baseline_metrics:
            report.comparison_metrics = self._compare_metrics(metrics, baseline_metrics)

        # Calculate overall score
        report.overall_score = self._calculate_overall_score(report)

        # Generate recommendation
        report.recommendation = self._generate_recommendation(report)

        # Check for drift
        if baseline_metrics:
            report.drift_detected, report.drift_details = self._detect_drift(
                metrics, baseline_metrics
            )

        # Complete
        report.status = (
            ValidationStatus.PASSED
            if report.checks_failed == 0
            else ValidationStatus.FAILED
        )
        report.completed_at = datetime.now(UTC)

        # Store report
        self._reports[report.report_id] = report

        if model_id not in self._model_index:
            self._model_index[model_id] = []
        self._model_index[model_id].append(report.report_id)

        return report

    def get_report(self, report_id: str) -> ValidationReport | None:
        """Get a validation report."""
        return self._reports.get(report_id)

    def get_reports_for_model(self, model_id: str) -> list[ValidationReport]:
        """Get all validation reports for a model."""
        report_ids = self._model_index.get(model_id, [])
        return [self._reports[rid] for rid in report_ids if rid in self._reports]

    def get_latest_report(self, model_id: str) -> ValidationReport | None:
        """Get the latest validation report for a model."""
        reports = self.get_reports_for_model(model_id)
        if not reports:
            return None

        reports.sort(key=lambda r: r.created_at, reverse=True)
        return reports[0]

    def compare_models(
        self,
        model_id_a: str,
        model_id_b: str,
    ) -> dict[str, Any]:
        """Compare two models based on their latest validation reports."""
        report_a = self.get_latest_report(model_id_a)
        report_b = self.get_latest_report(model_id_b)

        if not report_a or not report_b:
            return {"error": "Both models must have validation reports"}

        comparison = {
            "model_a": model_id_a,
            "model_b": model_id_b,
            "report_a": report_a.report_id,
            "report_b": report_b.report_id,
            "metrics_comparison": {},
            "recommendation": "",
        }

        # Compare metrics
        metrics_a = {m.metric_name: m.value for m in report_a.metrics}
        metrics_b = {m.metric_name: m.value for m in report_b.metrics}

        all_metrics = set(metrics_a.keys()) | set(metrics_b.keys())

        for metric in all_metrics:
            val_a = metrics_a.get(metric)
            val_b = metrics_b.get(metric)

            if val_a is not None and val_b is not None:
                comparison["metrics_comparison"][metric] = {
                    "model_a": val_a,
                    "model_b": val_b,
                    "difference": val_b - val_a,
                    "better": "model_b" if val_b > val_a else "model_a",
                }

        # Overall recommendation
        if report_a.overall_score > report_b.overall_score:
            comparison["recommendation"] = f"Model A ({model_id_a}) performs better"
        elif report_b.overall_score > report_a.overall_score:
            comparison["recommendation"] = f"Model B ({model_id_b}) performs better"
        else:
            comparison["recommendation"] = "Models perform equally"

        return comparison

    def get_statistics(self) -> dict[str, Any]:
        """Get validation pipeline statistics."""
        reports = list(self._reports.values())

        if not reports:
            return {"total_reports": 0}

        # Count by status
        by_status = {}
        for r in reports:
            status = r.status.value
            by_status[status] = by_status.get(status, 0) + 1

        # Average score
        avg_score = sum(r.overall_score for r in reports) / len(reports)

        # Pass rate
        passed = sum(1 for r in reports if r.status == ValidationStatus.PASSED)
        pass_rate = passed / len(reports) if reports else 0

        # Drift detection rate
        drift_count = sum(1 for r in reports if r.drift_detected)

        return {
            "total_reports": len(reports),
            "by_status": by_status,
            "average_score": round(avg_score, 2),
            "pass_rate": round(pass_rate, 4),
            "drift_detected_count": drift_count,
            "total_checks": sum(r.total_checks for r in reports),
        }

    def _evaluate_threshold(
        self, value: float, operator: str, threshold: float
    ) -> bool:
        """Evaluate a threshold condition."""
        ops = {
            "gt": lambda v, t: v > t,
            "gte": lambda v, t: v >= t,
            "lt": lambda v, t: v < t,
            "lte": lambda v, t: v <= t,
            "eq": lambda v, t: v == t,
            "neq": lambda v, t: v != t,
        }
        if operator not in ops:
            return False
        return ops[operator](value, threshold)

    def _infer_metric_type(self, metric_name: str) -> MetricType:
        """Infer metric type from name."""
        mapping = {
            "accuracy": MetricType.ACCURACY,
            "precision": MetricType.PRECISION,
            "recall": MetricType.RECALL,
            "f1_score": MetricType.F1_SCORE,
            "f1": MetricType.F1_SCORE,
            "auc_roc": MetricType.AUC_ROC,
            "auc": MetricType.AUC_ROC,
            "mse": MetricType.MSE,
            "mae": MetricType.MAE,
            "rmse": MetricType.RMSE,
            "r_squared": MetricType.R_SQUARED,
            "false_positive_rate": MetricType.FALSE_POSITIVE_RATE,
            "false_negative_rate": MetricType.FALSE_NEGATIVE_RATE,
            "latency_p50": MetricType.LATENCY_P50,
            "latency_p95": MetricType.LATENCY_P95,
            "latency_p99": MetricType.LATENCY_P99,
            "throughput": MetricType.THROUGHPUT,
            "memory_usage": MetricType.MEMORY_USAGE,
            "model_size": MetricType.MODEL_SIZE,
        }
        return mapping.get(metric_name, MetricType.CUSTOM)

    def _compare_metrics(
        self,
        current: dict[str, float],
        baseline: dict[str, float],
    ) -> dict[str, dict[str, float]]:
        """Compare current metrics with baseline."""
        comparison = {}

        for metric_name in set(current.keys()) | set(baseline.keys()):
            current_val = current.get(metric_name)
            baseline_val = baseline.get(metric_name)

            if current_val is not None and baseline_val is not None:
                change = current_val - baseline_val
                pct_change = (change / baseline_val * 100) if baseline_val != 0 else 0

                comparison[metric_name] = {
                    "current": current_val,
                    "baseline": baseline_val,
                    "absolute_change": change,
                    "percent_change": round(pct_change, 2),
                }

        return comparison

    def _calculate_overall_score(self, report: ValidationReport) -> float:
        """Calculate overall validation score (0-100)."""
        if report.total_checks == 0:
            return 0.0

        # Base score from pass rate
        pass_rate = report.checks_passed / report.total_checks
        score = pass_rate * 70  # 70% weight for pass rate

        # Metric scores (30% weight)
        if report.metrics:
            metric_scores = []
            for metric in report.metrics:
                if metric.passed:
                    metric_scores.append(100)
                elif metric.deviation is not None:
                    # Partial credit based on how close to threshold
                    if metric.deviation > 0:
                        metric_scores.append(80)
                    else:
                        metric_scores.append(max(0, 50 + metric.deviation * 100))
                else:
                    metric_scores.append(0)

            avg_metric_score = sum(metric_scores) / len(metric_scores)
            score += avg_metric_score * 0.3

        return min(round(score, 2), 100)

    def _generate_recommendation(self, report: ValidationReport) -> str:
        """Generate recommendation based on validation results."""
        if report.overall_score >= 85 and report.checks_failed == 0:
            return "approve"
        elif report.overall_score >= 70 and report.checks_failed <= 1:
            return "review"
        elif report.drift_detected:
            return "investigate_drift"
        else:
            return "reject"

    def _detect_drift(
        self,
        current: dict[str, float],
        baseline: dict[str, float],
        threshold: float = 0.1,
    ) -> tuple[bool, dict[str, Any]]:
        """Detect metric drift between current and baseline."""
        drift_details = {}
        drift_detected = False

        for metric_name in set(current.keys()) & set(baseline.keys()):
            current_val = current[metric_name]
            baseline_val = baseline[metric_name]

            if baseline_val == 0:
                continue

            # Calculate relative change
            change = abs(current_val - baseline_val) / abs(baseline_val)

            if change > threshold:
                drift_detected = True
                drift_details[metric_name] = {
                    "current": current_val,
                    "baseline": baseline_val,
                    "relative_change": round(change, 4),
                    "severity": "high" if change > 0.2 else "medium",
                }

        return drift_detected, drift_details
