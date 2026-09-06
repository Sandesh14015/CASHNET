"""Real-time Notification Service (Email/SMS).

Provides real-time alerting capabilities for investigators and agencies
via email, SMS, and webhook delivery channels.
"""

from __future__ import annotations

import json as json_module
from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class AlertType(StrEnum):
    """Alert types for real-time notifications."""

    NEW_CASE = "new_case"
    HIGH_RISK_TRANSACTION = "high_risk_transaction"
    NEW_FINDING = "new_finding"
    EVIDENCE_READY = "evidence_ready"
    SLA_BREACHING = "sla_breaching"
    PARTNER_RESPONSE = "partner_response"
    CASE_STATUS_CHANGE = "case_status_change"
    INVESTIGATION_UPDATE = "investigation_update"
    BRIDGE_EVENT = "bridge_event"
    MIXER_DETECTION = "mixer_detection"
    SANCTIONS_HIT = "sanctions_hit"
    SYSTEM_ALERT = "system_alert"


class MessageChannel(StrEnum):
    """Delivery channels for real-time notifications."""

    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    WEBHOOK = "webhook"
    SLACK = "slack"
    TEAMS = "teams"


class DeliveryStatus(StrEnum):
    """Notification delivery status."""

    PENDING = "pending"
    SENDING = "sending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    BOUNCED = "bounced"


class Recipient(BaseModel):
    """A notification recipient."""

    recipient_id: str
    name: str
    email: str | None = None
    phone: str | None = None
    channel: MessageChannel = MessageChannel.EMAIL
    timezone: str = "UTC"
    active: bool = True
    metadata: dict[str, Any] = {}


class AlertRule(BaseModel):
    """Configuration for an alert trigger."""

    rule_id: str
    alert_type: AlertType
    channel: MessageChannel
    recipients: list[str]
    enabled: bool = True

    # Thresholds
    min_risk_score: float | None = None
    min_amount: float | None = None
    chains: list[str] | None = None

    # Rate limiting
    cooldown_minutes: int = 60

    # Last trigger
    last_triggered: datetime | None = None
    trigger_count: int = 0


class DeliveryProvider(BaseModel):
    """Email/SMS provider configuration."""

    provider_id: str
    provider_type: MessageChannel
    name: str
    config: dict[str, Any] = {}

    # For email: SMTP server, API key, etc.
    # For SMS: Twilio, AWS SNS, etc.
    api_key: str | None = None
    sender_email: str | None = None
    sender_phone: str | None = None
    base_url: str | None = None

    active: bool = True
    healthy: bool = True


class RealtimeNotification(BaseModel):
    """A real-time notification record."""

    notification_id: str
    alert_type: AlertType
    channel: MessageChannel
    priority: str

    # Recipient
    recipient: str
    recipient_id: str | None = None

    # Content
    subject: str
    body: str
    data: dict[str, Any] = {}

    # Status
    status: DeliveryStatus = DeliveryStatus.PENDING
    provider: str | None = None
    external_id: str | None = None
    error_message: str | None = None

    # Related entities
    case_id: str | None = None
    address: str | None = None
    chain: str | None = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    retry_count: int = 0

    # Metadata
    metadata: dict[str, Any] = {}


