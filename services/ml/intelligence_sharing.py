"""Cross-Agency Intelligence Sharing Service.

Provides secure, policy-governed sharing of intelligence between
agencies, with redaction, audit trails, and compliance tracking.
"""

from __future__ import annotations

import hashlib
import json as json_module
from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class SharingScope(StrEnum):
    """Scope of intelligence sharing."""

    AGENCY = "agency"
    JURISDICTION = "jurisdiction"
    NATIONAL = "national"
    INTERNATIONAL = "international"
    TASK_FORCE = "task_force"


class ClassificationLevel(StrEnum):
    """Classification levels for shared intelligence."""

    UNCLASSIFIED = "unclassified"
    OFFICIAL = "official"
    CONFIDENTIAL = "confidential"
    SECRET = "secret"
    TOP_SECRET = "top_secret"


class ShareStatus(StrEnum):
    """Status of a shared intelligence package."""

    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    SHARED = "shared"
    ACKNOWLEDGED = "acknowledged"
    REJECTED = "rejected"
    EXPIRED = "expired"
    REVOKED = "revoked"


class RedactionAction(StrEnum):
    """Types of redaction."""

    REMOVE_FIELD = "remove_field"
    MASK_VALUE = "mask_value"
    REPLACE_VALUE = "replace_value"
    GENERALIZE = "generalize"


class SharingPolicy(BaseModel):
    """Policy governing intelligence sharing."""

    policy_id: str
    name: str
    description: str

    # Scope
    scope: SharingScope
    classification_level: ClassificationLevel

    # Allowed recipients
    allowed_jurisdictions: list[str] = []
    allowed_agencies: list[str] = []
    allowed_roles: list[str] = []

    # Constraints
    requires_approval: bool = True
    approval_role: str = "director"
    retention_days: int = 90
    allow_export: bool = False
    allow_pii: bool = False

    # Redaction rules
    auto_redact_pii: bool = True
    redaction_rules: list[dict[str, Any]] = []

    # Audit
    audit_required: bool = True
    access_log_retention_days: int = 365

    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    created_by: str = ""
    active: bool = True


class RedactionRule(BaseModel):
    """A redaction rule for sensitive data."""

    field_path: str
    action: RedactionAction
    replacement: str | None = None
    conditions: dict[str, Any] = {}


class IntelligencePackage(BaseModel):
    """A package of intelligence to share."""

    package_id: str
    case_id: str
    title: str
    description: str | None = None

    # Classification
    classification: ClassificationLevel = ClassificationLevel.CONFIDENTIAL
    scope: SharingScope = SharingScope.AGENCY

    # Content
    findings: list[dict[str, Any]] = []
    evidence_summary: list[dict[str, Any]] = []
    addresses: list[str] = []
    transactions: list[dict[str, Any]] = []

    # Sharing
    policy_id: str
    status: ShareStatus = ShareStatus.PENDING_APPROVAL
    recipients: list[str] = []  # Agency IDs

    # Redaction
    original_hash: str = ""
    redacted: bool = False
    redaction_log: list[dict[str, Any]] = []
    pii_removed: bool = False

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    shared_at: datetime | None = None
    acknowledged_at: datetime | None = None
    expires_at: datetime | None = None

    # Approval
    approved_by: str | None = None
    approved_at: datetime | None = None
    approval_comments: str | None = None

    # Metadata
    version: int = 1
    metadata: dict[str, Any] = {}


class Agency(BaseModel):
    """A partner agency for intelligence sharing."""

    agency_id: str
    name: str
    jurisdiction: str
    agency_type: str  # "law_enforcement", "regulatory", "intelligence", "international"

    # Contact
    contact_name: str | None = None
    contact_email: str | None = None

    # Access
    classification_clearance: list[str] = []
    active: bool = True
    sharing_enabled: bool = True

    # Configuration
    api_endpoint: str | None = None
    api_key: str | None = None
    encryption_key: str | None = None

    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_shared: datetime | None = None


class AccessLogEntry(BaseModel):
    """Audit trail entry for intelligence access."""

    entry_id: str
    package_id: str
    agency_id: str
    action: str  # "view", "download", "acknowledge", "search"
    actor: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    ip_address: str | None = None
    user_agent: str | None = None
    metadata: dict[str, Any] = {}


