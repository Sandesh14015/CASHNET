"""VASP/Exchange Request Workflow Connector.

Provides workflow for freeze requests, disclosure requests, and
communication with Virtual Asset Service Providers (VASPs).
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

import httpx

from .base import (
    IntegrationAdapter,
    IntegrationResponse,
    IntegrationStatus,
    IntegrationType,
)


class VASPRequestType(StrEnum):
    """VASP request types."""

    FREEZE = "freeze"
    DISCLOSURE = "disclosure"
    BLOCK = "block"
    UNFREEZE = "unfreeze"
    INFORMATION = "information"


class VASPRequestStatus(StrEnum):
    """VASP request status."""

    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    SENT = "sent"
    ACKNOWLEDGED = "acknowledged"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class VASPConnector(IntegrationAdapter):
    """VASP/Exchange request workflow connector."""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._integration_type = IntegrationType.VASP

        # Configuration
        self.api_url = config.get("api_url")
        self.api_key = config.get("api_key")
        self.timeout = config.get("timeout", 30)
        self.default_expiry_days = config.get("default_expiry_days", 7)

        # HTTP client
        self._client: httpx.AsyncClient | None = None

        # VASP registry (name -> config)
        self._vasp_registry: dict[str, dict[str, Any]] = {}

        # Request tracking
        self._requests: dict[str, dict[str, Any]] = {}

    async def connect(self) -> bool:
        """Connect to VASP API (if available)."""
        if not self.api_url:
            # Offline mode - use local registry
            print("VASP connector in offline mode")
            return True

        try:
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
            }

            if self.api_key:
                headers["X-API-Key"] = self.api_key

            self._client = httpx.AsyncClient(
                base_url=self.api_url,
                timeout=self.timeout,
                headers=headers,
            )

            response = await self._client.get("/health")
            if response.status_code == 200:
                print("Connected to VASP API")
                return True

            return False

        except (httpx.ConnectError, httpx.TimeoutException, OSError) as e:
            print(f"Failed to connect to VASP API: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from VASP API."""
        if self._client:
            await self._client.aclose()

    async def submit_case(self, case_data: dict[str, Any]) -> IntegrationResponse:
        """Submit a freeze/disclosure request to a VASP."""
        try:
            vasp_name = case_data.get("vasp_name")

            if not vasp_name:
                return IntegrationResponse(
                    request_id=case_data.get("request_id", ""),
                    status=IntegrationStatus.FAILED,
                    error_message="VASP name is required",
                )

            # Create request
            request_data = self._create_vasp_request(case_data)

            # Store request
            request_id = request_data["request_id"]
            self._requests[request_id] = request_data

            # Send to VASP if online
            if self._client:
                response = await self._send_to_vasp(vasp_name, request_data)
                if response.status == IntegrationStatus.COMPLETED:
                    request_data["status"] = VASPRequestStatus.SENT.value
                return response
            else:
                # Offline mode - queue for later
                request_data["status"] = VASPRequestStatus.DRAFT.value
                return IntegrationResponse(
                    request_id=request_id,
                    status=IntegrationStatus.COMPLETED,
                    response_data={
                        "message": "Request queued for sending",
                        "request_id": request_id,
                    },
                    processed_at=datetime.now(UTC),
                )

        except (httpx.RequestError, ValueError, KeyError) as e:
            return IntegrationResponse(
                request_id=case_data.get("request_id", ""),
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    async def get_case_status(self, external_id: str) -> IntegrationResponse:
        """Get VASP request status."""
        try:
            request = self._requests.get(external_id)
            if not request:
                return IntegrationResponse(
                    request_id=external_id,
                    status=IntegrationStatus.FAILED,
                    error_message="Request not found",
                )

            # Check with VASP if online
            if self._client and request.get("vasp_api_endpoint"):
                response = await self._client.get(f"/requests/{external_id}/status")
                if response.status_code == 200:
                    vasp_status = response.json()
                    request["status"] = vasp_status.get("status")
                    request["response_data"] = vasp_status

            return IntegrationResponse(
                request_id=external_id,
                status=self._map_vasp_status(request.get("status")),
                response_data=request.get("response_data", {}),
                processed_at=datetime.now(UTC),
            )

        except (httpx.RequestError, ValueError, KeyError) as e:
            return IntegrationResponse(
                request_id=external_id,
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    async def receive_case(self, external_data: dict[str, Any]) -> dict[str, Any]:
        """Receive a response from VASP."""
        return self._process_vasp_response(external_data)

    async def health_check(self) -> bool:
        """Check VASP API health."""
        if not self._client:
            return True  # Offline mode is always "healthy"

        try:
            response = await self._client.get("/health")
            return response.status_code == 200
        except httpx.RequestError:
            return False

    async def create_freeze_request(
        self,
        case_id: str,
        vasp_name: str,
        wallet_address: str,
        chain: str,
        reason: str,
        evidence_package_id: str | None = None,
    ) -> IntegrationResponse:
        """Create a freeze request for a wallet."""
        request_data = {
            "case_id": case_id,
            "request_type": VASPRequestType.FREEZE.value,
            "vasp_name": vasp_name,
            "wallet_address": wallet_address,
            "chain": chain,
            "reason": reason,
            "evidence_package_id": evidence_package_id,
            "expires_at": self._calculate_expiry(),
        }

        return await self.submit_case(request_data)

    async def create_disclosure_request(
        self,
        case_id: str,
        vasp_name: str,
        wallet_address: str,
        chain: str,
        reason: str,
        information_requested: list[str],
    ) -> IntegrationResponse:
        """Create a disclosure request for account information."""
        request_data = {
            "case_id": case_id,
            "request_type": VASPRequestType.DISCLOSURE.value,
            "vasp_name": vasp_name,
            "wallet_address": wallet_address,
            "chain": chain,
            "reason": reason,
            "information_requested": information_requested,
            "expires_at": self._calculate_expiry(),
        }

        return await self.submit_case(request_data)

    async def get_request_history(
        self,
        case_id: str | None = None,
        vasp_name: str | None = None,
        status: VASPRequestStatus | None = None,
    ) -> list[dict[str, Any]]:
        """Get request history with filters."""
        results = []

        for request in self._requests.values():
            if case_id and request.get("case_id") != case_id:
                continue
            if vasp_name and request.get("vasp_name") != vasp_name:
                continue
            if status and request.get("status") != status.value:
                continue
            results.append(request)

        return results

    async def approve_request(
        self,
        request_id: str,
        approver_id: str,
        comments: str | None = None,
    ) -> IntegrationResponse:
        """Approve a VASP request."""
        try:
            request = self._requests.get(request_id)
            if not request:
                return IntegrationResponse(
                    request_id=request_id,
                    status=IntegrationStatus.FAILED,
                    error_message="Request not found",
                )

            if request.get("status") != VASPRequestStatus.PENDING_APPROVAL.value:
                return IntegrationResponse(
                    request_id=request_id,
                    status=IntegrationStatus.FAILED,
                    error_message=f"Invalid status: {request.get('status')}",
                )

            # Update request
            request["status"] = VASPRequestStatus.APPROVED.value
            request["approved_by"] = approver_id
            request["approved_at"] = datetime.now(UTC).isoformat()
            request["approval_comments"] = comments

            return IntegrationResponse(
                request_id=request_id,
                status=IntegrationStatus.COMPLETED,
                response_data={
                    "status": "approved",
                    "approved_by": approver_id,
                },
                processed_at=datetime.now(UTC),
            )

        except (httpx.RequestError, ValueError, KeyError) as e:
            return IntegrationResponse(
                request_id=request_id,
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    async def reject_request(
        self,
        request_id: str,
        rejector_id: str,
        reason: str,
    ) -> IntegrationResponse:
        """Reject a VASP request."""
        try:
            request = self._requests.get(request_id)
            if not request:
                return IntegrationResponse(
                    request_id=request_id,
                    status=IntegrationStatus.FAILED,
                    error_message="Request not found",
                )

            request["status"] = VASPRequestStatus.REJECTED.value
            request["rejected_by"] = rejector_id
            request["rejected_at"] = datetime.now(UTC).isoformat()
            request["rejection_reason"] = reason

            return IntegrationResponse(
                request_id=request_id,
                status=IntegrationStatus.COMPLETED,
                response_data={
                    "status": "rejected",
                    "rejected_by": rejector_id,
                    "reason": reason,
                },
                processed_at=datetime.now(UTC),
            )

        except (httpx.RequestError, ValueError, KeyError) as e:
            return IntegrationResponse(
                request_id=request_id,
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    def _create_vasp_request(self, case_data: dict[str, Any]) -> dict[str, Any]:
        """Create a VASP request object."""
        import uuid

        return {
            "request_id": str(uuid.uuid4()),
            "case_id": case_data.get("case_id"),
            "request_type": case_data.get("request_type"),
            "vasp_name": case_data.get("vasp_name"),
            "wallet_address": case_data.get("wallet_address"),
            "chain": case_data.get("chain"),
            "reason": case_data.get("reason"),
            "evidence_package_id": case_data.get("evidence_package_id"),
            "status": VASPRequestStatus.PENDING_APPROVAL.value,
            "created_at": datetime.now(UTC).isoformat(),
            "expires_at": case_data.get("expires_at", self._calculate_expiry()),
            "response_data": {},
        }

    async def _send_to_vasp(
        self,
        vasp_name: str,
        request_data: dict[str, Any],
    ) -> IntegrationResponse:
        """Send request to VASP API."""
        try:
            vasp_config = self._vasp_registry.get(vasp_name)
            if not vasp_config:
                return IntegrationResponse(
                    request_id=request_data["request_id"],
                    status=IntegrationStatus.FAILED,
                    error_message=f"VASP not registered: {vasp_name}",
                )

            # Transform request to VASP format
            vasp_payload = self._transform_to_vasp_format(request_data, vasp_config)

            # Send request
            response = await self._client.post(
                "/requests",
                json=vasp_payload,
            )

            if response.status_code in [200, 201]:
                return IntegrationResponse(
                    request_id=request_data["request_id"],
                    status=IntegrationStatus.COMPLETED,
                    response_data=response.json(),
                    processed_at=datetime.now(UTC),
                )
            else:
                return IntegrationResponse(
                    request_id=request_data["request_id"],
                    status=IntegrationStatus.FAILED,
                    error_message=f"VASP request failed: HTTP {response.status_code}",
                )

        except (httpx.RequestError, ValueError, KeyError) as e:
            return IntegrationResponse(
                request_id=request_data["request_id"],
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    def _transform_to_vasp_format(
        self,
        request_data: dict[str, Any],
        vasp_config: dict[str, Any],
    ) -> dict[str, Any]:
        """Transform request to VASP-specific format."""
        # This would be customized per VASP
        return {
            "type": request_data.get("request_type"),
            "wallet": request_data.get("wallet_address"),
            "chain": request_data.get("chain"),
            "reason": request_data.get("reason"),
            "reference": request_data.get("request_id"),
            "case_reference": request_data.get("case_id"),
        }

    def _process_vasp_response(self, response_data: dict[str, Any]) -> dict[str, Any]:
        """Process response from VASP."""
        return {
            "request_id": response_data.get("reference"),
            "status": response_data.get("status"),
            "response_data": response_data.get("data", {}),
            "processed_at": datetime.now(UTC).isoformat(),
        }

    def _calculate_expiry(self) -> str:
        """Calculate request expiry date."""
        from datetime import timedelta

        expiry = datetime.now(UTC) + timedelta(days=self.default_expiry_days)
        return expiry.isoformat()

    def _map_vasp_status(self, status: str | None) -> IntegrationStatus:
        """Map VASP status to IntegrationStatus."""
        mapping = {
            VASPRequestStatus.DRAFT.value: IntegrationStatus.PENDING,
            VASPRequestStatus.PENDING_APPROVAL.value: IntegrationStatus.PENDING,
            VASPRequestStatus.APPROVED.value: IntegrationStatus.PROCESSING,
            VASPRequestStatus.SENT.value: IntegrationStatus.PROCESSING,
            VASPRequestStatus.ACKNOWLEDGED.value: IntegrationStatus.PROCESSING,
            VASPRequestStatus.COMPLETED.value: IntegrationStatus.COMPLETED,
            VASPRequestStatus.FAILED.value: IntegrationStatus.FAILED,
            VASPRequestStatus.EXPIRED.value: IntegrationStatus.FAILED,
        }
        return mapping.get(status or "", IntegrationStatus.PENDING)
