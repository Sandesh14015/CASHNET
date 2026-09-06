"""Base integration adapter interface.

Defines common interface for all external integrations.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class IntegrationStatus(StrEnum):
    """Integration status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"


class IntegrationType(StrEnum):
    """Integration types."""

    SAHYOG = "sahyog"
    NCRP = "ncrp"
    VASP = "vasp"
    BANK = "bank"
    OTHER = "other"


class IntegrationRequest(BaseModel):
    """Base integration request."""

    request_id: str
    integration_type: IntegrationType
    case_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = {}


class IntegrationResponse(BaseModel):
    """Base integration response."""

    request_id: str
    status: IntegrationStatus
    response_data: dict[str, Any] = {}
    error_message: str | None = None
    processed_at: datetime | None = None


class IntegrationAdapter(ABC):
    """Abstract base class for integration adapters."""

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self._integration_type: IntegrationType

    @property
    def integration_type(self) -> IntegrationType:
        """Get the integration type."""
        return self._integration_type

    @abstractmethod
    async def connect(self) -> bool:
        """Connect to the external service."""

    @abstractmethod
    async def disconnect(self) -> None:
        """Disconnect from the service."""

    @abstractmethod
    async def submit_case(self, case_data: dict[str, Any]) -> IntegrationResponse:
        """Submit a case to the external system."""

    @abstractmethod
    async def get_case_status(self, external_id: str) -> IntegrationResponse:
        """Get case status from the external system."""

    @abstractmethod
    async def receive_case(self, external_data: dict[str, Any]) -> dict[str, Any]:
        """Receive a case from the external system."""

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the integration is healthy."""

    async def retry_request(
        self,
        request: IntegrationRequest,
        max_retries: int = 3,
    ) -> IntegrationResponse:
        """Retry a failed request."""
        for attempt in range(max_retries):
            try:
                response = await self.submit_case(request.metadata)
                if response.status == IntegrationStatus.COMPLETED:
                    return response
            except Exception as e:
                if attempt == max_retries - 1:
                    return IntegrationResponse(
                        request_id=request.request_id,
                        status=IntegrationStatus.FAILED,
                        error_message=f"Max retries exceeded: {e!s}",
                    )

        return IntegrationResponse(
            request_id=request.request_id,
            status=IntegrationStatus.RETRYING,
        )
