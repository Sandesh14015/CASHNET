"""CashNet ML & Intelligence Services.

Provides typology detection, model governance, validation pipelines,
training pipelines, and advanced fraud detection capabilities.
"""

from .enhanced_bridge import (
    BridgePattern,
    BridgeProtocol,
    EnhancedBridgeDetector,
    SwapPattern,
    SwapProtocol,
)
from .intelligence_sharing import (
    AccessLogEntry,
    Agency,
    ClassificationLevel,
    CrossAgencySharingService,
    IntelligencePackage,
    IntelligenceRecord,
    RedactionAction,
    RedactionRule,
    ShareStatus,
    SharingPolicy,
    SharingScope,
)
from .mixer_detection import (
    MixerDetector,
    MixerRiskLevel,
    MixerSignal,
    MixerType,
)
from .model_registry import (
    DeploymentStage,
    ModelArtifact,
    ModelRegistry,
    ModelStatus,
    ModelType,
    ModelVersion,
)
from .model_validation import (
    ModelValidationPipeline,
    ValidationMetric,
    ValidationReport,
    ValidationStatus,
)
from .notifications import (
    AlertRule,
    AlertType,
    DeliveryProvider,
    DeliveryStatus,
    MessageChannel,
    RealtimeNotification,
    RealtimeNotificationService,
    Recipient,
    format_notification_for_slack,
)
from .training import (
    DatasetSplit,
    DataType,
    TrainingConfig,
    TrainingPipeline,
    TrainingRun,
    TrainingStatus,
)
from .typology import (
    MatchSeverity,
    TypologyCategory,
    TypologyEngine,
    TypologyMatch,
    TypologyRule,
)

__all__ = [
    "AccessLogEntry",
    "Agency",
    "AlertRule",
    "AlertType",
    "BridgePattern",
    "BridgeProtocol",
    "ClassificationLevel",
    # Cross-Agency Intelligence Sharing
    "CrossAgencySharingService",
    "DataType",
    "DatasetSplit",
    "DeliveryProvider",
    "DeliveryStatus",
    "DeploymentStage",
    # Enhanced Bridge/Swap
    "EnhancedBridgeDetector",
    "IntelligencePackage",
    "IntelligenceRecord",
    "MatchSeverity",
    "MessageChannel",
    # Mixer Detection
    "MixerDetector",
    "MixerRiskLevel",
    "MixerSignal",
    "MixerType",
    "ModelArtifact",
    # Model Registry
    "ModelRegistry",
    "ModelStatus",
    "ModelType",
    # Model Validation
    "ModelValidationPipeline",
    "ModelVersion",
    "RealtimeNotification",
    # Real-time Notifications
    "RealtimeNotificationService",
    "Recipient",
    "RedactionAction",
    "RedactionRule",
    "ShareStatus",
    "SharingPolicy",
    "SharingScope",
    "SwapPattern",
    "SwapProtocol",
    "TrainingConfig",
    # Training
    "TrainingPipeline",
    "TrainingRun",
    "TrainingStatus",
    "TypologyCategory",
    # Typology
    "TypologyEngine",
    "TypologyMatch",
    "TypologyRule",
    "ValidationMetric",
    "ValidationReport",
    "ValidationStatus",
    "format_notification_for_slack",
]
