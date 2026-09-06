"""Financial Institution Notification Service.

Provides notification capabilities for banks and financial institutions
regarding fraud cases, freeze requests, and investigation updates.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class NotificationType(StrEnum):
    """Notification types."""

    FRAUD_ALERT = "fraud_alert"
    FREEZE_REQUEST = "freeze_request"
    INVESTIGATION_UPDATE = "investigation_update"
    EVIDENCE_REQUEST = "evidence_request"
    COMPLIANCE_NOTICE = "compliance_notice"
    URGENT_ACTION = "urgent_action"
    STATUS_UPDATE = "status_update"


class NotificationPriority(StrEnum):
    """Notification priority levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"
    CRITICAL = "critical"


class NotificationChannel(StrEnum):
    """Notification delivery channels."""

    EMAIL = "email"
    SMS = "sms"
    API = "api"
    WEBHOOK = "webhook"
    SECURE_PORTAL = "secure_portal"


class NotificationStatus(StrEnum):
    """Notification delivery status."""

    PENDING = "pending"
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    BOUNCED = "bounced"


class NotificationRecord(BaseModel):
    """Notification record."""

    notification_id: str
    notification_type: NotificationType
    priority: NotificationPriority

    # Recipient
    institution_id: str
    institution_name: str
    recipient_email: str | None = None
    recipient_phone: str | None = None

    # Content
    subject: str
    body: str
    template_id: str | None = None
    template_data: dict[str, Any] = {}

    # Related entities
    case_id: str | None = None
    action_request_id: str | None = None

    # Delivery
    channel: NotificationChannel = NotificationChannel.EMAIL
    status: NotificationStatus = NotificationStatus.PENDING

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    sent_at: datetime | None = None
    delivered_at: datetime | None = None

    # Tracking
    external_id: str | None = None  # ID from external provider
    retry_count: int = 0
    max_retries: int = 3
    error_message: str | None = None

    # Metadata
    metadata: dict[str, Any] = {}