class IntelligenceRecord(BaseModel):
    """A shared intelligence record with status tracking."""

    record_id: str
    package_id: str
    recipient_agency: str
    sender_agency: str
    status: ShareStatus = ShareStatus.PENDING_APPROVAL
    classification: ClassificationLevel

    # Delivery
    delivered_at: datetime | None = None
    acknowledged_at: str | None = None
    acknowledgment_deadline: datetime | None = None

    # Expiration
    expires_at: datetime | None = None

    # Revocation
    revoked: bool = False
    revoked_at: datetime | None = None
    revocation_reason: str | None = None

    # Metadata
    metadata: dict[str, Any] = {}


class CrossAgencySharingService:
    """Cross-agency intelligence sharing with redaction and audit trails."""

    def __init__(self):
        self._agencies: dict[str, Agency] = {}
        self._policies: dict[str, SharingPolicy] = {}
        self._packages: dict[str, IntelligencePackage] = {}
        self._records: dict[str, IntelligenceRecord] = {}
        self._access_logs: list[AccessLogEntry] = []

        self._agency_index: dict[str, list[str]] = {}
        self._package_index: dict[str, list[str]] = {}

        self._seed_default_policies()

    def register_agency(self, agency: Agency) -> Agency:
        self._agencies[agency.agency_id] = agency
        return agency

    def get_agency(self, agency_id: str) -> Agency | None:
        return self._agencies.get(agency_id)

    def add_policy(self, policy: SharingPolicy) -> SharingPolicy:
        self._policies[policy.policy_id] = policy
        return policy

    def get_policy(self, policy_id: str) -> SharingPolicy | None:
        return self._policies.get(policy_id)

    def share_intelligence(
        self,
        case_id: str,
        title: str,
        findings: list[dict[str, Any]],
        addresses: list[str],
        transactions: list[dict[str, Any]],
        recipients: list[str],
        created_by: str,
        description: str | None = None,
        classification: ClassificationLevel = ClassificationLevel.CONFIDENTIAL,
        scope: SharingScope = SharingScope.AGENCY,
        policy_id: str = "default_internal",
        expires_in_days: int = 90,
    ) -> IntelligencePackage:
        import uuid

        policy = self._policies.get(policy_id)
        if not policy:
            raise ValueError(f"Policy not found: {policy_id}")

        if (
            classification not in policy.classification_level
            and classification.value > policy.classification_level.value
        ):
            raise ValueError(
                f"Classification {classification.value} exceeds policy level {policy.classification_level.value}"
            )

        for recipient in recipients:
            if recipient not in self._agencies:
                raise ValueError(f"Recipient agency not found: {recipient}")
            agency = self._agencies[recipient]
            if not agency.sharing_enabled or not agency.active:
                raise ValueError(f"Agency not eligible for sharing: {recipient}")

        now = datetime.now(UTC)
        package = IntelligencePackage(
            package_id=str(uuid.uuid4()),
            case_id=case_id,
            title=title,
            description=description,
            classification=classification,
            scope=scope,
            findings=findings,
            addresses=addresses,
            transactions=transactions,
            policy_id=policy_id,
            recipients=recipients,
            expires_at=now.replace() if expires_in_days else None,
        )

        if expires_in_days:
            from datetime import timedelta

            package.expires_at = now + timedelta(days=expires_in_days)

        original_content = json_module.dumps(
            {
                "findings": findings,
                "addresses": addresses,
                "transactions": transactions,
            },
            sort_keys=True,
            default=str,
        )
        package.original_hash = hashlib.sha256(original_content.encode()).hexdigest()

        if policy.requires_approval:
            package.status = ShareStatus.PENDING_APPROVAL
        else:
            package = self._approve_sharing(
                package, "SYSTEM", "Auto-approved by policy"
            )

        self._packages[package.package_id] = package

        for recipient_id in recipients:
            record = IntelligenceRecord(
                record_id=str(uuid.uuid4()),
                package_id=package.package_id,
                recipient_agency=recipient_id,
                sender_agency=created_by,
                status=package.status,
                classification=classification,
                expires_at=package.expires_at,
            )
            self._records[record.record_id] = record
            self._package_index.setdefault(package.package_id, []).append(
                record.record_id
            )

        return package

    def approve_sharing(
        self,
        package_id: str,
        approver_id: str,
        comments: str | None = None,
    ) -> IntelligencePackage:
        package = self._packages.get(package_id)
        if not package:
            raise ValueError(f"Package not found: {package_id}")

        if package.status != ShareStatus.PENDING_APPROVAL:
            raise ValueError(f"Package not pending approval: {package.status.value}")

        return self._approve_sharing(package, approver_id, comments)

    def _approve_sharing(
        self, package: IntelligencePackage, approver_id: str, comments: str | None
    ) -> IntelligencePackage:
        policy = self._policies.get(package.policy_id)

        package.approved_by = approver_id
        package.approved_at = datetime.now(UTC)
        package.approval_comments = comments

        if policy and policy.auto_redact_pii:
            package = self._apply_redactions(package, policy)

        package.status = ShareStatus.APPROVED
        package.version += 1

        for record_id in self._package_index.get(package.package_id, []):
            record = self._records.get(record_id)
            if record:
                record.status = ShareStatus.APPROVED

        self._share_with_agencies(package)

        return package

    def _apply_redactions(
        self, package: IntelligencePackage, policy: SharingPolicy
    ) -> IntelligencePackage:
        _ = json_module.dumps(
            {
                "findings": package.findings,
                "addresses": package.addresses,
                "transactions": package.transactions,
            },
            sort_keys=True,
            default=str,
        )

        package.redacted = True
        package.pii_removed = True

        redaction_log: list[dict[str, Any]] = []

        for finding in package.findings:
            if "victim_name" in finding:
                old_val = finding["victim_name"]
                finding["victim_name"] = "[REDACTED]"
                redaction_log.append(
                    {
                        "field": "victim_name",
                        "action": RedactionAction.MASK_VALUE.value,
                        "original_hash": hashlib.sha256(old_val.encode()).hexdigest()[
                            :16
                        ],
                    }
                )
            if "victim_email" in finding:
                old_val = finding["victim_email"]
                finding["victim_email"] = "[REDACTED]"
                redaction_log.append(
                    {
                        "field": "victim_email",
                        "action": RedactionAction.MASK_VALUE.value,
                        "original_hash": hashlib.sha256(old_val.encode()).hexdigest()[
                            :16
                        ],
                    }
                )

        package.redaction_log = redaction_log

        return package

    def _share_with_agencies(self, package: IntelligencePackage) -> None:
        now = datetime.now(UTC)
        package.status = ShareStatus.SHARED
        package.shared_at = now

        for record_id in self._package_index.get(package.package_id, []):
            record = self._records.get(record_id)
            if record:
                record.status = ShareStatus.SHARED
                record.delivered_at = now
                self._agencies[record.recipient_agency].last_shared = now

    def acknowledge_receipt(
        self,
        package_id: str,
        agency_id: str,
        actor: str,
    ) -> IntelligenceRecord:
        records = [
            r
            for r in self._records.values()
            if r.package_id == package_id and r.recipient_agency == agency_id
        ]
        if not records:
            raise ValueError(
                f"No sharing record found for package {package_id}, agency {agency_id}"
            )

        record = records[0]
        record.acknowledged_at = datetime.now(UTC)
        record.status = ShareStatus.ACKNOWLEDGED

        self._log_access(package_id, agency_id, actor, "acknowledge")

        return record

    def revoke_sharing(
        self,
        package_id: str,
        revoked_by: str,
        reason: str,
    ) -> IntelligencePackage:
        package = self._packages.get(package_id)
        if not package:
            raise ValueError(f"Package not found: {package_id}")

        package.status = ShareStatus.REVOKED
        package.metadata["revoked_by"] = revoked_by
        package.metadata["revocation_reason"] = reason
        package.metadata["revoked_at"] = datetime.now(UTC).isoformat()

        for record_id in self._package_index.get(package_id, []):
            record = self._records.get(record_id)
            if record:
                record.revoked = True
                record.revoked_at = datetime.now(UTC)
                record.revocation_reason = reason
                record.status = ShareStatus.REVOKED

        return package

    def get_package(self, package_id: str) -> IntelligencePackage | None:
        return self._packages.get(package_id)

    def get_shares_for_case(self, case_id: str) -> list[IntelligencePackage]:
        return [p for p in self._packages.values() if p.case_id == case_id]

    def get_shares_for_agency(self, agency_id: str) -> list[IntelligencePackage]:
        return [p for p in self._packages.values() if agency_id in p.recipients]

    def get_pending_approvals(self) -> list[IntelligencePackage]:
        return [
            p
            for p in self._packages.values()
            if p.status == ShareStatus.PENDING_APPROVAL
        ]

    def check_expired(self) -> list[IntelligencePackage]:
        now = datetime.now(UTC)
        expired = []

        for package in self._packages.values():
            if (
                package.expires_at
                and package.expires_at < now
                and package.status != ShareStatus.EXPIRED
            ):
                package.status = ShareStatus.EXPIRED
                for record_id in self._package_index.get(package.package_id, []):
                    record = self._records.get(record_id)
                    if record:
                        record.status = ShareStatus.EXPIRED
                expired.append(package)

        return expired

    def _log_access(
        self,
        package_id: str,
        agency_id: str,
        actor: str,
        action: str,
    ) -> AccessLogEntry:
        import uuid

        entry = AccessLogEntry(
            entry_id=str(uuid.uuid4()),
            package_id=package_id,
            agency_id=agency_id,
            action=action,
            actor=actor,
        )
        self._access_logs.append(entry)
        self._access_logs = self._access_logs[-10000:]
        return entry

    def get_audit_trail(self, package_id: str | None = None) -> list[AccessLogEntry]:
        if package_id:
            return [log for log in self._access_logs if log.package_id == package_id]
        return self._access_logs

    def get_statistics(self) -> dict[str, Any]:
        packages = list(self._packages.values())
        records = list(self._records.values())
        agencies = list(self._agencies.values())

        if not packages:
            return {"total": 0}

        by_status: dict[str, int] = {}
        for p in packages:
            by_status[p.status.value] = by_status.get(p.status.value, 0) + 1

        by_classification: dict[str, int] = {}
        for p in packages:
            cls = p.classification.value
            by_classification[cls] = by_classification.get(cls, 0) + 1

        total_access = len(self._access_logs)

        return {
            "total_packages": len(packages),
            "total_records": len(records),
            "total_agencies": len(agencies),
            "by_status": by_status,
            "by_classification": by_classification,
            "total_access_events": total_access,
            "pending_approval": by_status.get("pending_approval", 0),
            "active_shares": by_status.get("shared", 0)
            + by_status.get("acknowledged", 0),
        }

    def _seed_default_policies(self) -> None:
        self._policies = {
            "default_internal": SharingPolicy(
                policy_id="default_internal",
                name="Default Internal Sharing",
                description="Standard sharing within the same jurisdiction",
                scope=SharingScope.AGENCY,
                classification_level=ClassificationLevel.CONFIDENTIAL,
                requires_approval=True,
                retention_days=90,
                allow_export=False,
                auto_redact_pii=True,
            ),
            "national_security": SharingPolicy(
                policy_id="national_security",
                name="National Security Sharing",
                description="Cross-border sharing for national security cases",
                scope=SharingScope.NATIONAL,
                classification_level=ClassificationLevel.SECRET,
                requires_approval=True,
                approval_role="director",
                retention_days=180,
                allow_export=True,
                allow_pii=False,
                auto_redact_pii=True,
            ),
            "international_cooperation": SharingPolicy(
                policy_id="international_cooperation",
                name="International Cooperation",
                description="Cross-agency sharing for international cases",
                scope=SharingScope.INTERNATIONAL,
                classification_level=ClassificationLevel.TOP_SECRET,
                requires_approval=True,
                approval_role="director",
                retention_days=365,
                allow_export=False,
                auto_redact_pii=True,
            ),
        }

    def create_sharing_request(
        self,
        case_id: str,
        findings: list[dict[str, Any]],
        addresses: list[str],
        transactions: list[dict[str, Any]],
        classification: ClassificationLevel,
        recipients: list[str],
        created_by: str,
        title: str,
        description: str | None = None,
        scope: SharingScope = SharingScope.AGENCY,
        policy_id: str = "default_internal",
        expires_in_days: int = 90,
    ) -> IntelligencePackage:
        """Create and initiate a sharing request."""
        return self.share_intelligence(
            case_id=case_id,
            title=title,
            description=description,
            findings=findings,
            addresses=addresses,
            transactions=transactions,
            classification=classification,
            scope=scope,
            policy_id=policy_id,
            recipients=recipients,
            created_by=created_by,
            expires_in_days=expires_in_days,
        )


class SharingPolicyError(Exception):
    """Exception for sharing policy violations."""


class ClassificationError(Exception):
    """Exception for classification level violations."""