class RealtimeNotificationService:
    """Real-time notification service with email/SMS delivery."""

    def __init__(self):
        self._recipients: dict[str, Recipient] = {}
        self._alert_rules: dict[str, AlertRule] = {}
        self._providers: dict[MessageChannel, list[DeliveryProvider]] = {}
        self._notifications: dict[str, RealtimeNotification] = {}
        self._case_index: dict[str, list[str]] = {}
        self._recipient_channel_index: dict[MessageChannel, list[str]] = {}

        self._seed_default_rules()

    def register_recipient(self, recipient: Recipient) -> Recipient:
        self._recipients[recipient.recipient_id] = recipient
        return recipient

    def get_recipient(self, recipient_id: str) -> Recipient | None:
        return self._recipients.get(recipient_id)

    def add_provider(self, provider: DeliveryProvider) -> DeliveryProvider:
        if provider.provider_type not in self._providers:
            self._providers[provider.provider_type] = []
        self._providers[provider.provider_type].append(provider)
        return provider

    def register_alert_rule(self, rule: AlertRule) -> AlertRule:
        self._alert_rules[rule.rule_id] = rule
        return rule

    def set_email_config(
        self,
        provider_id: str,
        smtp_host: str,
        smtp_port: int = 587,
        username: str | None = None,
        password: str | None = None,
        use_tls: bool = True,
        sender_email: str = "",
    ) -> DeliveryProvider:
        return self.add_provider(
            DeliveryProvider(
                provider_id=provider_id,
                provider_type=MessageChannel.EMAIL,
                name=f"Email ({smtp_host})",
                config={
                    "smtp_host": smtp_host,
                    "smtp_port": smtp_port,
                    "username": username,
                    "password": password,
                    "use_tls": use_tls,
                },
                sender_email=sender_email,
            )
        )

    def set_sms_config(
        self,
        provider_id: str,
        twilio_account_sid: str,
        twilio_auth_token: str,
        sender_phone: str,
    ) -> DeliveryProvider:
        return self.add_provider(
            DeliveryProvider(
                provider_id=provider_id,
                provider_type=MessageChannel.SMS,
                name="Twilio SMS",
                config={
                    "twilio_account_sid": twilio_account_sid,
                    "twilio_auth_token": twilio_auth_token,
                },
                api_key=twilio_auth_token,
                sender_phone=sender_phone,
            )
        )

    def trigger_alert(
        self,
        alert_type: AlertType,
        subject: str,
        body: str,
        case_id: str | None = None,
        address: str | None = None,
        chain: str | None = None,
        risk_score: float | None = None,
        amount: float | None = None,
        data: dict[str, Any] | None = None,
        priority: str = "HIGH",
    ) -> list[RealtimeNotification]:
        rules = self._get_matching_rules(alert_type, risk_score, amount, chain)
        if not rules:
            return []

        notifications: list[RealtimeNotification] = []
        import uuid

        now = datetime.now(UTC)

        for rule in rules:
            if not rule.enabled:
                continue

            if rule.last_triggered:
                elapsed = (now - rule.last_triggered).total_seconds() / 60
                if elapsed < rule.cooldown_minutes:
                    continue

            rule.last_triggered = now
            rule.trigger_count += 1

            for recipient_id in rule.recipients:
                recipient = self._recipients.get(recipient_id)
                if not recipient or not recipient.active:
                    continue

                notification = RealtimeNotification(
                    notification_id=str(uuid.uuid4()),
                    alert_type=alert_type,
                    channel=rule.channel,
                    priority=priority,
                    recipient=recipient.email or recipient.phone or recipient_id,
                    recipient_id=recipient_id,
                    subject=subject,
                    body=body,
                    data=data or {},
                    case_id=case_id,
                    address=address,
                    chain=chain,
                    metadata={"rule_id": rule.rule_id},
                )

                self._notifications[notification.notification_id] = notification

                if case_id:
                    if case_id not in self._case_index:
                        self._case_index[case_id] = []
                    self._case_index[case_id].append(notification.notification_id)

                self._send_via_provider(notification, rule.channel)
                notifications.append(notification)

        return notifications

    def _get_matching_rules(
        self,
        alert_type: AlertType,
        risk_score: float | None,
        amount: float | None,
        chain: str | None,
    ) -> list[AlertRule]:
        matching = []
        for rule in self._alert_rules.values():
            if rule.alert_type != alert_type:
                continue
            if rule.min_risk_score and risk_score and risk_score < rule.min_risk_score:
                continue
            if rule.min_amount and amount and amount < rule.min_amount:
                continue
            if rule.chains and chain and chain not in rule.chains:
                continue
            matching.append(rule)
        return matching

    def _send_via_provider(
        self, notification: RealtimeNotification, channel: MessageChannel
    ) -> RealtimeNotification:
        providers = self._providers.get(channel, [])
        if not providers:
            notification.status = DeliveryStatus.FAILED
            notification.error_message = f"No provider configured for {channel.value}"
            return notification

        provider = next((p for p in providers if p.healthy and p.active), None)
        if not provider:
            notification.status = DeliveryStatus.FAILED
            notification.error_message = "No healthy provider"
            return notification

        notification.status = DeliveryStatus.SENDING
        notification.provider = provider.provider_id

        if channel == MessageChannel.EMAIL:
            self._send_email(notification, provider)
        elif channel == MessageChannel.SMS:
            self._send_sms(notification, provider)
        elif channel == MessageChannel.WEBHOOK:
            self._send_webhook(notification, provider)

        return notification

    def _send_email(
        self, notification: RealtimeNotification, provider: DeliveryProvider
    ) -> None:
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            config = provider.config
            msg = MIMEMultipart("alternative")
            msg["Subject"] = notification.subject
            msg["From"] = provider.sender_email or config.get("sender_email", "")
            msg["To"] = notification.recipient

            body = MIMEText(notification.body, "plain")
            msg.attach(body)

            if config.get("use_tls", True):
                server = smtplib.SMTP(config["smtp_host"], config.get("smtp_port", 587))
                server.starttls()
            else:
                server = smtplib.SMTP(config["smtp_host"], config.get("smtp_port", 25))

            if config.get("username"):
                server.login(config["username"], config["password"])

            server.send_message(msg)
            server.quit()

            notification.status = DeliveryStatus.SENT
            notification.sent_at = datetime.now(UTC)
        except Exception as e:
            notification.status = DeliveryStatus.FAILED
            notification.error_message = str(e)

    def _send_sms(
        self, notification: RealtimeNotification, provider: DeliveryProvider
    ) -> None:
        try:
            from twilio.rest import Client

            client = Client(
                provider.config["twilio_account_sid"],
                provider.config["twilio_auth_token"],
            )
            message = client.messages.create(
                body=notification.body,
                from_=provider.sender_phone,
                to=notification.recipient,
            )

            notification.status = DeliveryStatus.SENT
            notification.sent_at = datetime.now(UTC)
            notification.external_id = message.sid
        except ImportError:
            notification.status = DeliveryStatus.FAILED
            notification.error_message = "Twilio not installed"
        except Exception as e:
            notification.status = DeliveryStatus.FAILED
            notification.error_message = str(e)

    def _send_webhook(
        self, notification: RealtimeNotification, provider: DeliveryProvider
    ) -> None:
        try:
            import httpx

            payload = {
                "alert_type": notification.alert_type.value,
                "subject": notification.subject,
                "body": notification.body,
                "data": notification.data,
                "case_id": notification.case_id,
                "timestamp": notification.created_at.isoformat(),
            }

            headers = {
                "Content-Type": "application/json",
            }
            if provider.api_key:
                headers["Authorization"] = f"Bearer {provider.api_key}"

            response = httpx.post(
                provider.base_url,
                json=payload,
                headers=headers,
                timeout=30,
            )

            notification.status = DeliveryStatus.SENT
            notification.sent_at = datetime.now(UTC)
            notification.external_id = response.headers.get("x-notification-id")
        except Exception as e:
            notification.status = DeliveryStatus.FAILED
            notification.error_message = str(e)

    def send_immediate(
        self,
        recipient_id: str,
        subject: str,
        body: str,
        channel: MessageChannel = MessageChannel.EMAIL,
        data: dict[str, Any] | None = None,
        priority: str = "HIGH",
    ) -> RealtimeNotification | None:
        recipient = self._recipients.get(recipient_id)
        if not recipient or not recipient.active:
            return None

        import uuid

        notification = RealtimeNotification(
            notification_id=str(uuid.uuid4()),
            alert_type=AlertType.SYSTEM_ALERT,
            channel=channel,
            priority=priority,
            recipient=recipient.email or recipient.phone or recipient_id,
            recipient_id=recipient_id,
            subject=subject,
            body=body,
            data=data or {},
        )

        self._notifications[notification.notification_id] = notification
        self._send_via_provider(notification, channel)
        return notification

    def get_notification(self, notification_id: str) -> RealtimeNotification | None:
        return self._notifications.get(notification_id)

    def get_notifications_for_case(self, case_id: str) -> list[RealtimeNotification]:
        notification_ids = self._case_index.get(case_id, [])
        return [
            self._notifications[nid]
            for nid in notification_ids
            if nid in self._notifications
        ]

    def get_pending_notifications(self) -> list[RealtimeNotification]:
        return [
            n
            for n in self._notifications.values()
            if n.status
            in [DeliveryStatus.PENDING, DeliveryStatus.SENDING, DeliveryStatus.FAILED]
            and n.retry_count < 3
        ]

    def retry_notification(self, notification_id: str) -> RealtimeNotification | None:
        notification = self._notifications.get(notification_id)
        if not notification:
            return None
        if notification.status != DeliveryStatus.FAILED:
            return None
        if notification.retry_count >= 3:
            return None

        notification.retry_count += 1
        notification.status = DeliveryStatus.PENDING
        notification.error_message = None

        channel = notification.channel
        self._send_via_provider(notification, channel)
        return notification

    def update_delivery_status(
        self,
        notification_id: str,
        status: DeliveryStatus,
        external_id: str | None = None,
        delivered: bool = False,
    ) -> RealtimeNotification | None:
        notification = self._notifications.get(notification_id)
        if not notification:
            return None

        notification.status = status
        if external_id:
            notification.external_id = external_id
        if delivered:
            notification.delivered_at = datetime.now(UTC)

        return notification

    def get_statistics(self) -> dict[str, Any]:
        notifications = list(self._notifications.values())
        if not notifications:
            return {"total": 0}

        by_status: dict[str, int] = {}
        by_type: dict[str, int] = {}
        by_channel: dict[str, int] = {}

        for n in notifications:
            by_status[n.status.value] = by_status.get(n.status.value, 0) + 1
            by_type[n.alert_type.value] = by_type.get(n.alert_type.value, 0) + 1
            by_channel[n.channel.value] = by_channel.get(n.channel.value, 0) + 1

        sent_count = sum(
            1
            for n in notifications
            if n.status in [DeliveryStatus.SENT, DeliveryStatus.DELIVERED]
        )
        total = len(notifications)

        return {
            "total": total,
            "by_status": by_status,
            "by_type": by_type,
            "by_channel": by_channel,
            "success_rate": round(sent_count / total, 4) if total > 0 else 0,
            "pending_count": by_status.get("pending", 0) + by_status.get("failed", 0),
            "recipient_count": len(self._recipients),
            "provider_count": {
                ch.value: len(provs) for ch, provs in self._providers.items()
            },
        }

    def _seed_default_rules(self) -> None:

        self._alert_rules = {
            "high_risk_transactions": AlertRule(
                rule_id="high_risk_transactions",
                alert_type=AlertType.HIGH_RISK_TRANSACTION,
                channel=MessageChannel.EMAIL,
                recipients=[],
                min_risk_score=0.7,
            ),
            "new_findings": AlertRule(
                rule_id="new_findings",
                alert_type=AlertType.NEW_FINDING,
                channel=MessageChannel.EMAIL,
                recipients=[],
            ),
            "sla_breaches": AlertRule(
                rule_id="sla_breaches",
                alert_type=AlertType.SLA_BREACHING,
                channel=MessageChannel.SMS,
                recipients=[],
                cooldown_minutes=30,
            ),
            "sanctions_hits": AlertRule(
                rule_id="sanctions_hits",
                alert_type=AlertType.SANCTIONS_HIT,
                channel=MessageChannel.EMAIL,
                recipients=[],
                priority="CRITICAL",
            ),
            "mixer_detection": AlertRule(
                rule_id="mixer_detection",
                alert_type=AlertType.MIXER_DETECTION,
                channel=MessageChannel.SMS,
                recipients=[],
                min_risk_score=0.5,
            ),
        }


def format_notification_for_slack(notification: RealtimeNotification) -> str:
    """Format notification as Slack-compatible message."""
    return json_module.dumps(
        {
            "text": notification.subject,
            "attachments": [
                {
                    "color": (
                        "warning"
                        if notification.priority in ["HIGH", "CRITICAL", "URGENT"]
                        else "good"
                    ),
                    "fields": [
                        {
                            "title": "Alert Type",
                            "value": notification.alert_type.value,
                            "short": True,
                        },
                        {
                            "title": "Priority",
                            "value": notification.priority,
                            "short": True,
                        },
                        {
                            "title": "Case",
                            "value": notification.case_id or "N/A",
                            "short": True,
                        },
                        {
                            "title": "Channel",
                            "value": notification.channel.value,
                            "short": True,
                        },
                    ],
                    "text": notification.body[:500],
                    "ts": (
                        int(notification.created_at.timestamp())
                        if notification.created_at
                        else None
                    ),
                }
            ],
        },
        indent=2,
    )
