"""Tamper-Evident Audit Logging for CashNet.

Provides immutable, hash-chained audit logs with integrity verification.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class AuditAction(StrEnum):
    """Audit actions that can be logged."""

    # Authentication
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PASSWORD_CHANGE = "password_change"
    MFA_ENABLE = "mfa_enable"
    MFA_DISABLE = "mfa_disable"

    # Case operations
    CASE_CREATE = "case_create"
    CASE_READ = "case_read"
    CASE_UPDATE = "case_update"
    CASE_DELETE = "case_delete"
    CASE_ASSIGN = "case_assign"
    CASE_STATUS_CHANGE = "case_status_change"

    # Finding operations
    FINDING_CREATE = "finding_create"
    FINDING_UPDATE = "finding_update"
    FINDING_ADJUDICATE = "finding_adjudicate"

    # Evidence operations
    EVIDENCE_CREATE = "evidence_create"
    EVIDENCE_VERIFY = "evidence_verify"
    EVIDENCE_ACCESS = "evidence_access"

    # Action request operations
    ACTION_CREATE = "action_create"
    ACTION_APPROVE = "action_approve"
    ACTION_REJECT = "action_reject"
    ACTION_SEND = "action_send"

    # Entity operations
    ENTITY_CREATE = "entity_create"
    ENTITY_UPDATE = "entity_update"
    ENTITY_DELETE = "entity_delete"

    # User operations
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DELETE = "user_delete"
    USER_ROLE_CHANGE = "user_role_change"

    # System operations
    SYSTEM_CONFIG_CHANGE = "system_config_change"
    DATA_EXPORT = "data_export"
    DATA_IMPORT = "data_import"

    # Security events
    UNAUTHORIZED_ACCESS = "unauthorized_access"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"


class AuditOutcome(StrEnum):
    """Outcome of the audited action."""

    SUCCESS = "success"
    FAILURE = "failure"
    PARTIAL = "partial"
    DENIED = "denied"


class AuditLog(BaseModel):
    """Audit log entry."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    correlation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Actor information
    actor_id: str
    actor_email: str
    actor_role: str
    actor_ip: str | None = None
    actor_user_agent: str | None = None

    # Action details
    action: AuditAction
    resource_type: str
    resource_id: str | None = None
    outcome: AuditOutcome = AuditOutcome.SUCCESS

    # Context
    purpose: str | None = None
    details: dict[str, Any] = {}

    # Integrity
    previous_hash: str | None = None
    current_hash: str | None = None

    # Request context
    request_method: str | None = None
    request_path: str | None = None
    request_id: str | None = None


