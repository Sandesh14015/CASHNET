"""RBAC/ABAC Authorization System for CashNet.

Provides role-based and attribute-based access control for all resources.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel

from .models import ROLE_PERMISSIONS, Permission, UserRole


class ResourceType(StrEnum):
    """Resource types in the system."""

    CASE = "case"
    FINDING = "finding"
    EVIDENCE = "evidence"
    ACTION_REQUEST = "action_request"
    ENTITY = "entity"
    CLUSTER = "cluster"
    USER = "user"
    AUDIT_LOG = "audit_log"
    TAG = "tag"


class Action(StrEnum):
    """Actions that can be performed on resources."""

    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    ASSIGN = "assign"
    APPROVE = "approve"
    SEND = "send"
    VERIFY = "verify"
    ADMONICATE = "adjudicate"


class Resource(BaseModel):
    """Resource being accessed."""

    type: ResourceType
    id: str | None = None
    owner_id: str | None = None
    jurisdiction: str | None = None
    classification: str | None = None
    metadata: dict[str, Any] = {}


class AccessContext(BaseModel):
    """Context for access control decisions."""

    user_id: str
    user_role: UserRole
    permissions: list[str]
    department: str | None = None
    ip_address: str | None = None
    timestamp: datetime = datetime.now(UTC)


class AccessDecision(BaseModel):
    """Access control decision."""

    allowed: bool
    reason: str
    conditions: list[str] = []
    evaluated_at: datetime = datetime.now(UTC)


class Policy(BaseModel):
    """Access control policy."""

    id: str
    name: str
    description: str
    resource_type: ResourceType
    action: Action
    effect: str  # "allow" or "deny"
    conditions: list[Callable[[AccessContext, Resource], bool]] = []
    priority: int = 0


class AuthorizationService:
    """RBAC/ABAC Authorization Service."""

    def __init__(self):
        self.policies: list[Policy] = []
        self._setup_default_policies()

    def _setup_default_policies(self):
        """Setup default RBAC policies."""

        # Admin can do everything
        self.policies.append(
            Policy(
                id="admin-all",
                name="Admin Full Access",
                description="Admins have full access to all resources",
                resource_type=ResourceType.CASE,
                action=Action.CREATE,
                effect="allow",
                conditions=[lambda ctx, res: ctx.user_role == UserRole.ADMIN],
                priority=100,
            )
        )

        # Supervisor policies
        self.policies.append(
            Policy(
                id="supervisor-case-assign",
                name="Supervisor Can Assign Cases",
                description="Supervisors can assign cases",
                resource_type=ResourceType.CASE,
                action=Action.ASSIGN,
                effect="allow",
                conditions=[lambda ctx, res: ctx.user_role == UserRole.SUPERVISOR],
                priority=90,
            )
        )

        self.policies.append(
            Policy(
                id="supervisor-approve",
                name="Supervisor Can Approve Actions",
                description="Supervisors can approve action requests",
                resource_type=ResourceType.ACTION_REQUEST,
                action=Action.APPROVE,
                effect="allow",
                conditions=[
                    lambda ctx, res: (
                        ctx.user_role in [UserRole.SUPERVISOR, UserRole.ADMIN]
                    )
                ],
                priority=90,
            )
        )

        # Investigator policies
        self.policies.append(
            Policy(
                id="investigator-case-read",
                name="Investigator Can Read Assigned Cases",
                description="Investigators can read cases they are assigned to",
                resource_type=ResourceType.CASE,
                action=Action.READ,
                effect="allow",
                conditions=[
                    lambda ctx, res: ctx.user_role == UserRole.INVESTIGATOR,
                    lambda ctx, res: (
                        res.owner_id == ctx.user_id or res.owner_id is None
                    ),
                ],
                priority=80,
            )
        )

        self.policies.append(
            Policy(
                id="investigator-case-update",
                name="Investigator Can Update Assigned Cases",
                description="Investigators can update cases they are assigned to",
                resource_type=ResourceType.CASE,
                action=Action.UPDATE,
                effect="allow",
                conditions=[
                    lambda ctx, res: ctx.user_role == UserRole.INVESTIGATOR,
                    lambda ctx, res: res.owner_id == ctx.user_id,
                ],
                priority=80,
            )
        )

        # Analyst policies
        self.policies.append(
            Policy(
                id="analyst-read-only",
                name="Analyst Read-Only Access",
                description="Analysts can read all resources but not modify",
                resource_type=ResourceType.CASE,
                action=Action.READ,
                effect="allow",
                conditions=[lambda ctx, res: ctx.user_role == UserRole.ANALYST],
                priority=70,
            )
        )

        # Viewer policies
        self.policies.append(
            Policy(
                id="viewer-read-only",
                name="Viewer Read-Only Access",
                description="Viewers can read resources but not modify",
                resource_type=ResourceType.CASE,
                action=Action.READ,
                effect="allow",
                conditions=[lambda ctx, res: ctx.user_role == UserRole.VIEWER],
                priority=60,
            )
        )

        # Deny policies (higher priority)
        self.policies.append(
            Policy(
                id="deny-delete-non-admin",
                name="Deny Delete for Non-Admins",
                description="Only admins can delete resources",
                resource_type=ResourceType.CASE,
                action=Action.DELETE,
                effect="deny",
                conditions=[lambda ctx, res: ctx.user_role != UserRole.ADMIN],
                priority=200,
            )
        )

        self.policies.append(
            Policy(
                id="deny-approve-non-supervisor",
                name="Deny Approve for Non-Supervisors",
                description="Only supervisors and admins can approve actions",
                resource_type=ResourceType.ACTION_REQUEST,
                action=Action.APPROVE,
                effect="deny",
                conditions=[
                    lambda ctx, res: (
                        ctx.user_role not in [UserRole.SUPERVISOR, UserRole.ADMIN]
                    )
                ],
                priority=200,
            )
        )

    def add_policy(self, policy: Policy) -> None:
        """Add a custom policy."""
        self.policies.append(policy)

    def remove_policy(self, policy_id: str) -> bool:
        """Remove a policy by ID."""
        for i, policy in enumerate(self.policies):
            if policy.id == policy_id:
                self.policies.pop(i)
                return True
        return False

    def evaluate(
        self,
        context: AccessContext,
        resource: Resource,
        action: Action,
    ) -> AccessDecision:
        """Evaluate access control for a request."""
        # Sort policies by priority (highest first)
        sorted_policies = sorted(self.policies, key=lambda p: p.priority, reverse=True)

        # Check policies in priority order
        for policy in sorted_policies:
            # Check if policy applies to this resource type and action
            if policy.resource_type != resource.type or policy.action != action:
                continue

            # Evaluate all conditions
            conditions_met = all(
                condition(context, resource) for condition in policy.conditions
            )

            if conditions_met:
                return AccessDecision(
                    allowed=policy.effect == "allow",
                    reason=f"Policy '{policy.name}' matched",
                    conditions=[f"Effect: {policy.effect}"],
                )

        # Default deny if no policy matches
        return AccessDecision(
            allowed=False,
            reason="No matching policy found",
            conditions=["Default deny"],
        )

    def check_permission(
        self,
        context: AccessContext,
        permission: Permission,
    ) -> AccessDecision:
        """Check if user has a specific permission."""
        if permission.value in context.permissions:
            return AccessDecision(
                allowed=True,
                reason="Permission granted",
            )

        return AccessDecision(
            allowed=False,
            reason=f"Permission '{permission.value}' not granted",
        )

    def get_user_permissions(self, role: UserRole) -> list[str]:
        """Get all permissions for a role."""
        return [p.value for p in ROLE_PERMISSIONS.get(role, [])]

    def filter_resources(
        self,
        context: AccessContext,
        resources: list[Resource],
        action: Action,
    ) -> list[Resource]:
        """Filter resources based on access control."""
        allowed = []
        for resource in resources:
            decision = self.evaluate(context, resource, action)
            if decision.allowed:
                allowed.append(resource)
        return allowed


# Dependency for FastAPI
def get_authorization_service() -> AuthorizationService:
    """Get the authorization service instance."""
    return AuthorizationService()