class FinancialInstitution(BaseModel):
    """Financial institution details."""

    institution_id: str
    name: str
    institution_type: str  # "bank", "nbfi", "exchange", "vasp"
    jurisdiction: str
    contact_email: str | None = None
    contact_phone: str | None = None
    api_endpoint: str | None = None
    api_key: str | None = None
    notification_preferences: dict[str, Any] = {}
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class NotificationService:
    """Financial Institution Notification Service."""

    def __init__(self):
        self._notifications: dict[str, NotificationRecord] = {}
        self._institutions: dict[str, FinancialInstitution] = {}
        self._case_index: dict[str, list[str]] = {}  # case_id -> [notification_ids]
        self._institution_index: dict[str, list[str]] = (
            {}
        )  # institution_id -> [notification_ids]

        # Email provider config (would be set in production)
        self._email_config: dict[str, Any] = {}
        self._sms_config: dict[str, Any] = {}

    def register_institution(
        self, institution: FinancialInstitution
    ) -> FinancialInstitution:
        """Register a financial institution."""
        self._institutions[institution.institution_id] = institution
        return institution

    def get_institution(self, institution_id: str) -> FinancialInstitution | None:
        """Get institution details."""
        return self._institutions.get(institution_id)

    def send_fraud_alert(
        self,
        institution_id: str,
        case_id: str,
        fraud_type: str,
        affected_accounts: list[str],
        amount: float,
        currency: str = "INR",
        description: str = "",
        priority: NotificationPriority = NotificationPriority.HIGH,
    ) -> NotificationRecord:
        """Send fraud alert to a financial institution."""
        institution = self._institutions.get(institution_id)
        if not institution:
            raise ValueError(f"Institution not found: {institution_id}")

        subject = f"URGENT: Fraud Alert - {fraud_type} - Case {case_id}"

        body = self._render_fraud_alert(
            institution=institution,
            case_id=case_id,
            fraud_type=fraud_type,
            affected_accounts=affected_accounts,
            amount=amount,
            currency=currency,
            description=description,
        )

        return self._create_notification(
            notification_type=NotificationType.FRAUD_ALERT,
            priority=priority,
            institution=institution,
            subject=subject,
            body=body,
            case_id=case_id,
            template_data={
                "fraud_type": fraud_type,
                "affected_accounts": affected_accounts,
                "amount": amount,
                "currency": currency,
            },
        )

    def send_freeze_request(
        self,
        institution_id: str,
        case_id: str,
        action_request_id: str,
        account_number: str,
        amount: float | None = None,
        reason: str = "",
        legal_reference: str | None = None,
        priority: NotificationPriority = NotificationPriority.CRITICAL,
    ) -> NotificationRecord:
        """Send freeze request to a financial institution."""
        institution = self._institutions.get(institution_id)
        if not institution:
            raise ValueError(f"Institution not found: {institution_id}")

        subject = f"URGENT: Account Freeze Request - Case {case_id}"

        body = self._render_freeze_request(
            institution=institution,
            case_id=case_id,
            account_number=account_number,
            amount=amount,
            reason=reason,
            legal_reference=legal_reference,
        )

        return self._create_notification(
            notification_type=NotificationType.FREEZE_REQUEST,
            priority=priority,
            institution=institution,
            subject=subject,
            body=body,
            case_id=case_id,
            action_request_id=action_request_id,
            template_data={
                "account_number": account_number,
                "amount": amount,
                "reason": reason,
                "legal_reference": legal_reference,
            },
        )

    def send_investigation_update(
        self,
        institution_id: str,
        case_id: str,
        update_type: str,
        message: str,
        priority: NotificationPriority = NotificationPriority.MEDIUM,
    ) -> NotificationRecord:
        """Send investigation update to a financial institution."""
        institution = self._institutions.get(institution_id)
        if not institution:
            raise ValueError(f"Institution not found: {institution_id}")

        subject = f"Investigation Update - {update_type} - Case {case_id}"

        body = self._render_investigation_update(
            institution=institution,
            case_id=case_id,
            update_type=update_type,
            message=message,
        )

        return self._create_notification(
            notification_type=NotificationType.INVESTIGATION_UPDATE,
            priority=priority,
            institution=institution,
            subject=subject,
            body=body,
            case_id=case_id,
            template_data={
                "update_type": update_type,
                "message": message,
            },
        )

    def send_evidence_request(
        self,
        institution_id: str,
        case_id: str,
        evidence_type: str,
        description: str,
        deadline: datetime | None = None,
        priority: NotificationPriority = NotificationPriority.HIGH,
    ) -> NotificationRecord:
        """Send evidence request to a financial institution."""
        institution = self._institutions.get(institution_id)
        if not institution:
            raise ValueError(f"Institution not found: {institution_id}")

        subject = f"Evidence Request - {evidence_type} - Case {case_id}"

        body = self._render_evidence_request(
            institution=institution,
            case_id=case_id,
            evidence_type=evidence_type,
            description=description,
            deadline=deadline,
        )

        return self._create_notification(
            notification_type=NotificationType.EVIDENCE_REQUEST,
            priority=priority,
            institution=institution,
            subject=subject,
            body=body,
            case_id=case_id,
            template_data={
                "evidence_type": evidence_type,
                "description": description,
                "deadline": deadline.isoformat() if deadline else None,
            },
        )

    def get_notification(self, notification_id: str) -> NotificationRecord | None:
        """Get a notification record."""
        return self._notifications.get(notification_id)

    def get_notifications_for_case(self, case_id: str) -> list[NotificationRecord]:
        """Get all notifications for a case."""
        notification_ids = self._case_index.get(case_id, [])
        return [
            self._notifications[nid]
            for nid in notification_ids
            if nid in self._notifications
        ]

    def get_notifications_for_institution(
        self, institution_id: str
    ) -> list[NotificationRecord]:
        """Get all notifications for an institution."""
        notification_ids = self._institution_index.get(institution_id, [])
        return [
            self._notifications[nid]
            for nid in notification_ids
            if nid in self._notifications
        ]

    def get_pending_notifications(self) -> list[NotificationRecord]:
        """Get all pending notifications."""
        return [
            n
            for n in self._notifications.values()
            if n.status in [NotificationStatus.PENDING, NotificationStatus.QUEUED]
        ]

    def get_failed_notifications(self) -> list[NotificationRecord]:
        """Get all failed notifications."""
        return [
            n
            for n in self._notifications.values()
            if n.status == NotificationStatus.FAILED
        ]

    def retry_notification(self, notification_id: str) -> NotificationRecord | None:
        """Retry a failed notification."""
        notification = self._notifications.get(notification_id)
        if not notification:
            return None

        if notification.status != NotificationStatus.FAILED:
            return None

        if notification.retry_count >= notification.max_retries:
            return None

        notification.retry_count += 1
        notification.status = NotificationStatus.PENDING
        notification.error_message = None

        return notification

    def update_status(
        self,
        notification_id: str,
        status: NotificationStatus,
        error_message: str | None = None,
        external_id: str | None = None,
    ) -> NotificationRecord | None:
        """Update notification status."""
        notification = self._notifications.get(notification_id)
        if not notification:
            return None

        notification.status = status

        if error_message:
            notification.error_message = error_message

        if external_id:
            notification.external_id = external_id

        now = datetime.now(UTC)
        if status == NotificationStatus.SENT:
            notification.sent_at = now
        elif status == NotificationStatus.DELIVERED:
            notification.delivered_at = now

        return notification

    def get_statistics(self) -> dict[str, Any]:
        """Get notification statistics."""
        notifications = list(self._notifications.values())

        if not notifications:
            return {"total": 0}

        # Count by status
        by_status = {}
        for n in notifications:
            status = n.status.value
            by_status[status] = by_status.get(status, 0) + 1

        # Count by type
        by_type = {}
        for n in notifications:
            ntype = n.notification_type.value
            by_type[ntype] = by_type.get(ntype, 0) + 1

        # Count by priority
        by_priority = {}
        for n in notifications:
            priority = n.priority.value
            by_priority[priority] = by_priority.get(priority, 0) + 1

        # Success rate
        sent = by_status.get("sent", 0) + by_status.get("delivered", 0)
        total = len(notifications)
        success_rate = sent / total if total > 0 else 0

        # Average delivery time
        delivery_times = []
        for n in notifications:
            if n.sent_at and n.delivered_at:
                time_diff = (n.delivered_at - n.sent_at).total_seconds()
                delivery_times.append(time_diff)

        avg_delivery_time = (
            sum(delivery_times) / len(delivery_times) if delivery_times else 0
        )

        return {
            "total": len(notifications),
            "by_status": by_status,
            "by_type": by_type,
            "by_priority": by_priority,
            "success_rate": round(success_rate, 4),
            "average_delivery_time_seconds": round(avg_delivery_time, 2),
            "pending_count": by_status.get("pending", 0) + by_status.get("queued", 0),
            "failed_count": by_status.get("failed", 0),
        }

    def _create_notification(
        self,
        notification_type: NotificationType,
        priority: NotificationPriority,
        institution: FinancialInstitution,
        subject: str,
        body: str,
        case_id: str | None = None,
        action_request_id: str | None = None,
        template_data: dict[str, Any] | None = None,
    ) -> NotificationRecord:
        """Create and store a notification."""
        import uuid

        # Determine channel based on institution preferences
        channel = self._determine_channel(institution, priority)

        notification = NotificationRecord(
            notification_id=str(uuid.uuid4()),
            notification_type=notification_type,
            priority=priority,
            institution_id=institution.institution_id,
            institution_name=institution.name,
            recipient_email=institution.contact_email,
            recipient_phone=institution.contact_phone,
            subject=subject,
            body=body,
            case_id=case_id,
            action_request_id=action_request_id,
            channel=channel,
            template_data=template_data or {},
        )

        # Store notification
        self._notifications[notification.notification_id] = notification

        # Update indexes
        if case_id:
            if case_id not in self._case_index:
                self._case_index[case_id] = []
            self._case_index[case_id].append(notification.notification_id)

        inst_id = institution.institution_id
        if inst_id not in self._institution_index:
            self._institution_index[inst_id] = []
        self._institution_index[inst_id].append(notification.notification_id)

        return notification

    def _determine_channel(
        self,
        institution: FinancialInstitution,
        priority: NotificationPriority,
    ) -> NotificationChannel:
        """Determine notification channel based on priority and preferences."""
        # Urgent/Critical notifications should use multiple channels
        if priority in [NotificationPriority.URGENT, NotificationPriority.CRITICAL]:
            # Check if institution has API endpoint
            if institution.api_endpoint:
                return NotificationChannel.API
            return NotificationChannel.EMAIL

        # Check institution preferences
        prefs = institution.notification_preferences
        if "preferred_channel" in prefs:
            try:
                return NotificationChannel(prefs["preferred_channel"])
            except ValueError:
                pass

        # Default to email
        return NotificationChannel.EMAIL

    def _render_fraud_alert(
        self,
        institution: FinancialInstitution,
        case_id: str,
        fraud_type: str,
        affected_accounts: list[str],
        amount: float,
        currency: str,
        description: str,
    ) -> str:
        """Render fraud alert email body."""
        accounts_str = "\n".join(f"  - {acc}" for acc in affected_accounts)

        return f"""URGENT: Fraud Alert Notification

Dear {institution.name} Compliance Team,

This is to inform you of a potential fraud case that requires immediate attention.

Case Reference: {case_id}
Fraud Type: {fraud_type}
Reported Amount: {amount:,.2f} {currency}

Affected Accounts:
{accounts_str}

Description:
{description or "No additional description provided."}

ACTION REQUIRED:
Please investigate the above-mentioned accounts immediately and take appropriate
preventive measures as per your internal fraud prevention protocols.

Please acknowledge receipt of this notification and provide an update within 24 hours.

This is an official communication from the CashNet Investigation Platform.
Reference ID: {case_id}

 regards,
CashNet Investigation Team"""

    def _render_freeze_request(
        self,
        institution: FinancialInstitution,
        case_id: str,
        account_number: str,
        amount: float | None,
        reason: str,
        legal_reference: str | None,
    ) -> str:
        """Render freeze request email body."""
        amount_str = f"{amount:,.2f} INR" if amount else "All funds"

        return f"""URGENT: Account Freeze Request

Dear {institution.name} Compliance Team,

Pursuant to an ongoing fraud investigation, we request the immediate freeze of the following account:

Case Reference: {case_id}
Account Number: {account_number}
Amount to Freeze: {amount_str}

Reason for Freeze:
{reason or "Suspicious activity detected in connection with fraud investigation."}

Legal Reference: {legal_reference or "Pending"}

INSTRUCTIONS:
1. Immediately freeze the above account
2. Prevent any outgoing transactions
3. Preserve all transaction records for the past 90 days
4. Acknowledge receipt within 4 hours
5. Provide account holder details within 24 hours

Non-compliance may result in regulatory action as per applicable laws.

Please confirm the freeze action by replying to this notification.

This is an official communication from the CashNet Investigation Platform.
Case Reference: {case_id}

 regards,
CashNet Investigation Team"""

    def _render_investigation_update(
        self,
        institution: FinancialInstitution,
        case_id: str,
        update_type: str,
        message: str,
    ) -> str:
        """Render investigation update email body."""
        return f"""Investigation Update Notification

Dear {institution.name} Team,

We are writing to provide an update on an ongoing investigation.

Case Reference: {case_id}
Update Type: {update_type}

Update Details:
{message}

Please review the above information and take any necessary actions as required.

If you have any questions or need additional information, please contact the
CashNet Investigation Team.

This is an official communication from the CashNet Investigation Platform.

 regards,
CashNet Investigation Team"""

    def _render_evidence_request(
        self,
        institution: FinancialInstitution,
        case_id: str,
        evidence_type: str,
        description: str,
        deadline: datetime | None,
    ) -> str:
        """Render evidence request email body."""
        deadline_str = (
            deadline.strftime("%Y-%m-%d %H:%M UTC") if deadline else "Not specified"
        )

        return f"""Evidence Request

Dear {institution.name} Compliance Team,

As part of an ongoing investigation, we request the following evidence:

Case Reference: {case_id}
Evidence Type: {evidence_type}
Deadline: {deadline_str}

Description:
{description}

PLEASE PROVIDE:
1. All relevant documents and records
2. Transaction logs for the specified period
3. Account opening documents
4. Any other relevant information

Evidence should be provided through the secure portal or via encrypted email.

Please acknowledge this request and provide the requested evidence by the deadline.

This is an official communication from the CashNet Investigation Platform.
Case Reference: {case_id}

 regards,
CashNet Investigation Team"""
