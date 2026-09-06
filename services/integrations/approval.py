"""Approval Workflow Service.

Provides policy-based approval workflow for action requests.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ApprovalStatus(StrEnum):
    """Approval status."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"
    EXPIRED = "expired"


class ApprovalLevel(StrEnum):
    """Approval levels."""

    L1 = "l1"  # Supervisor
    L2 = "l2"  # Manager
    L3 = "l3"  # Director
    EMERGENCY = "emergency"


class ApprovalRequest(BaseModel):
    """Approval request."""

    request_id: str
    action_type: str
    case_id: str
    requested_by: str
    requested_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Request details
    target_entity: str | None = None
    target_address: str | None = None
    target_jurisdiction: str | None = None
    amount: float | None = None
    reason: str = ""

    # Policy context
    risk_score: float | None = None
    classification: str | None = None
    priority: str = "MEDIUM"

    # Status
    status: ApprovalStatus = ApprovalStatus.PENDING
    current_level: ApprovalLevel = ApprovalLevel.L1

    # Approval chain
    approval_chain: list[dict[str, Any]] = []

    # Metadata
    metadata: dict[str, Any] = {}


class ApprovalDecision(BaseModel):
    """Approval decision."""

    decision_id: str
    request_id: str
    approver_id: str
    approver_role: str
    decision: ApprovalStatus
    level: ApprovalLevel
    comments: str | None = None
    decided_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PolicyRule(BaseModel):
    """Policy rule for approval."""

    rule_id: str
    name: str
    description: str

    # Conditions
    action_types: list[str] = []
    risk_score_threshold: float | None = None
    amount_threshold: float | None = None
    jurisdiction: str | None = None
    classification: str | None = None

    # Requirements
    required_level: ApprovalLevel = ApprovalLevel.L1
    required_approvers: int = 1
    require_same_jurisdiction: bool = False

    # Auto-approval
    auto_approve: bool = False
    auto_approve_conditions: dict[str, Any] = {}


