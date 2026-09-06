"""CashNet API Routes.

FastAPI router definitions for all CASHNET services. Provides endpoints
for case management, blockchain operations, ML/intelligence, and integrations.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, ClassVar

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

# ==================== Request/Response Models ====================


class HealthResponse(BaseModel):
    status: str = "healthy"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    version: str = "0.1.0"


class CaseInput(BaseModel):
    case_reference: str
    title: str
    fraud_type: str
    reported_amount: float
    currency: str = "INR"
    description: str | None = None
    priority: str = "MEDIUM"
    jurisdiction: str | None = None
    created_by: str


class CaseAssign(BaseModel):
    assigned_to: str
    reason: str | None = None


class AddressInput(BaseModel):
    address: str
    chain: str
    address_type: str = "WALLET"
    label: str | None = None
    case_id: str


class AnalysisRequest(BaseModel):
    case_id: str
    analysis_type: str = "FULL"  # "FULL", "TRACE", "ATTRIBUTION", "TIMELINE"
    parameters: dict[str, Any] = {}


class AdjudicationInput(BaseModel):
    finding_id: str
    decision: str  # "ACCEPTED", "REJECTED", "INCONCLUSIVE"
    comments: str | None = None
    decided_by: str


class EvidencePackageInput(BaseModel):
    case_id: str
    package_type: str
    title: str
    description: str | None = None
    created_by: str
    items: list[dict[str, Any]] = []


class ActionRequestInput(BaseModel):
    case_id: str
    action_type: str
    target_entity_id: str | None = None
    target_address: str | None = None
    target_jurisdiction: str | None = None
    priority: str = "MEDIUM"
    reason: str
    created_by: str


class ActionApproveInput(BaseModel):
    approver_id: str
    approver_role: str
    comments: str | None = None


class TagInput(BaseModel):
    name: str
    category: str
    color: str | None = None


class ClusterInput(BaseModel):
    name: str
    description: str | None = None
    cluster_type: str = "OWNED"
    address_ids: list[str]


class AlertAcknowledge(BaseModel):
    alert_id: str
    acknowledged_by: str
    notes: str | None = None


class WebhookPayload(BaseModel):
    event_type: str
    source: str
    data: dict[str, Any]
    timestamp: datetime | None = None


# ==================== Health ====================

health_router = APIRouter(tags=["health"])


@health_router.get("/healthz", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse()


# ==================== Service Singletons (Lazy) ====================


class ServiceRegistry:
    """Lazy-loaded service instances."""

    _instances: ClassVar[dict[str, Any]] = {}

    @classmethod
    def get(cls, service_name: str) -> Any:
        if service_name not in cls._instances:
            cls._instances[service_name] = cls._create(service_name)
        return cls._instances[service_name]

    @classmethod
    def _create(cls, service_name: str) -> Any:
        if service_name == "attribution":
            from services.blockchain.attribution import VASPAttributionService

            return VASPAttributionService()
        if service_name == "evidence":
            from services.blockchain.evidence import EvidenceService

            return EvidenceService()
        if service_name == "timeline":
            from services.blockchain.timeline import TimelineService

            return TimelineService()
        if service_name == "bridge":
            from services.blockchain.bridge import BridgeDetector

            return BridgeDetector()
        if service_name == "monitor":
            from services.blockchain.monitoring import ChainMonitor

            return ChainMonitor()
        if service_name == "notification":
            from services.integrations.notification import NotificationService

            return NotificationService()
        if service_name == "freshness":
            from services.integrations.freshness import FreshnessMonitor

            return FreshnessMonitor()
        if service_name == "sahyog":
            from services.integrations.sahyog import SAHYOGConnector

            return SAHYOGConnector({})
        if service_name == "ncrp":
            from services.integrations.ncrp import NCRPConnector

            return NCRPConnector({})
        if service_name == "vasp":
            from services.integrations.vasp import VASPConnector

            return VASPConnector({})
        if service_name == "approval":
            from services.integrations.approval import ApprovalWorkflow

            return ApprovalWorkflow()
        if service_name == "tracking":
            from services.integrations.tracking import PartnerTracker

            return PartnerTracker()
        if service_name == "escalation":
            from services.integrations.escalation import EscalationManager

            return EscalationManager()
        if service_name == "typology":
            from services.ml.typology import TypologyEngine

            return TypologyEngine()
        if service_name == "model_registry":
            from services.ml.model_registry import ModelRegistry

            return ModelRegistry()
        if service_name == "model_validation":
            from services.ml.model_validation import ModelValidationPipeline

            return ModelValidationPipeline()
        if service_name == "training":
            from services.ml.training import TrainingPipeline

            return TrainingPipeline()
        if service_name == "mixer":
            from services.ml.mixer_detection import MixerDetector

            return MixerDetector()
        if service_name == "enhanced_bridge":
            from services.ml.enhanced_bridge import EnhancedBridgeDetector

            return EnhancedBridgeDetector()
        if service_name == "realtime":
            from services.ml.notifications import RealtimeNotificationService

            return RealtimeNotificationService()
        if service_name == "intel_sharing":
            from services.ml.intelligence_sharing import CrossAgencySharingService

            return CrossAgencySharingService()
        raise ValueError(f"Unknown service: {service_name}")


# ==================== Cases ====================

cases_router = APIRouter(prefix="/cases", tags=["cases"])


@cases_router.post("", status_code=status.HTTP_201_CREATED)
async def create_case(case: CaseInput) -> dict[str, Any]:
    return {
        "case_id": str(uuid.uuid4()),
        "case_reference": case.case_reference,
        "title": case.title,
        "fraud_type": case.fraud_type,
        "reported_amount": case.reported_amount,
        "currency": case.currency,
        "priority": case.priority,
        "status": "NEW",
        "created_at": datetime.now(UTC).isoformat(),
        "created_by": case.created_by,
    }


@cases_router.get("")
async def list_cases(
    status: str | None = None,
    priority: str | None = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
) -> dict[str, Any]:
    return {
        "items": [],
        "total": 0,
        "limit": limit,
        "offset": offset,
        "filters": {"status": status, "priority": priority},
    }


@cases_router.get("/{case_id}")
async def get_case(case_id: str) -> dict[str, Any]:
    return {
        "case_id": case_id,
        "case_reference": f"CN-2026-{case_id[:8].upper()}",
        "title": "Sample Case",
        "status": "UNDER_ANALYSIS",
    }


@cases_router.post("/{case_id}/addresses", status_code=status.HTTP_201_CREATED)
async def add_addresses(case_id: str, addresses: list[AddressInput]) -> dict[str, Any]:
    return {
        "case_id": case_id,
        "added_count": len(addresses),
        "address_ids": [str(uuid.uuid4()) for _ in addresses],
    }


@cases_router.post("/{case_id}/assign")
async def assign_case(case_id: str, payload: CaseAssign) -> dict[str, Any]:
    return {
        "case_id": case_id,
        "assigned_to": payload.assigned_to,
        "reason": payload.reason,
        "assigned_at": datetime.now(UTC).isoformat(),
    }


# ==================== Analyses ====================

analyses_router = APIRouter(prefix="/analyses", tags=["analyses"])


@analyses_router.post("", status_code=status.HTTP_201_CREATED)
async def start_analysis(request: AnalysisRequest) -> dict[str, Any]:
    analysis_id = str(uuid.uuid4())
    return {
        "analysis_id": analysis_id,
        "case_id": request.case_id,
        "analysis_type": request.analysis_type,
        "status": "RUNNING",
        "started_at": datetime.now(UTC).isoformat(),
    }


@analyses_router.get("/{analysis_id}")
async def get_analysis(analysis_id: str) -> dict[str, Any]:
    return {
        "analysis_id": analysis_id,
        "status": "COMPLETED",
        "progress_percent": 100,
    }


# ==================== Findings ====================

findings_router = APIRouter(prefix="/findings", tags=["findings"])


@findings_router.get("")
async def list_findings(
    case_id: str | None = None,
    finding_type: str | None = None,
    limit: int = Query(50, le=500),
) -> dict[str, Any]:
    return {
        "items": [],
        "total": 0,
        "case_id": case_id,
        "finding_type": finding_type,
    }


@findings_router.get("/{finding_id}")
async def get_finding(finding_id: str) -> dict[str, Any]:
    return {
        "finding_id": finding_id,
        "finding_type": "VASP_ATTRIBUTION",
        "confidence": 0.85,
        "status": "PENDING",
    }


@findings_router.post(
    "/{finding_id}/adjudications", status_code=status.HTTP_201_CREATED
)
async def create_adjudication(
    finding_id: str, payload: AdjudicationInput
) -> dict[str, Any]:
    _ = ServiceRegistry.get("attribution")
    return {
        "adjudication_id": str(uuid.uuid4()),
        "finding_id": finding_id,
        "decision": payload.decision,
        "decided_by": payload.decided_by,
        "comments": payload.comments,
        "created_at": datetime.now(UTC).isoformat(),
    }


# ==================== Evidence Packages ====================

evidence_router = APIRouter(prefix="/evidence-packages", tags=["evidence"])


@evidence_router.post("", status_code=status.HTTP_201_CREATED)
async def create_evidence_package(payload: EvidencePackageInput) -> dict[str, Any]:
    service = ServiceRegistry.get("evidence")
    package = service.create_package(
        case_id=payload.case_id,
        package_type=payload.package_type,
        created_by=payload.created_by,
        title=payload.title,
        description=payload.description,
    )

    for item_data in payload.items:
        service.add_evidence_item(
            package.package_id,
            item_type=item_data.get("item_type", "OTHER"),
            content=item_data.get("content", {}),
            description=item_data.get("description"),
        )

    return {
        "package_id": package.package_id,
        "case_id": package.case_id,
        "package_type": package.package_type.value,
        "items_count": len(package.items),
    }


@evidence_router.get("/{package_id}")
async def get_evidence_package(package_id: str) -> dict[str, Any]:
    service = ServiceRegistry.get("evidence")
    package = service.get_package(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    return {
        "package_id": package.package_id,
        "case_id": package.case_id,
        "package_type": package.package_type.value,
        "items_count": len(package.items),
        "verification_status": package.verification_status.value,
        "is_sealed": package.is_sealed,
    }


@evidence_router.get("/{package_id}/verify")
async def verify_evidence_package(package_id: str) -> dict[str, Any]:
    service = ServiceRegistry.get("evidence")
    package = service.get_package(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")

    verification = service.verify_package(package_id)
    return verification


@evidence_router.post("/{package_id}/seal")
async def seal_evidence_package(package_id: str) -> dict[str, Any]:
    service = ServiceRegistry.get("evidence")
    package = service.seal_package(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    return {
        "package_id": package.package_id,
        "is_sealed": package.is_sealed,
        "content_hash": package.content_hash,
    }


@evidence_router.get("/{package_id}/export")
async def export_evidence_package(
    package_id: str,
    export_format: str = Query("json", pattern="^(json|html|csv)$"),
) -> dict[str, Any]:
    service = ServiceRegistry.get("evidence")
    try:
        from services.blockchain.evidence import ReportFormat

        fmt = ReportFormat(export_format)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid format") from None
    return service.export_package(package_id, fmt)


# ==================== Action Requests ====================

action_router = APIRouter(prefix="/action-requests", tags=["action-requests"])


@action_router.post("", status_code=status.HTTP_201_CREATED)
async def create_action_request(payload: ActionRequestInput) -> dict[str, Any]:
    approval = ServiceRegistry.get("approval")
    request = approval.create_request(
        action_type=payload.action_type,
        case_id=payload.case_id,
        requested_by=payload.created_by,
        target_entity=payload.target_entity_id,
        target_address=payload.target_address,
        target_jurisdiction=payload.target_jurisdiction,
        reason=payload.reason,
        priority=payload.priority,
    )
    return {
        "action_request_id": request.request_id,
        "status": request.status.value,
        "current_level": request.current_level.value,
    }


@action_router.post("/{request_id}/approve", status_code=status.HTTP_201_CREATED)
async def approve_action_request(
    request_id: str, payload: ActionApproveInput
) -> dict[str, Any]:
    approval = ServiceRegistry.get("approval")
    try:
        decision = approval.approve(
            request_id=request_id,
            approver_id=payload.approver_id,
            approver_role=payload.approver_role,
            comments=payload.comments,
        )
        return {
            "decision_id": decision.decision_id,
            "request_id": request_id,
            "decision": decision.decision.value,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@action_router.post("/{request_id}/reject", status_code=status.HTTP_201_CREATED)
async def reject_action_request(
    request_id: str, payload: ActionApproveInput
) -> dict[str, Any]:
    approval = ServiceRegistry.get("approval")
    try:
        decision = approval.reject(
            request_id=request_id,
            rejector_id=payload.approver_id,
            rejector_role=payload.approver_role,
            reason=payload.comments or "No reason provided",
        )
        return {
            "decision_id": decision.decision_id,
            "request_id": request_id,
            "decision": decision.decision.value,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@action_router.post("/{request_id}/send")
async def send_action_request(request_id: str) -> dict[str, Any]:
    _ = ServiceRegistry.get("vasp")
    return {
        "request_id": request_id,
        "sent_at": datetime.now(UTC).isoformat(),
        "status": "SENT",
    }


# ==================== Tags ====================

tags_router = APIRouter(prefix="/tags", tags=["tags"])


@tags_router.post("", status_code=status.HTTP_201_CREATED)
async def create_tag(payload: TagInput) -> dict[str, Any]:
    return {
        "tag_id": str(uuid.uuid4()),
        "name": payload.name,
        "category": payload.category,
        "color": payload.color,
        "created_at": datetime.now(UTC).isoformat(),
    }


@tags_router.get("")
async def list_tags() -> dict[str, Any]:
    return {
        "items": [
            {"name": "RANSOMWARE", "category": "FRAUD_TYPE", "color": "#FF0000"},
            {"name": "PHISHING", "category": "FRAUD_TYPE", "color": "#FF6600"},
            {"name": "INVESTMENT_SCAM", "category": "FRAUD_TYPE", "color": "#FFCC00"},
        ]
    }


# ==================== Clusters ====================

clusters_router = APIRouter(prefix="/clusters", tags=["clusters"])


@clusters_router.post("", status_code=status.HTTP_201_CREATED)
async def create_cluster(payload: ClusterInput) -> dict[str, Any]:
    _ = ServiceRegistry.get("attribution")
    return {
        "cluster_id": str(uuid.uuid4()),
        "name": payload.name,
        "cluster_type": payload.cluster_type,
        "member_count": len(payload.address_ids),
        "created_at": datetime.now(UTC).isoformat(),
    }


@clusters_router.get("")
async def list_clusters() -> dict[str, Any]:
    return {"items": [], "total": 0}


# ==================== Entities ====================

entities_router = APIRouter(prefix="/entities", tags=["entities"])


@entities_router.get("/{entity_id}")
async def get_entity(entity_id: str) -> dict[str, Any]:
    return {
        "entity_id": entity_id,
        "name": "Sample Entity",
        "entity_type": "EXCHANGE",
        "risk_category": "MEDIUM",
    }


# ==================== Alerts ====================

alerts_router = APIRouter(prefix="/alerts", tags=["alerts"])


@alerts_router.post("/{alert_id}/acknowledge", status_code=status.HTTP_201_CREATED)
async def acknowledge_alert(alert_id: str, payload: AlertAcknowledge) -> dict[str, Any]:
    return {
        "alert_id": alert_id,
        "acknowledged_by": payload.acknowledged_by,
        "acknowledged_at": datetime.now(UTC).isoformat(),
    }


@alerts_router.get("")
async def list_alerts() -> dict[str, Any]:
    return {"items": [], "total": 0}


# ==================== Webhooks ====================

webhooks_router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@webhooks_router.post("/sahyog")
async def sahyog_webhook(payload: WebhookPayload) -> dict[str, Any]:
    return {
        "received": True,
        "source": payload.source,
        "event_type": payload.event_type,
        "received_at": datetime.now(UTC).isoformat(),
    }


@webhooks_router.post("/ncrp")
async def ncrp_webhook(payload: WebhookPayload) -> dict[str, Any]:
    return {
        "received": True,
        "source": payload.source,
        "event_type": payload.event_type,
        "received_at": datetime.now(UTC).isoformat(),
    }


@webhooks_router.post("/vasp")
async def vasp_webhook(payload: WebhookPayload) -> dict[str, Any]:
    return {
        "received": True,
        "source": payload.source,
        "event_type": payload.event_type,
        "received_at": datetime.now(UTC).isoformat(),
    }


# ==================== ML / Intelligence ====================

ml_router = APIRouter(prefix="/ml", tags=["ml"])


@ml_router.post("/typology/detect")
async def detect_typologies(
    case_id: str | None = None,
    transaction: dict[str, Any] | None = None,
    known_addresses: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    if known_addresses is None:
        known_addresses = {}
    if transaction is None:
        transaction = {}
    engine = ServiceRegistry.get("typology")

    known_sets = {
        "known_mixers": set(known_addresses.get("mixers", [])),
        "darknet_addresses": set(known_addresses.get("darknet", [])),
        "sanctioned_addresses": set(known_addresses.get("sanctioned", [])),
    }
    matches = engine.evaluate_transaction(transaction, known_addresses=known_sets)

    return {
        "case_id": case_id,
        "matches_count": len(matches),
        "matches": [
            {
                "match_id": m.match_id,
                "rule_id": m.rule_id,
                "rule_name": m.rule_name,
                "category": m.category.value,
                "confidence": m.confidence,
                "severity": m.severity.value,
            }
            for m in matches
        ],
    }


@ml_router.post("/mixer/check")
async def check_mixer(
    address: str,
    chain: str,
    transaction_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    detector = ServiceRegistry.get("mixer")
    signals = detector.check_address(address, chain, transaction_data)
    return {
        "address": address,
        "chain": chain,
        "signals_count": len(signals),
        "signals": [
            {
                "signal_id": s.signal_id,
                "mixer_type": s.mixer_type.value,
                "confidence": s.confidence,
                "risk_level": s.risk_level.value,
            }
            for s in signals
        ],
    }


@ml_router.post("/bridge/detect")
async def detect_bridge_patterns(transaction: dict[str, Any]) -> dict[str, Any]:
    detector = ServiceRegistry.get("enhanced_bridge")
    patterns = detector.detect_patterns(transaction)
    return {
        "patterns_count": len(patterns),
        "patterns": [
            {
                "pattern_id": p.pattern_id,
                "pattern_type": p.pattern_type.value,
                "protocol": p.protocol.value,
                "confidence": p.confidence,
            }
            for p in patterns
        ],
    }


# ==================== Models ====================

models_router = APIRouter(prefix="/models", tags=["models"])


@models_router.get("")
async def list_models() -> dict[str, Any]:
    registry = ServiceRegistry.get("model_registry")
    models = registry.list_models()
    return {
        "total": len(models),
        "models": [
            {
                "model_id": m.model_id,
                "model_name": m.model_name,
                "version": m.version,
                "status": m.status.value,
                "deployment_stage": (
                    m.deployment_stage.value if m.deployment_stage else None
                ),
            }
            for m in models
        ],
    }


@models_router.post("")
async def register_model(
    model_name: str,
    version: str,
    model_type: str,
    created_by: str,
    description: str | None = None,
) -> dict[str, Any]:
    from services.ml.model_registry import ModelType

    registry = ServiceRegistry.get("model_registry")
    model = registry.register_model(
        model_name=model_name,
        version=version,
        model_type=ModelType(model_type),
        created_by=created_by,
        description=description or "",
    )
    return {"model_id": model.model_id, "status": model.status.value}


@models_router.post("/{model_id}/validate")
async def validate_model(
    model_id: str,
    metrics: dict[str, float],
    baseline_metrics: dict[str, float] | None = None,
) -> dict[str, Any]:
    pipeline = ServiceRegistry.get("model_validation")
    report = pipeline.validate_model(
        model_id=model_id,
        model_version=model_id,
        metrics=metrics,
        baseline_metrics=baseline_metrics,
    )
    return {
        "status": report.status.value,
        "overall_score": report.overall_score,
        "recommendation": report.recommendation,
        "checks_passed": report.checks_passed,
        "total_checks": report.total_checks,
    }


# ==================== Training ====================

training_router = APIRouter(prefix="/training", tags=["training"])


@training_router.post("/runs", status_code=status.HTTP_201_CREATED)
async def create_training_run(
    model_name: str,
    config: dict[str, Any],
    triggered_by: str,
) -> dict[str, Any]:
    from services.ml.training import TrainingConfig

    pipeline = ServiceRegistry.get("training")
    run = pipeline.create_run(
        model_name=model_name,
        config=TrainingConfig(**config),
        triggered_by=triggered_by,
    )
    return {
        "run_id": run.run_id,
        "status": run.status.value,
    }


@training_router.get("/runs/{run_id}")
async def get_training_run(run_id: str) -> dict[str, Any]:
    pipeline = ServiceRegistry.get("training")
    run = pipeline.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "run_id": run.run_id,
        "status": run.status.value,
        "metrics": run.metrics,
    }


# ==================== Freshness Monitoring ====================

freshness_router = APIRouter(prefix="/freshness", tags=["freshness"])


@freshness_router.get("/overview")
async def get_freshness_overview() -> dict[str, Any]:
    monitor = ServiceRegistry.get("freshness")
    return monitor.get_global_overview()


@freshness_router.get("/chains")
async def get_chain_freshness() -> dict[str, Any]:
    _ = ServiceRegistry.get("freshness")
    return {
        "chains": [
            {
                "chain": "ethereum",
                "status": "FRESH",
                "lag_seconds": 12,
                "current_block": 18500000,
            }
        ]
    }


# ==================== Notifications ====================

notifications_router = APIRouter(prefix="/notifications", tags=["notifications"])


@notifications_router.get("")
async def list_notifications() -> dict[str, Any]:
    realtime = ServiceRegistry.get("realtime")
    return realtime.get_statistics()


@notifications_router.post("/send")
async def send_notification(
    recipient_id: str,
    subject: str,
    body: str,
    channel: str = "email",
) -> dict[str, Any]:
    from services.ml.notifications import MessageChannel

    realtime = ServiceRegistry.get("realtime")
    notification = realtime.send_immediate(
        recipient_id=recipient_id,
        subject=subject,
        body=body,
        channel=MessageChannel(channel),
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Recipient not found or inactive")
    return {
        "notification_id": notification.notification_id,
        "status": notification.status.value,
    }


# ==================== Intelligence Sharing ====================

intelligence_router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@intelligence_router.post("/share", status_code=status.HTTP_201_CREATED)
async def share_intelligence(
    case_id: str,
    title: str,
    findings: list[dict[str, Any]],
    addresses: list[str],
    transactions: list[dict[str, Any]],
    classification: str,
    recipients: list[str],
    created_by: str,
    description: str | None = None,
    policy_id: str = "default_internal",
) -> dict[str, Any]:
    from services.ml.intelligence_sharing import ClassificationLevel

    service = ServiceRegistry.get("intel_sharing")
    try:
        package = service.share_intelligence(
            case_id=case_id,
            title=title,
            description=description,
            findings=findings,
            addresses=addresses,
            transactions=transactions,
            classification=ClassificationLevel(classification),
            recipients=recipients,
            created_by=created_by,
            policy_id=policy_id,
        )
        return {
            "package_id": package.package_id,
            "status": package.status.value,
            "recipients": package.recipients,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@intelligence_router.post("/{package_id}/approve")
async def approve_intelligence_package(
    package_id: str,
    approver_id: str,
    comments: str | None = None,
) -> dict[str, Any]:
    service = ServiceRegistry.get("intel_sharing")
    try:
        package = service.approve_sharing(package_id, approver_id, comments)
        return {
            "package_id": package.package_id,
            "status": package.status.value,
            "approved_by": package.approved_by,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@intelligence_router.post("/{package_id}/acknowledge")
async def acknowledge_intelligence(
    package_id: str,
    agency_id: str,
    actor: str,
) -> dict[str, Any]:
    service = ServiceRegistry.get("intel_sharing")
    try:
        record = service.acknowledge_receipt(package_id, agency_id, actor)
        return {
            "record_id": record.record_id,
            "status": record.status.value,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ==================== Main Router ====================


def get_api_router() -> APIRouter:
    """Aggregate all routers into a single API router."""
    main = APIRouter()
    main.include_router(health_router)
    main.include_router(cases_router)
    main.include_router(analyses_router)
    main.include_router(findings_router)
    main.include_router(evidence_router)
    main.include_router(action_router)
    main.include_router(tags_router)
    main.include_router(clusters_router)
    main.include_router(entities_router)
    main.include_router(alerts_router)
    main.include_router(webhooks_router)
    main.include_router(ml_router)
    main.include_router(models_router)
    main.include_router(training_router)
    main.include_router(freshness_router)
    main.include_router(notifications_router)
    main.include_router(intelligence_router)
    return main