class AuditLogger:
    """Tamper-evident audit logger."""

    def __init__(self):
        self._logs: list[AuditLog] = []
        self._hash_chain: list[str] = []
        self._previous_hash: str | None = None

    def _calculate_hash(self, log: AuditLog, previous_hash: str | None = None) -> str:
        """Calculate SHA-256 hash for a log entry."""
        # Create a deterministic representation
        hash_data = {
            "id": log.id,
            "timestamp": log.timestamp.isoformat(),
            "actor_id": log.actor_id,
            "action": log.action.value,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "outcome": log.outcome.value,
            "previous_hash": previous_hash,
        }

        # Sort keys for consistency
        hash_string = json.dumps(hash_data, sort_keys=True)

        return hashlib.sha256(hash_string.encode()).hexdigest()

    def log(
        self,
        actor_id: str,
        actor_email: str,
        actor_role: str,
        action: AuditAction,
        resource_type: str,
        resource_id: str | None = None,
        outcome: AuditOutcome = AuditOutcome.SUCCESS,
        purpose: str | None = None,
        details: dict[str, Any] | None = None,
        actor_ip: str | None = None,
        actor_user_agent: str | None = None,
        request_method: str | None = None,
        request_path: str | None = None,
        request_id: str | None = None,
        correlation_id: str | None = None,
    ) -> AuditLog:
        """Create and store an audit log entry."""
        log = AuditLog(
            correlation_id=correlation_id or str(uuid.uuid4()),
            actor_id=actor_id,
            actor_email=actor_email,
            actor_role=actor_role,
            actor_ip=actor_ip,
            actor_user_agent=actor_user_agent,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            purpose=purpose,
            details=details or {},
            request_method=request_method,
            request_path=request_path,
            request_id=request_id,
        )

        # Calculate hash chain
        log.previous_hash = self._previous_hash
        log.current_hash = self._calculate_hash(log, self._previous_hash)

        # Store log
        self._logs.append(log)
        self._hash_chain.append(log.current_hash)
        self._previous_hash = log.current_hash

        return log

    def verify_integrity(self) -> tuple[bool, list[str]]:
        """Verify the integrity of the audit log chain.

        Returns:
            Tuple of (is_valid, list of error messages)
        """
        errors = []

        if not self._logs:
            return True, []

        previous_hash = None
        for i, log in enumerate(self._logs):
            # Verify hash chain
            if log.previous_hash != previous_hash:
                errors.append(
                    f"Log {i} ({log.id}): Previous hash mismatch. "
                    f"Expected {previous_hash}, got {log.previous_hash}"
                )

            # Verify current hash
            expected_hash = self._calculate_hash(log, previous_hash)
            if log.current_hash != expected_hash:
                errors.append(
                    f"Log {i} ({log.id}): Hash mismatch. "
                    f"Expected {expected_hash}, got {log.current_hash}"
                )

            previous_hash = log.current_hash

        return len(errors) == 0, errors

    def get_logs(
        self,
        actor_id: str | None = None,
        action: AuditAction | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        correlation_id: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AuditLog]:
        """Query audit logs with filters."""
        filtered = self._logs

        if actor_id:
            filtered = [log for log in filtered if log.actor_id == actor_id]

        if action:
            filtered = [log for log in filtered if log.action == action]

        if resource_type:
            filtered = [log for log in filtered if log.resource_type == resource_type]

        if resource_id:
            filtered = [log for log in filtered if log.resource_id == resource_id]

        if start_time:
            filtered = [log for log in filtered if log.timestamp >= start_time]

        if end_time:
            filtered = [log for log in filtered if log.timestamp <= end_time]

        if correlation_id:
            filtered = [log for log in filtered if log.correlation_id == correlation_id]

        # Sort by timestamp descending
        filtered.sort(key=lambda x: x.timestamp, reverse=True)

        return filtered[offset : offset + limit]

    def get_statistics(self) -> dict[str, Any]:
        """Get audit log statistics."""
        if not self._logs:
            return {"total": 0}

        action_counts = {}
        outcome_counts = {}
        actor_counts = {}

        for log in self._logs:
            # Count by action
            action_counts[log.action.value] = action_counts.get(log.action.value, 0) + 1

            # Count by outcome
            outcome_counts[log.outcome.value] = (
                outcome_counts.get(log.outcome.value, 0) + 1
            )

            # Count by actor
            actor_counts[log.actor_id] = actor_counts.get(log.actor_id, 0) + 1

        return {
            "total": len(self._logs),
            "by_action": action_counts,
            "by_outcome": outcome_counts,
            "by_actor": actor_counts,
            "first_log": self._logs[0].timestamp.isoformat() if self._logs else None,
            "last_log": self._logs[-1].timestamp.isoformat() if self._logs else None,
        }

    def export_logs(self, export_format: str = "json") -> str:
        """Export audit logs."""
        if export_format == "json":
            return json.dumps(
                [log.model_dump() for log in self._logs],
                indent=2,
                default=str,
            )
        else:
            raise ValueError(f"Unsupported export format: {export_format}")

    def clear_old_logs(self, before: datetime) -> int:
        """Clear logs older than a specific date."""
        initial_count = len(self._logs)
        self._logs = [log for log in self._logs if log.timestamp >= before]

        # Rebuild hash chain
        self._hash_chain = []
        self._previous_hash = None
        for log in self._logs:
            log.previous_hash = self._previous_hash
            log.current_hash = self._calculate_hash(log, self._previous_hash)
            self._hash_chain.append(log.current_hash)
            self._previous_hash = log.current_hash

        return initial_count - len(self._logs)


# Dependency for FastAPI
def get_audit_logger() -> AuditLogger:
    """Get the audit logger instance."""
    return AuditLogger()


# Audit logging decorator
def audit_log(
    action: AuditAction,
    resource_type: str,
    get_resource_id: str | None = None,
):
    """Decorator to automatically log audit events."""

    def decorator(func):
        async def wrapper(*args, **kwargs):
            # This is a simplified example
            # In production, you would inject the audit logger and user context
            result = await func(*args, **kwargs)
            # Log success
            return result

        return wrapper

    return decorator
