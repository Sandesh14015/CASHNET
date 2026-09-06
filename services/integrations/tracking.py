"""Partner Response Tracking System.

Tracks the status of requests sent to external partners.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class TrackingStatus(StrEnum):
    """Tracking status."""

    QUEUED = "queued"
    SENT = "sent"
    ACKNOWLEDGED = "acknowledged"
    PROCESSING = "processing"
    COMPLETED = "completed"
    REJECTED = "rejected"
    FAILED = "failed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class PartnerType(StrEnum):
    """Partner types."""

    SAHYOG = "sahyog"
    NCRP = "ncrp"
    VASP = "vasp"
    BANK = "bank"
    EXCHANGE = "exchange"
    LAW_ENFORCEMENT = "law_enforcement"
    OTHER = "other"


class TrackingRecord(BaseModel):
    """Tracking record for a partner request."""

    tracking_id: str
    partner_type: PartnerType
    partner_name: str

    # Request details
    case_id: str
    request_type: str
    request_id: str

    # Status
    status: TrackingStatus = TrackingStatus.QUEUED
    status_history: list[dict[str, Any]] = []

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    sent_at: datetime | None = None
    acknowledged_at: datetime | None = None
    completed_at: datetime | None = None

    # SLA
    sla_deadline: datetime | None = None
    sla_breached: bool = False

    # Response
    response_data: dict[str, Any] = {}
    error_message: str | None = None
    retry_count: int = 0
    max_retries: int = 3

    # Metadata
    metadata: dict[str, Any] = {}


class PartnerTracker:
    """Tracks partner requests and responses."""

    def __init__(self):
        self._records: dict[str, TrackingRecord] = {}
        self._case_index: dict[str, list[str]] = {}
        self._partner_index: dict[str, list[str]] = {}

    def create_record(
        self,
        partner_type: PartnerType,
        partner_name: str,
        case_id: str,
        request_type: str,
        request_id: str,
        sla_hours: int | None = None,
        **kwargs,
    ) -> TrackingRecord:
        """Create a new tracking record."""
        import uuid

        tracking_id = str(uuid.uuid4())

        # Calculate SLA deadline
        sla_deadline = None
        if sla_hours:
            from datetime import timedelta

            sla_deadline = datetime.now(UTC) + timedelta(hours=sla_hours)

        record = TrackingRecord(
            tracking_id=tracking_id,
            partner_type=partner_type,
            partner_name=partner_name,
            case_id=case_id,
            request_type=request_type,
            request_id=request_id,
            sla_deadline=sla_deadline,
            **kwargs,
        )

        # Add initial status
        record.status_history.append(
            {
                "status": TrackingStatus.QUEUED.value,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )

        # Store record
        self._records[tracking_id] = record

        # Update indexes
        if case_id not in self._case_index:
            self._case_index[case_id] = []
        self._case_index[case_id].append(tracking_id)

        if partner_name not in self._partner_index:
            self._partner_index[partner_name] = []
        self._partner_index[partner_name].append(tracking_id)

        return record

    def update_status(
        self,
        tracking_id: str,
        status: TrackingStatus,
        response_data: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> TrackingRecord:
        """Update tracking status."""
        record = self._records.get(tracking_id)
        if not record:
            raise ValueError(f"Record not found: {tracking_id}")

        # Update status
        record.status = status
        record.status_history.append(
            {
                "status": status.value,
                "timestamp": datetime.now(UTC).isoformat(),
                "response_data": response_data,
                "error_message": error_message,
            }
        )

        # Update timestamps
        now = datetime.now(UTC)
        if status == TrackingStatus.SENT:
            record.sent_at = now
        elif status == TrackingStatus.ACKNOWLEDGED:
            record.acknowledged_at = now
        elif status in [
            TrackingStatus.COMPLETED,
            TrackingStatus.REJECTED,
            TrackingStatus.FAILED,
        ]:
            record.completed_at = now

        # Update response data
        if response_data:
            record.response_data.update(response_data)

        if error_message:
            record.error_message = error_message

        # Check SLA
        if record.sla_deadline and now > record.sla_deadline:
            record.sla_breached = True

        return record

    def get_record(self, tracking_id: str) -> TrackingRecord | None:
        """Get a tracking record by ID."""
        return self._records.get(tracking_id)

    def get_records_by_case(self, case_id: str) -> list[TrackingRecord]:
        """Get all tracking records for a case."""
        tracking_ids = self._case_index.get(case_id, [])
        return [self._records[tid] for tid in tracking_ids if tid in self._records]

    def get_records_by_partner(self, partner_name: str) -> list[TrackingRecord]:
        """Get all tracking records for a partner."""
        tracking_ids = self._partner_index.get(partner_name, [])
        return [self._records[tid] for tid in tracking_ids if tid in self._records]

    def get_pending_requests(self) -> list[TrackingRecord]:
        """Get all pending requests."""
        return [
            r
            for r in self._records.values()
            if r.status
            in [
                TrackingStatus.QUEUED,
                TrackingStatus.SENT,
                TrackingStatus.ACKNOWLEDGED,
                TrackingStatus.PROCESSING,
            ]
        ]

    def get_failed_requests(self) -> list[TrackingRecord]:
        """Get all failed requests."""
        return [r for r in self._records.values() if r.status == TrackingStatus.FAILED]

    def get_sla_breached_requests(self) -> list[TrackingRecord]:
        """Get all SLA breached requests."""
        return [r for r in self._records.values() if r.sla_breached]

    def get_requests_needing_retry(self) -> list[TrackingRecord]:
        """Get requests that need retry."""
        return [
            r
            for r in self._records.values()
            if r.status == TrackingStatus.FAILED and r.retry_count < r.max_retries
        ]

    def can_retry(self, tracking_id: str) -> bool:
        """Check if a request can be retried."""
        record = self._records.get(tracking_id)
        if not record:
            return False

        return (
            record.status == TrackingStatus.FAILED
            and record.retry_count < record.max_retries
        )

    def increment_retry(self, tracking_id: str) -> TrackingRecord:
        """Increment retry count."""
        record = self._records.get(tracking_id)
        if not record:
            raise ValueError(f"Record not found: {tracking_id}")

        record.retry_count += 1
        record.status = TrackingStatus.QUEUED

        record.status_history.append(
            {
                "status": "retry",
                "timestamp": datetime.now(UTC).isoformat(),
                "retry_count": record.retry_count,
            }
        )

        return record

    def cancel_request(self, tracking_id: str) -> TrackingRecord:
        """Cancel a request."""
        return self.update_status(
            tracking_id,
            TrackingStatus.CANCELLED,
        )

    def get_statistics(self) -> dict[str, Any]:
        """Get tracking statistics."""
        records = list(self._records.values())

        if not records:
            return {"total": 0}

        # Count by status
        by_status = {}
        for record in records:
            status = record.status.value
            by_status[status] = by_status.get(status, 0) + 1

        # Count by partner type
        by_partner_type = {}
        for record in records:
            partner_type = record.partner_type.value
            by_partner_type[partner_type] = by_partner_type.get(partner_type, 0) + 1

        # Count by partner name
        by_partner_name = {}
        for record in records:
            partner_name = record.partner_name
            by_partner_name[partner_name] = by_partner_name.get(partner_name, 0) + 1

        # SLA metrics
        sla_records = [r for r in records if r.sla_deadline]
        breached = [r for r in sla_records if r.sla_breached]
        sla_compliance = (
            (len(sla_records) - len(breached)) / len(sla_records) * 100
            if sla_records
            else 100
        )

        # Average completion time
        completion_times = []
        for record in records:
            if record.completed_at and record.sent_at:
                time_diff = (record.completed_at - record.sent_at).total_seconds()
                completion_times.append(time_diff)

        avg_completion_time = (
            sum(completion_times) / len(completion_times) if completion_times else 0
        )

        return {
            "total": len(records),
            "by_status": by_status,
            "by_partner_type": by_partner_type,
            "by_partner_name": by_partner_name,
            "sla_compliance_percent": round(sla_compliance, 2),
            "sla_breached_count": len(breached),
            "average_completion_time_seconds": round(avg_completion_time, 2),
            "pending_count": by_status.get("queued", 0) + by_status.get("sent", 0),
            "failed_count": by_status.get("failed", 0),
        }

    def get_dashboard_data(self) -> dict[str, Any]:
        """Get dashboard data."""
        stats = self.get_statistics()

        # Get recent activity
        recent_records = sorted(
            self._records.values(),
            key=lambda r: r.created_at,
            reverse=True,
        )[:10]

        return {
            "statistics": stats,
            "recent_activity": [
                {
                    "tracking_id": r.tracking_id,
                    "partner": r.partner_name,
                    "case_id": r.case_id,
                    "status": r.status.value,
                    "created_at": r.created_at.isoformat(),
                }
                for r in recent_records
            ],
            "pending_requests": [
                {
                    "tracking_id": r.tracking_id,
                    "partner": r.partner_name,
                    "case_id": r.case_id,
                    "status": r.status.value,
                    "sla_deadline": (
                        r.sla_deadline.isoformat() if r.sla_deadline else None
                    ),
                }
                for r in self.get_pending_requests()[:5]
            ],
            "sla_breached": [
                {
                    "tracking_id": r.tracking_id,
                    "partner": r.partner_name,
                    "case_id": r.case_id,
                    "sla_deadline": (
                        r.sla_deadline.isoformat() if r.sla_deadline else None
                    ),
                }
                for r in self.get_sla_breached_requests()[:5]
            ],
        }
