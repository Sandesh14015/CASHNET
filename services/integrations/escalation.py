"""Escalation Rules and SLA Tracking.

Manages escalation rules, SLA tracking, and deadline monitoring.
"""

from __future__ import annotations

from datetime import datetime, timedelta, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class SLAStatus(StrEnum):
    """SLA status."""

    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    BREACHED = "breached"
    COMPLETED = "completed"


class EscalationLevel(StrEnum):
    """Escalation levels."""

    LEVEL_1 = "level_1"  # Supervisor
    LEVEL_2 = "level_2"  # Manager
    LEVEL_3 = "level_3"  # Director
    LEVEL_4 = "level_4"  # Executive


class EscalationRule(BaseModel):
    """Escalation rule definition."""

    rule_id: str
    name: str
    description: str

    # Trigger conditions
    trigger_type: str  # "time", "status", "count"
    trigger_value: Any  # hours, status, count

    # Escalation target
    escalation_level: EscalationLevel
    notify_roles: list[str] = []
    notify_emails: list[str] = []

    # Applicability
    action_types: list[str] = []
    partner_types: list[str] = []
    priority_levels: list[str] = []

    # Auto-escalation
    auto_escalate: bool = True
    max_escalations: int = 3

    # Cooldown
    cooldown_hours: int = 24


class SLADefinition(BaseModel):
    """SLA definition."""

    sla_id: str
    name: str
    description: str

    # Targets
    response_hours: int  # Expected response time
    resolution_hours: int  # Expected resolution time

    # Applicability
    action_types: list[str] = []
    partner_types: list[str] = []
    priority_levels: list[str] = []

    # Business hours only
    business_hours_only: bool = False
    business_start_hour: int = 9
    business_end_hour: int = 18
    business_days: list[int] = [0, 1, 2, 3, 4]  # Mon-Fri


class SLATracking(BaseModel):
    """SLA tracking record."""

    tracking_id: str
    sla_id: str

    # Related entities
    case_id: str
    request_id: str
    partner_name: str

    # Timestamps
    started_at: datetime
    response_deadline: datetime
    resolution_deadline: datetime

    # Status
    status: SLAStatus = SLAStatus.ON_TRACK
    response_met: bool | None = None
    resolution_met: bool | None = None

    # Actual times
    first_response_at: datetime | None = None
    resolved_at: datetime | None = None

    # Metadata
    metadata: dict[str, Any] = {}