class ApprovalWorkflow:
    """Manages approval workflow for action requests."""

    def __init__(self):
        self._requests: dict[str, ApprovalRequest] = {}
        self._decisions: dict[str, list[ApprovalDecision]] = {}
        self._policies: list[PolicyRule] = []

        # Setup default policies
        self._setup_default_policies()

    def _setup_default_policies(self):
        """Setup default approval policies."""
        self._policies = [
            PolicyRule(
                rule_id="freeze_high_value",
                name="High Value Freeze",
                description="Requires L2 approval for freeze requests > 100000",
                action_types=["freeze", "FREEZE_ACCOUNT"],
                amount_threshold=100000,
                required_level=ApprovalLevel.L2,
                required_approvers=2,
            ),
            PolicyRule(
                rule_id="disclosure_request",
                name="Disclosure Request",
                description="Requires L1 approval for disclosure requests",
                action_types=["disclosure", "DISCLOSURE_REQUEST"],
                required_level=ApprovalLevel.L1,
                required_approvers=1,
            ),
            PolicyRule(
                rule_id="cross_border",
                name="Cross-Border Action",
                description="Requires L2 approval for cross-border actions",
                jurisdiction="international",
                required_level=ApprovalLevel.L2,
                required_approvers=2,
                require_same_jurisdiction=True,
            ),
            PolicyRule(
                rule_id="high_risk",
                name="High Risk Action",
                description="Requires L2 approval for high-risk actions",
                risk_score_threshold=0.8,
                required_level=ApprovalLevel.L2,
                required_approvers=2,
            ),
            PolicyRule(
                rule_id="emergency",
                name="Emergency Action",
                description="Emergency approval can bypass normal workflow",
                action_types=["EMERGENCY_FREEZE"],
                required_level=ApprovalLevel.EMERGENCY,
                required_approvers=1,
                auto_approve=False,
            ),
        ]

    def create_request(
        self,
        action_type: str,
        case_id: str,
        requested_by: str,
        **kwargs,
    ) -> ApprovalRequest:
        """Create a new approval request."""
        import uuid

        request = ApprovalRequest(
            request_id=str(uuid.uuid4()),
            action_type=action_type,
            case_id=case_id,
            requested_by=requested_by,
            **kwargs,
        )

        # Apply policy
        policy = self._find_applicable_policy(request)
        if policy:
            request.current_level = policy.required_level

        # Store request
        self._requests[request.request_id] = request
        self._decisions[request.request_id] = []

        # Check for auto-approval
        if (
            policy
            and policy.auto_approve
            and self._check_auto_approve_conditions(request, policy)
        ):
            request.status = ApprovalStatus.APPROVED
            self._add_decision(
                request.request_id,
                approver_id="SYSTEM",
                approver_role="SYSTEM",
                decision=ApprovalStatus.APPROVED,
                level=ApprovalLevel.L1,
                comments="Auto-approved by policy",
            )

        return request

    def approve(
        self,
        request_id: str,
        approver_id: str,
        approver_role: str,
        comments: str | None = None,
    ) -> ApprovalDecision:
        """Approve a request."""
        request = self._requests.get(request_id)
        if not request:
            raise ValueError(f"Request not found: {request_id}")

        if request.status != ApprovalStatus.PENDING:
            raise ValueError(f"Request is not pending: {request.status}")

        # Check approver authority
        if not self._check_approver_authority(approver_role, request.current_level):
            raise ValueError(
                f"Insufficient authority for approval level {request.current_level}"
            )

        # Add decision
        decision = self._add_decision(
            request_id,
            approver_id,
            approver_role,
            ApprovalStatus.APPROVED,
            request.current_level,
            comments,
        )

        # Check if request is fully approved
        if self._is_fully_approved(request):
            request.status = ApprovalStatus.APPROVED

        return decision

    def reject(
        self,
        request_id: str,
        rejector_id: str,
        rejector_role: str,
        reason: str,
    ) -> ApprovalDecision:
        """Reject a request."""
        request = self._requests.get(request_id)
        if not request:
            raise ValueError(f"Request not found: {request_id}")

        if request.status != ApprovalStatus.PENDING:
            raise ValueError(f"Request is not pending: {request.status}")

        # Add decision
        decision = self._add_decision(
            request_id,
            rejector_id,
            rejector_role,
            ApprovalStatus.REJECTED,
            request.current_level,
            reason,
        )

        request.status = ApprovalStatus.REJECTED

        return decision

    def escalate(
        self,
        request_id: str,
        reason: str,
    ) -> ApprovalRequest:
        """Escalate a request to the next level."""
        request = self._requests.get(request_id)
        if not request:
            raise ValueError(f"Request not found: {request_id}")

        # Determine next level
        next_level = self._get_next_level(request.current_level)
        if not next_level:
            raise ValueError("Cannot escalate further")

        request.current_level = next_level
        request.status = ApprovalStatus.ESCALATED
        request.metadata["escalation_reason"] = reason
        request.metadata["escalated_at"] = datetime.now(UTC).isoformat()

        return request

    def get_request(self, request_id: str) -> ApprovalRequest | None:
        """Get a request by ID."""
        return self._requests.get(request_id)

    def get_pending_requests(
        self,
        level: ApprovalLevel | None = None,
    ) -> list[ApprovalRequest]:
        """Get all pending requests."""
        results = []
        for request in self._requests.values():
            if request.status == ApprovalStatus.PENDING:
                if level is None or request.current_level == level:
                    results.append(request)
        return results

    def get_requests_by_case(self, case_id: str) -> list[ApprovalRequest]:
        """Get all requests for a case."""
        return [r for r in self._requests.values() if r.case_id == case_id]

    def get_decision_history(self, request_id: str) -> list[ApprovalDecision]:
        """Get decision history for a request."""
        return self._decisions.get(request_id, [])

    def add_policy(self, policy: PolicyRule) -> None:
        """Add a custom policy rule."""
        self._policies.append(policy)

    def remove_policy(self, rule_id: str) -> bool:
        """Remove a policy rule."""
        for i, policy in enumerate(self._policies):
            if policy.rule_id == rule_id:
                self._policies.pop(i)
                return True
        return False

    def _find_applicable_policy(
        self,
        request: ApprovalRequest,
    ) -> PolicyRule | None:
        """Find the most specific applicable policy."""
        best_policy = None
        best_score = 0

        for policy in self._policies:
            score = 0

            # Check action type
            if policy.action_types and request.action_type in policy.action_types:
                score += 10

            # Check risk score
            if policy.risk_score_threshold and request.risk_score:
                if request.risk_score >= policy.risk_score_threshold:
                    score += 5

            # Check amount
            if policy.amount_threshold and request.amount:
                if request.amount >= policy.amount_threshold:
                    score += 5

            # Check jurisdiction
            if policy.jurisdiction and request.target_jurisdiction:
                if policy.jurisdiction == request.target_jurisdiction:
                    score += 3

            # Check classification
            if policy.classification and request.classification:
                if policy.classification == request.classification:
                    score += 3

            if score > best_score:
                best_score = score
                best_policy = policy

        return best_policy

    def _check_auto_approve_conditions(
        self,
        request: ApprovalRequest,
        policy: PolicyRule,
    ) -> bool:
        """Check if auto-approve conditions are met."""
        conditions = policy.auto_approve_conditions

        # Check risk score
        if "max_risk_score" in conditions:
            if request.risk_score and request.risk_score > conditions["max_risk_score"]:
                return False

        # Check amount
        if "max_amount" in conditions:
            if request.amount and request.amount > conditions["max_amount"]:
                return False

        return True

    def _check_approver_authority(
        self,
        approver_role: str,
        required_level: ApprovalLevel,
    ) -> bool:
        """Check if approver has authority for the required level."""
        authority_map = {
            "admin": [
                ApprovalLevel.L1,
                ApprovalLevel.L2,
                ApprovalLevel.L3,
                ApprovalLevel.EMERGENCY,
            ],
            "supervisor": [ApprovalLevel.L1],
            "manager": [ApprovalLevel.L1, ApprovalLevel.L2],
            "director": [ApprovalLevel.L1, ApprovalLevel.L2, ApprovalLevel.L3],
        }

        allowed_levels = authority_map.get(approver_role.lower(), [])
        return required_level in allowed_levels

    def _is_fully_approved(self, request: ApprovalRequest) -> bool:
        """Check if request is fully approved."""
        policy = self._find_applicable_policy(request)
        if not policy:
            return True

        decisions = self._decisions.get(request.request_id, [])
        approvals = [d for d in decisions if d.decision == ApprovalStatus.APPROVED]

        return len(approvals) >= policy.required_approvers

    def _get_next_level(self, current_level: ApprovalLevel) -> ApprovalLevel | None:
        """Get the next approval level."""
        levels = [
            ApprovalLevel.L1,
            ApprovalLevel.L2,
            ApprovalLevel.L3,
        ]

        try:
            current_index = levels.index(current_level)
            if current_index < len(levels) - 1:
                return levels[current_index + 1]
        except ValueError:
            pass

        return None

    def _add_decision(
        self,
        request_id: str,
        approver_id: str,
        approver_role: str,
        decision: ApprovalStatus,
        level: ApprovalLevel,
        comments: str | None = None,
    ) -> ApprovalDecision:
        """Add a decision to the request."""
        import uuid

        decision_obj = ApprovalDecision(
            decision_id=str(uuid.uuid4()),
            request_id=request_id,
            approver_id=approver_id,
            approver_role=approver_role,
            decision=decision,
            level=level,
            comments=comments,
        )

        if request_id not in self._decisions:
            self._decisions[request_id] = []

        self._decisions[request_id].append(decision_obj)

        return decision_obj

    def get_statistics(self) -> dict[str, Any]:
        """Get workflow statistics."""
        requests = list(self._requests.values())

        if not requests:
            return {"total": 0}

        # Count by status
        by_status = {}
        for request in requests:
            status = request.status.value
            by_status[status] = by_status.get(status, 0) + 1

        # Count by level
        by_level = {}
        for request in requests:
            level = request.current_level.value
            by_level[level] = by_level.get(level, 0) + 1

        # Average approval time
        approval_times = []
        for request in requests:
            if request.status == ApprovalStatus.APPROVED:
                decisions = self._decisions.get(request.request_id, [])
                if decisions:
                    last_decision = decisions[-1]
                    time_diff = (
                        last_decision.decided_at - request.requested_at
                    ).total_seconds()
                    approval_times.append(time_diff)

        avg_approval_time = (
            sum(approval_times) / len(approval_times) if approval_times else 0
        )

        return {
            "total": len(requests),
            "by_status": by_status,
            "by_level": by_level,
            "average_approval_time_seconds": avg_approval_time,
            "pending_count": by_status.get("pending", 0),
        }
