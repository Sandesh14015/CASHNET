"""Model Registry & Governance Service.

Provides model versioning, approval workflows, deployment management,
and governance tracking for ML models.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ModelStatus(StrEnum):
    """Model lifecycle status."""

    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    DEPLOYED = "deployed"
    ARCHIVED = "archived"
    DEPRECATED = "deprecated"


class DeploymentStage(StrEnum):
    """Deployment stages."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    CANARY = "canary"
    PRODUCTION = "production"
    SHADOW = "shadow"


class ModelType(StrEnum):
    """Model types."""

    CLASSIFICATION = "classification"
    REGRESSION = "regression"
    CLUSTERING = "clustering"
    ANOMALY_DETECTION = "anomaly_detection"
    NLP = "nlp"
    RULES_ENGINE = "rules_engine"
    ENSEMBLE = "ensemble"
    OTHER = "other"


class ArtifactType(StrEnum):
    """Model artifact types."""

    MODEL_WEIGHTS = "model_weights"
    MODEL_CONFIG = "model_config"
    TRAINING_DATA = "training_data"
    EVALUATION_REPORT = "evaluation_report"
    FEATURE_IMPORTANCE = "feature_importance"
    SCHEMA = "schema"
    REQUIREMENTS = "requirements"
    OTHER = "other"


class ModelArtifact(BaseModel):
    """A model artifact (file/reference)."""

    artifact_id: str
    artifact_type: ArtifactType
    name: str
    description: str | None = None

    # Storage
    storage_path: str  # S3/local path
    checksum: str  # SHA-256
    size_bytes: int = 0

    # Metadata
    mime_type: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = {}


class ApprovalRecord(BaseModel):
    """Model approval record."""

    approval_id: str
    reviewer_id: str
    reviewer_role: str
    decision: str  # "approved", "rejected", "changes_requested"
    comments: str | None = None
    decided_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    checklist: dict[str, bool] = {}  # Review checklist items


class ModelVersion(BaseModel):
    """A model version."""

    model_id: str
    model_name: str
    version: str  # Semantic version (e.g., "1.0.0")

    # Model details
    model_type: ModelType
    description: str | None = None
    use_case: str = ""  # What this model does

    # Status
    status: ModelStatus = ModelStatus.DRAFT

    # Artifacts
    artifacts: list[ModelArtifact] = []

    # Training info
    training_run_id: str | None = None
    training_data_hash: str | None = None

    # Performance metrics
    metrics: dict[str, float] = {}  # accuracy, precision, recall, f1, etc.
    benchmark_results: dict[str, Any] = {}

    # Approval
    approval_records: list[ApprovalRecord] = []
    approved_by: str | None = None
    approved_at: datetime | None = None

    # Deployment
    deployment_stage: DeploymentStage | None = None
    deployed_at: datetime | None = None
    endpoint_url: str | None = None

    # Governance
    risk_level: str = "medium"  # "low", "medium", "high", "critical"
    requires_human_review: bool = True
    audit_trail: list[dict[str, Any]] = []

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    created_by: str = ""

    # Dependencies
    parent_model_id: str | None = None
    tags: list[str] = []
    metadata: dict[str, Any] = {}