class EscalationManager:
    """Manages escalation rules and SLA tracking."""

    def __init__(self):
        self._escalation_rules: dict[str, EscalationRule] = {}
        self._sla_definitions: dict[str, SLADefinition] = {}
        self._sla_tracking: dict[str, SLATracking] = {}
        self._escalation_history: dict[str, list[dict[str, Any]]] = {}

        # Setup defaults
        self._setup_default_rules()
        self._setup_default_slas()

    def _setup_default_rules(self):
        """Setup default escalation rules."""
        self._escalation_rules = {
            "time_24h": EscalationRule(
                rule_id="time_24h",
                name="24 Hour Escalation",
                description="Escalate if no response within 24 hours",
                trigger_type="time",
                trigger_value=24,
                escalation_level=EscalationLevel.LEVEL_1,
                notify_roles=["supervisor"],
            ),
            "time_72h": EscalationRule(
                rule_id="time_72h",
                name="72 Hour Escalation",
                description="Escalate if no response within 72 hours",
                trigger_type="time",
                trigger_value=72,
                escalation_level=EscalationLevel.LEVEL_2,
                notify_roles=["manager"],
            ),
            "time_168h": EscalationRule(
                rule_id="time_168h",
                name="1 Week Escalation",
                description="Escalate if no response within 1 week",
                trigger_type="time",
                trigger_value=168,
                escalation_level=EscalationLevel.LEVEL_3,
                notify_roles=["director"],
            ),
            "critical_frozen": EscalationRule(
                rule_id="critical_frozen",
                name="Critical Freeze Escalation",
                description="Immediate escalation for critical freeze requests",
                trigger_type="status",
                trigger_value="failed",
                escalation_level=EscalationLevel.LEVEL_2,
                action_types=["freeze", "FREEZE_ACCOUNT"],
                priority_levels=["CRITICAL"],
            ),
        }

    def _setup_default_slas(self):
        """Setup default SLA definitions."""
        self._sla_definitions = {
            "freeze_request": SLADefinition(
                sla_id="freeze_request",
                name="Freeze Request SLA",
                description="SLA for freeze requests",
                response_hours=4,
                resolution_hours=24,
                action_types=["freeze", "FREEZE_ACCOUNT"],
                priority_levels=["CRITICAL", "HIGH"],
            ),
            "disclosure_request": SLADefinition(
                sla_id="disclosure_request",
                name="Disclosure Request SLA",
                description="SLA for disclosure requests",
                response_hours=24,
                resolution_hours=168,
                action_types=["disclosure", "DISCLOSURE_REQUEST"],
            ),
            "general_request": SLADefinition(
                sla_id="general_request",
                name="General Request SLA",
                description="SLA for general requests",
                response_hours=48,
                resolution_hours=336,
            ),
        }

    def start_sla_tracking(
        self,
        case_id: str,
        request_id: str,
        partner_name: str,
        action_type: str,
        priority: str = "MEDIUM",
    ) -> SLATracking:
        """Start SLA tracking for a request."""
        import uuid

        # Find applicable SLA
        sla = self._find_applicable_sla(action_type, priority)
        if not sla:
            sla = self._sla_definitions.get("general_request")

        # Calculate deadlines
        started_at = datetime.now(UTC)

        response_deadline = self._calculate_deadline(
            started_at,
            sla.response_hours,
            sla.business_hours_only,
            sla.business_start_hour,
            sla.business_end_hour,
            sla.business_days,
        )

        resolution_deadline = self._calculate_deadline(
            started_at,
            sla.resolution_hours,
            sla.business_hours_only,
            sla.business_start_hour,
            sla.business_end_hour,
            sla.business_days,
        )

        tracking = SLATracking(
            tracking_id=str(uuid.uuid4()),
            sla_id=sla.sla_id,
            case_id=case_id,
            request_id=request_id,
            partner_name=partner_name,
            started_at=started_at,
            response_deadline=response_deadline,
            resolution_deadline=resolution_deadline,
        )

        self._sla_tracking[tracking.tracking_id] = tracking

        return tracking

    def update_sla_status(
        self,
        tracking_id: str,
        first_response: bool = False,
        resolved: bool = False,
    ) -> SLATracking:
        """Update SLA tracking status."""
        tracking = self._sla_tracking.get(tracking_id)
        if not tracking:
            raise ValueError(f"Tracking not found: {tracking_id}")

        now = datetime.now(UTC)

        if first_response and not tracking.first_response_at:
            tracking.first_response_at = now
            tracking.response_met = now <= tracking.response_deadline

        if resolved and not tracking.resolved_at:
            tracking.resolved_at = now
            tracking.resolution_met = now <= tracking.resolution_deadline

        # Update status
        if tracking.resolved_at:
            tracking.status = SLAStatus.COMPLETED
        elif now > tracking.resolution_deadline or (
            now > tracking.response_deadline and not tracking.first_response_at
        ):
            tracking.status = SLAStatus.BREACHED
        elif now > tracking.response_deadline - timedelta(hours=24):
            tracking.status = SLAStatus.AT_RISK
        else:
            tracking.status = SLAStatus.ON_TRACK

        return tracking

    def check_escalations(
        self,
        case_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Check for items that need escalation."""
        escalations_needed = []

        now = datetime.now(UTC)

        for tracking in self._sla_tracking.values():
            if case_id and tracking.case_id != case_id:
                continue

            if tracking.status == SLAStatus.COMPLETED:
                continue

            # Check each escalation rule
            for rule in self._escalation_rules.values():
                if not rule.auto_escalate:
                    continue

                # Check trigger
                if rule.trigger_type == "time":
                    hours_elapsed = (now - tracking.started_at).total_seconds() / 3600
                    if hours_elapsed >= rule.trigger_value:
                        # Check cooldown
                        if self._is_in_cooldown(tracking.tracking_id, rule.rule_id):
                            continue

                        escalations_needed.append(
                            {
                                "tracking_id": tracking.tracking_id,
                                "case_id": tracking.case_id,
                                "request_id": tracking.request_id,
                                "partner": tracking.partner_name,
                                "rule": rule.rule_id,
                                "level": rule.escalation_level.value,
                                "notify_roles": rule.notify_roles,
                                "hours_elapsed": hours_elapsed,
                            }
                        )

        return escalations_needed

    def record_escalation(
        self,
        tracking_id: str,
        rule_id: str,
        escalated_by: str,
        reason: str,
    ) -> dict[str, Any]:
        """Record an escalation."""
        import uuid

        record = {
            "escalation_id": str(uuid.uuid4()),
            "tracking_id": tracking_id,
            "rule_id": rule_id,
            "escalated_by": escalated_by,
            "reason": reason,
            "escalated_at": datetime.now(UTC).isoformat(),
        }

        if tracking_id not in self._escalation_history:
            self._escalation_history[tracking_id] = []

        self._escalation_history[tracking_id].append(record)

        return record

    def get_escalation_history(
        self,
        tracking_id: str,
    ) -> list[dict[str, Any]]:
        """Get escalation history for a tracking record."""
        return self._escalation_history.get(tracking_id, [])

    def get_breached_slas(self) -> list[SLATracking]:
        """Get all breached SLAs."""
        return [
            t for t in self._sla_tracking.values() if t.status == SLAStatus.BREACHED
        ]

    def get_at_risk_slas(self) -> list[SLATracking]:
        """Get all at-risk SLAs."""
        return [t for t in self._sla_tracking.values() if t.status == SLAStatus.AT_RISK]

    def get_sla_statistics(self) -> dict[str, Any]:
        """Get SLA statistics."""
        tracking_records = list(self._sla_tracking.values())

        if not tracking_records:
            return {"total": 0}

        # Count by status
        by_status = {}
        for record in tracking_records:
            status = record.status.value
            by_status[status] = by_status.get(status, 0) + 1

        # Calculate compliance rates
        response_met = sum(1 for r in tracking_records if r.response_met)
        resolution_met = sum(1 for r in tracking_records if r.resolution_met)

        completed = [r for r in tracking_records if r.status == SLAStatus.COMPLETED]

        response_compliance = response_met / len(completed) * 100 if completed else 100
        resolution_compliance = (
            resolution_met / len(completed) * 100 if completed else 100
        )

        return {
            "total": len(tracking_records),
            "by_status": by_status,
            "response_compliance_percent": round(response_compliance, 2),
            "resolution_compliance_percent": round(resolution_compliance, 2),
            "breached_count": by_status.get("breached", 0),
            "at_risk_count": by_status.get("at_risk", 0),
        }

    def _find_applicable_sla(
        self,
        action_type: str,
        priority: str,
    ) -> SLADefinition | None:
        """Find the most specific applicable SLA."""
        best_sla = None
        best_score = 0

        for sla in self._sla_definitions.values():
            score = 0

            if sla.action_types and action_type in sla.action_types:
                score += 10

            if sla.priority_levels and priority in sla.priority_levels:
                score += 5

            if score > best_score:
                best_score = score
                best_sla = sla

        return best_sla

    def _calculate_deadline(
        self,
        start: datetime,
        hours: int,
        business_hours_only: bool = False,
        business_start: int = 9,
        business_end: int = 18,
        business_days: list[int] | None = None,
    ) -> datetime:
        """Calculate deadline considering business hours."""
        if not business_hours_only:
            return start + timedelta(hours=hours)

        # Simple business hours calculation
        deadline = start
        hours_remaining = hours

        while hours_remaining > 0:
            # Move to next day if needed
            if deadline.hour >= business_end:
                deadline = deadline + timedelta(days=1)
                deadline = deadline.replace(hour=business_start, minute=0, second=0)

            # Skip weekends
            while deadline.weekday() not in (business_days or [0, 1, 2, 3, 4]):
                deadline = deadline + timedelta(days=1)

            # Calculate available hours today
            available_today = min(business_end - deadline.hour, hours_remaining)

            deadline = deadline + timedelta(hours=available_today)
            hours_remaining -= available_today

        return deadline

    def _is_in_cooldown(
        self,
        tracking_id: str,
        rule_id: str,
    ) -> bool:
        """Check if an escalation is in cooldown."""
        history = self._escalation_history.get(tracking_id, [])
        rule = self._escalation_rules.get(rule_id)

        if not rule:
            return False

        # Find last escalation for this rule
        for record in reversed(history):
            if record.get("rule_id") == rule_id:
                last_escalated = datetime.fromisoformat(record["escalated_at"])
                cooldown_end = last_escalated + timedelta(hours=rule.cooldown_hours)

                if datetime.now(UTC) < cooldown_end:
                    return True

        return False

    def add_rule(self, rule: EscalationRule) -> None:
        """Add an escalation rule."""
        self._escalation_rules[rule.rule_id] = rule

    def remove_rule(self, rule_id: str) -> bool:
        """Remove an escalation rule."""
        if rule_id in self._escalation_rules:
            del self._escalation_rules[rule_id]
            return True
        return False

    def add_sla(self, sla: SLADefinition) -> None:
        """Add an SLA definition."""
        self._sla_definitions[sla.sla_id] = sla

    def remove_sla(self, sla_id: str) -> bool:
        """Remove an SLA definition."""
        if sla_id in self._sla_definitions:
            del self._sla_definitions[sla_id]
            return True
        return False
