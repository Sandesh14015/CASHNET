"""SAHYOG Integration Connector.

Provides integration with SAHYOG (System for Automated Handling of Your
Online Grievances) for case hand-off and status tracking.
"""

from __future__ import annotations

from datetime import datetime, UTC
from typing import Any

import httpx

from .base import (
    IntegrationAdapter,
    IntegrationResponse,
    IntegrationStatus,
    IntegrationType,
)


class SAHYOGConnector(IntegrationAdapter):
    """SAHYOG API connector for case submission and tracking."""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._integration_type = IntegrationType.SAHYOG

        # Configuration
        self.api_url = config.get("api_url", "https://api.sahyog.gov.in/v1")
        self.api_key = config.get("api_key")
        self.client_id = config.get("client_id")
        self.timeout = config.get("timeout", 30)
        self.retry_attempts = config.get("retry_attempts", 3)

        # HTTP client
        self._client: httpx.AsyncClient | None = None

        # Case mapping (CashNet case_id -> SAHYOG case_id)
        self._case_mapping: dict[str, str] = {}

    async def connect(self) -> bool:
        """Connect to SAHYOG API."""
        try:
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
            }

            if self.api_key:
                headers["X-API-Key"] = self.api_key

            if self.client_id:
                headers["X-Client-ID"] = self.client_id

            self._client = httpx.AsyncClient(
                base_url=self.api_url,
                timeout=self.timeout,
                headers=headers,
            )

            # Test connection with health endpoint
            response = await self._client.get("/health")
            if response.status_code == 200:
                print("Connected to SAHYOG API")
                return True

            return False

        except (httpx.ConnectError, httpx.TimeoutException, OSError) as e:
            print(f"Failed to connect to SAHYOG: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from SAHYOG API."""
        if self._client:
            await self._client.aclose()

    async def submit_case(self, case_data: dict[str, Any]) -> IntegrationResponse:
        """Submit a case to SAHYOG."""
        try:
            if not self._client:
                await self.connect()

            # Transform case data to SAHYOG format
            sahyog_payload = self._transform_case_to_sahyog(case_data)

            # Submit to SAHYOG
            response = await self._client.post(
                "/cases",
                json=sahyog_payload,
            )

            if response.status_code == 201:
                result = response.json()
                sahyog_case_id = result.get("case_id")

                # Store mapping
                cashnet_case_id = case_data.get("case_id")
                if cashnet_case_id and sahyog_case_id:
                    self._case_mapping[cashnet_case_id] = sahyog_case_id

                return IntegrationResponse(
                    request_id=case_data.get("request_id", ""),
                    status=IntegrationStatus.COMPLETED,
                    response_data={
                        "sahyog_case_id": sahyog_case_id,
                        "reference_number": result.get("reference_number"),
                        "submitted_at": result.get("submitted_at"),
                    },
                    processed_at=datetime.now(UTC),
                )
            else:
                error_data = response.json() if response.content else {}
                return IntegrationResponse(
                    request_id=case_data.get("request_id", ""),
                    status=IntegrationStatus.FAILED,
                    error_message=error_data.get(
                        "error", f"HTTP {response.status_code}"
                    ),
                )

        except (httpx.RequestError, ValueError, KeyError) as e:
            return IntegrationResponse(
                request_id=case_data.get("request_id", ""),
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    async def get_case_status(self, external_id: str) -> IntegrationResponse:
        """Get case status from SAHYOG."""
        try:
            if not self._client:
                await self.connect()

            response = await self._client.get(f"/cases/{external_id}/status")

            if response.status_code == 200:
                result = response.json()
                return IntegrationResponse(
                    request_id=external_id,
                    status=self._map_sahyog_status(result.get("status")),
                    response_data={
                        "sahyog_case_id": external_id,
                        "status": result.get("status"),
                        "last_updated": result.get("last_updated"),
                        "remarks": result.get("remarks"),
                    },
                    processed_at=datetime.now(UTC),
                )
            else:
                return IntegrationResponse(
                    request_id=external_id,
                    status=IntegrationStatus.FAILED,
                    error_message=f"Failed to get status: HTTP {response.status_code}",
                )

        except (httpx.RequestError, ValueError, KeyError) as e:
            return IntegrationResponse(
                request_id=external_id,
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    async def receive_case(self, external_data: dict[str, Any]) -> dict[str, Any]:
        """Receive a case from SAHYOG (inbound)."""
        # Transform SAHYOG format to CashNet format
        return self._transform_sahyog_to_cashnet(external_data)

    async def health_check(self) -> bool:
        """Check SAHYOG API health."""
        try:
            if not self._client:
                await self.connect()

            response = await self._client.get("/health")
            return response.status_code == 200

        except httpx.RequestError:
            return False

    async def update_case(
        self,
        cashnet_case_id: str,
        update_data: dict[str, Any],
    ) -> IntegrationResponse:
        """Update a case in SAHYOG."""
        try:
            sahyog_case_id = self._case_mapping.get(cashnet_case_id)
            if not sahyog_case_id:
                return IntegrationResponse(
                    request_id=cashnet_case_id,
                    status=IntegrationStatus.FAILED,
                    error_message="No SAHYOG case ID mapping found",
                )

            response = await self._client.patch(
                f"/cases/{sahyog_case_id}",
                json=update_data,
            )

            if response.status_code == 200:
                return IntegrationResponse(
                    request_id=cashnet_case_id,
                    status=IntegrationStatus.COMPLETED,
                    response_data=response.json(),
                    processed_at=datetime.now(UTC),
                )
            else:
                return IntegrationResponse(
                    request_id=cashnet_case_id,
                    status=IntegrationStatus.FAILED,
                    error_message=f"Update failed: HTTP {response.status_code}",
                )

        except (httpx.RequestError, ValueError, KeyError) as e:
            return IntegrationResponse(
                request_id=cashnet_case_id,
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    async def get_case_history(self, external_id: str) -> list[dict[str, Any]]:
        """Get case history from SAHYOG."""
        try:
            if not self._client:
                await self.connect()

            response = await self._client.get(f"/cases/{external_id}/history")

            if response.status_code == 200:
                return response.json().get("history", [])

            return []

        except (httpx.RequestError, ValueError):
            return []

    def _transform_case_to_sahyog(self, case_data: dict[str, Any]) -> dict[str, Any]:
        """Transform CashNet case data to SAHYOG format."""
        return {
            "title": case_data.get("title", ""),
            "description": case_data.get("description", ""),
            "fraud_type": self._map_fraud_type(case_data.get("fraud_type")),
            "reported_amount": case_data.get("reported_amount", 0),
            "currency": case_data.get("currency", "INR"),
            "victim_details": {
                "name": case_data.get("victim_name"),
                "email": case_data.get("victim_email"),
                "phone": case_data.get("victim_phone"),
                "address": case_data.get("victim_address"),
            },
            "suspect_details": case_data.get("suspect_details", {}),
            "evidence": case_data.get("evidence", []),
            "priority": self._map_priority(case_data.get("priority", "MEDIUM")),
            "jurisdiction": case_data.get("jurisdiction"),
            "source": "CASHNET",
            "metadata": {
                "cashnet_case_id": case_data.get("case_id"),
                "cashnet_reference": case_data.get("case_reference"),
            },
        }

    def _transform_sahyog_to_cashnet(
        self, sahyog_data: dict[str, Any]
    ) -> dict[str, Any]:
        """Transform SAHYOG case data to CashNet format."""
        return {
            "title": sahyog_data.get("title", ""),
            "description": sahyog_data.get("description", ""),
            "fraud_type": self._reverse_map_fraud_type(sahyog_data.get("fraud_type")),
            "reported_amount": sahyog_data.get("reported_amount", 0),
            "currency": sahyog_data.get("currency", "INR"),
            "victim_name": sahyog_data.get("victim_details", {}).get("name"),
            "victim_email": sahyog_data.get("victim_details", {}).get("email"),
            "victim_phone": sahyog_data.get("victim_details", {}).get("phone"),
            "victim_address": sahyog_data.get("victim_details", {}).get("address"),
            "suspect_details": sahyog_data.get("suspect_details", {}),
            "source": "SAHYOG",
            "external_id": sahyog_data.get("case_id"),
            "external_reference": sahyog_data.get("reference_number"),
        }

    def _map_fraud_type(self, fraud_type: str | None) -> str:
        """Map CashNet fraud type to SAHYOG format."""
        mapping = {
            "CRYPTO": "DIGITAL_FRAUD",
            "BANKING": "BANKING_FRAUD",
            "INVESTMENT": "INVESTMENT_FRAUD",
            "PHISHING": "CYBER_CRIME",
            "RANSOMWARE": "CYBER_CRIME",
        }
        return mapping.get(fraud_type or "", "OTHER")

    def _reverse_map_fraud_type(self, sahyog_type: str | None) -> str:
        """Map SAHYOG fraud type to CashNet format."""
        mapping = {
            "DIGITAL_FRAUD": "CRYPTO",
            "BANKING_FRAUD": "BANKING",
            "INVESTMENT_FRAUD": "INVESTMENT",
            "CYBER_CRIME": "PHISHING",
        }
        return mapping.get(sahyog_type or "", "OTHER")

    def _map_priority(self, priority: str | None) -> str:
        """Map CashNet priority to SAHYOG format."""
        mapping = {
            "CRITICAL": "URGENT",
            "HIGH": "HIGH",
            "MEDIUM": "MEDIUM",
            "LOW": "LOW",
        }
        return mapping.get(priority or "", "MEDIUM")

    def _map_sahyog_status(self, sahyog_status: str | None) -> IntegrationStatus:
        """Map SAHYOG status to IntegrationStatus."""
        mapping = {
            "SUBMITTED": IntegrationStatus.PENDING,
            "ACKNOWLEDGED": IntegrationStatus.PROCESSING,
            "UNDER_REVIEW": IntegrationStatus.PROCESSING,
            "INVESTIGATING": IntegrationStatus.PROCESSING,
            "RESOLVED": IntegrationStatus.COMPLETED,
            "CLOSED": IntegrationStatus.COMPLETED,
            "REJECTED": IntegrationStatus.FAILED,
        }
        return mapping.get(sahyog_status or "", IntegrationStatus.PENDING)