class ModelRegistry:
    """Central model registry with governance."""

    def __init__(self):
        self._models: dict[str, ModelVersion] = {}  # model_id -> ModelVersion
        self._name_index: dict[str, list[str]] = {}  # model_name -> [model_ids]
        self._status_index: dict[ModelStatus, list[str]] = {}  # status -> [model_ids]
        self._tag_index: dict[str, list[str]] = {}  # tag -> [model_ids]

    def register_model(
        self,
        model_name: str,
        version: str,
        model_type: ModelType,
        created_by: str,
        description: str | None = None,
        use_case: str = "",
        **kwargs,
    ) -> ModelVersion:
        """Register a new model version."""

        model_id = f"{model_name}:{version}"

        if model_id in self._models:
            raise ValueError(f"Model version already exists: {model_id}")

        model = ModelVersion(
            model_id=model_id,
            model_name=model_name,
            version=version,
            model_type=model_type,
            description=description,
            use_case=use_case,
            created_by=created_by,
            **kwargs,
        )

        # Store model
        self._models[model_id] = model

        # Update indexes
        if model_name not in self._name_index:
            self._name_index[model_name] = []
        self._name_index[model_name].append(model_id)

        if model.status not in self._status_index:
            self._status_index[model.status] = []
        self._status_index[model.status].append(model_id)

        # Audit
        model.audit_trail.append(
            {
                "action": "registered",
                "actor": created_by,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )

        return model

    def get_model(self, model_id: str) -> ModelVersion | None:
        """Get a model by ID."""
        return self._models.get(model_id)

    def get_model_versions(self, model_name: str) -> list[ModelVersion]:
        """Get all versions of a model."""
        model_ids = self._name_index.get(model_name, [])
        return [self._models[mid] for mid in model_ids if mid in self._models]

    def get_latest_version(self, model_name: str) -> ModelVersion | None:
        """Get the latest version of a model."""
        versions = self.get_model_versions(model_name)
        if not versions:
            return None

        # Sort by version (simple string sort for semver)
        versions.sort(key=lambda m: m.version, reverse=True)
        return versions[0]

    def get_deployed_version(self, model_name: str) -> ModelVersion | None:
        """Get the currently deployed version of a model."""
        versions = self.get_model_versions(model_name)
        deployed = [v for v in versions if v.status == ModelStatus.DEPLOYED]
        return deployed[0] if deployed else None

    def submit_for_review(self, model_id: str, submitted_by: str) -> ModelVersion:
        """Submit a model for review."""
        model = self._models.get(model_id)
        if not model:
            raise ValueError(f"Model not found: {model_id}")

        if model.status != ModelStatus.DRAFT:
            raise ValueError(f"Model must be in DRAFT status, got: {model.status}")

        model.status = ModelStatus.PENDING_REVIEW
        model.updated_at = datetime.now(UTC)

        model.audit_trail.append(
            {
                "action": "submitted_for_review",
                "actor": submitted_by,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )

        return model

    def approve_model(
        self,
        model_id: str,
        reviewer_id: str,
        reviewer_role: str,
        decision: str,
        comments: str | None = None,
        checklist: dict[str, bool] | None = None,
    ) -> ModelVersion:
        """Approve or reject a model."""
        model = self._models.get(model_id)
        if not model:
            raise ValueError(f"Model not found: {model_id}")

        if model.status not in [
            ModelStatus.PENDING_REVIEW,
            ModelStatus.PENDING_APPROVAL,
        ]:
            raise ValueError(f"Model not in review status, got: {model.status}")

        import uuid

        # Create approval record
        record = ApprovalRecord(
            approval_id=str(uuid.uuid4()),
            reviewer_id=reviewer_id,
            reviewer_role=reviewer_role,
            decision=decision,
            comments=comments,
            checklist=checklist or {},
        )

        model.approval_records.append(record)

        if decision == "approved":
            model.status = ModelStatus.APPROVED
            model.approved_by = reviewer_id
            model.approved_at = datetime.now(UTC)
        elif decision == "rejected":
            model.status = ModelStatus.REJECTED
        elif decision == "changes_requested":
            model.status = ModelStatus.DRAFT

        model.updated_at = datetime.now(UTC)

        model.audit_trail.append(
            {
                "action": f"review_{decision}",
                "actor": reviewer_id,
                "role": reviewer_role,
                "timestamp": datetime.now(UTC).isoformat(),
                "comments": comments,
            }
        )

        return model

    def deploy_model(
        self,
        model_id: str,
        stage: DeploymentStage,
        deployed_by: str,
        endpoint_url: str | None = None,
    ) -> ModelVersion:
        """Deploy a model to a stage."""
        model = self._models.get(model_id)
        if not model:
            raise ValueError(f"Model not found: {model_id}")

        if model.status != ModelStatus.APPROVED and stage == DeploymentStage.PRODUCTION:
            raise ValueError("Model must be approved before production deployment")

        model.status = ModelStatus.DEPLOYED
        model.deployment_stage = stage
        model.deployed_at = datetime.now(UTC)
        model.endpoint_url = endpoint_url
        model.updated_at = datetime.now(UTC)

        model.audit_trail.append(
            {
                "action": "deployed",
                "actor": deployed_by,
                "stage": stage.value,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )

        return model

    def archive_model(
        self, model_id: str, archived_by: str, reason: str
    ) -> ModelVersion:
        """Archive a model."""
        model = self._models.get(model_id)
        if not model:
            raise ValueError(f"Model not found: {model_id}")

        model.status = ModelStatus.ARCHIVED
        model.updated_at = datetime.now(UTC)

        model.audit_trail.append(
            {
                "action": "archived",
                "actor": archived_by,
                "reason": reason,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )

        return model

    def add_artifact(
        self,
        model_id: str,
        artifact_type: ArtifactType,
        name: str,
        storage_path: str,
        checksum: str,
        size_bytes: int = 0,
        description: str | None = None,
    ) -> ModelArtifact:
        """Add an artifact to a model."""
        import uuid

        model = self._models.get(model_id)
        if not model:
            raise ValueError(f"Model not found: {model_id}")

        artifact = ModelArtifact(
            artifact_id=str(uuid.uuid4()),
            artifact_type=artifact_type,
            name=name,
            storage_path=storage_path,
            checksum=checksum,
            size_bytes=size_bytes,
            description=description,
        )

        model.artifacts.append(artifact)
        model.updated_at = datetime.now(UTC)

        return artifact

    def update_metrics(
        self,
        model_id: str,
        metrics: dict[str, float],
        benchmark_results: dict[str, Any] | None = None,
    ) -> ModelVersion:
        """Update model performance metrics."""
        model = self._models.get(model_id)
        if not model:
            raise ValueError(f"Model not found: {model_id}")

        model.metrics.update(metrics)
        if benchmark_results:
            model.benchmark_results.update(benchmark_results)

        model.updated_at = datetime.now(UTC)

        return model

    def search_models(
        self,
        model_type: ModelType | None = None,
        status: ModelStatus | None = None,
        tag: str | None = None,
        use_case: str | None = None,
    ) -> list[ModelVersion]:
        """Search for models with filters."""
        results = list(self._models.values())

        if model_type:
            results = [m for m in results if m.model_type == model_type]
        if status:
            results = [m for m in results if m.status == status]
        if tag:
            results = [m for m in results if tag in m.tags]
        if use_case:
            results = [m for m in results if use_case.lower() in m.use_case.lower()]

        return results

    def get_statistics(self) -> dict[str, Any]:
        """Get registry statistics."""
        models = list(self._models.values())

        if not models:
            return {"total_models": 0}

        # Count by status
        by_status = {}
        for m in models:
            status = m.status.value
            by_status[status] = by_status.get(status, 0) + 1

        # Count by type
        by_type = {}
        for m in models:
            mtype = m.model_type.value
            by_type[mtype] = by_type.get(mtype, 0) + 1

        # Count by deployment stage
        by_stage = {}
        for m in models:
            if m.deployment_stage:
                stage = m.deployment_stage.value
                by_stage[stage] = by_stage.get(stage, 0) + 1

        # Unique model names
        unique_names = {m.model_name for m in models}

        return {
            "total_models": len(models),
            "unique_model_names": len(unique_names),
            "by_status": by_status,
            "by_type": by_type,
            "by_deployment_stage": by_stage,
            "deployed_count": by_status.get("deployed", 0),
            "pending_review_count": by_status.get("pending_review", 0)
            + by_status.get("pending_approval", 0),
        }

    def get_audit_trail(self, model_id: str) -> list[dict[str, Any]]:
        """Get audit trail for a model."""
        model = self._models.get(model_id)
        if not model:
            return []

        return model.audit_trail
