"""NCRP Integration Connector.

Provides integration with National Cyber Crime Reporting Portal (NCRP)
for case intake and status tracking.
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


class NCRPConnector(IntegrationAdapter):
    """NCRP API connector for case intake and tracking."""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._integration_type = IntegrationType.NCRP

        # Configuration
        self.api_url = config.get("api_url", "https://api.ncrp.gov.in/v1")
        self.api_key = config.get("api_key")
        self.org_id = config.get("org_id")
        self.timeout = config.get("timeout", 30)

        # HTTP client
        self._client: httpx.AsyncClient | None = None

        # Case mapping
        self._case_mapping: dict[str, str] = {}

    async def connect(self) -> bool:
        """Connect to NCRP API."""
        try:
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
            }

            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            if self.org_id:
                headers["X-Organization-ID"] = self.org_id

            self._client = httpx.AsyncClient(
                base_url=self.api_url,
                timeout=self.timeout,
                headers=headers,
            )

            # Test connection
            response = await self._client.get("/status")
            if response.status_code == 200:
                print("Connected to NCRP API")
                return True

            return False

        except Exception as e:
            print(f"Failed to connect to NCRP: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from NCRP API."""
        if self._client:
            await self._client.aclose()

    async def submit_case(self, case_data: dict[str, Any]) -> IntegrationResponse:
        """Submit a case to NCRP (for outbound reporting)."""
        try:
            if not self._client:
                await self.connect()

            # Transform to NCRP format
            ncrp_payload = self._transform_case_to_ncrp(case_data)

            response = await self._client.post(
                "/complaints",
                json=ncrp_payload,
            )

            if response.status_code == 201:
                result = response.json()
                ncrp_complaint_id = result.get("complaint_id")

                cashnet_case_id = case_data.get("case_id")
                if cashnet_case_id and ncrp_complaint_id:
                    self._case_mapping[cashnet_case_id] = ncrp_complaint_id

                return IntegrationResponse(
                    request_id=case_data.get("request_id", ""),
                    status=IntegrationStatus.COMPLETED,
                    response_data={
                        "ncrp_complaint_id": ncrp_complaint_id,
                        "fir_number": result.get("fir_number"),
                        "station_code": result.get("station_code"),
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

        except Exception as e:
            return IntegrationResponse(
                request_id=case_data.get("request_id", ""),
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    async def get_case_status(self, external_id: str) -> IntegrationResponse:
        """Get case status from NCRP."""
        try:
            if not self._client:
                await self.connect()

            response = await self._client.get(f"/complaints/{external_id}")

            if response.status_code == 200:
                result = response.json()
                return IntegrationResponse(
                    request_id=external_id,
                    status=self._map_ncrp_status(result.get("status")),
                    response_data={
                        "ncrp_complaint_id": external_id,
                        "status": result.get("status"),
                        "fir_number": result.get("fir_number"),
                        "investigating_officer": result.get("io_name"),
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

        except Exception as e:
            return IntegrationResponse(
                request_id=external_id,
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    async def receive_case(self, external_data: dict[str, Any]) -> dict[str, Any]:
        """Receive a case from NCRP (inbound complaint)."""
        return self._transform_ncrp_to_cashnet(external_data)

    async def health_check(self) -> bool:
        """Check NCRP API health."""
        try:
            if not self._client:
                await self.connect()

            response = await self._client.get("/status")
            return response.status_code == 200

        except Exception:
            return False

    async def update_investigation(
        self,
        ncrp_complaint_id: str,
        investigation_data: dict[str, Any],
    ) -> IntegrationResponse:
        """Update investigation details in NCRP."""
        try:
            if not self._client:
                await self.connect()

            response = await self._client.patch(
                f"/complaints/{ncrp_complaint_id}/investigation",
                json=investigation_data,
            )

            if response.status_code == 200:
                return IntegrationResponse(
                    request_id=ncrp_complaint_id,
                    status=IntegrationStatus.COMPLETED,
                    response_data=response.json(),
                    processed_at=datetime.now(UTC),
                )
            else:
                return IntegrationResponse(
                    request_id=ncrp_complaint_id,
                    status=IntegrationStatus.FAILED,
                    error_message=f"Update failed: HTTP {response.status_code}",
                )

        except Exception as e:
            return IntegrationResponse(
                request_id=ncrp_complaint_id,
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    async def add_evidence(
        self,
        ncrp_complaint_id: str,
        evidence_data: dict[str, Any],
    ) -> IntegrationResponse:
        """Add evidence to NCRP complaint."""
        try:
            if not self._client:
                await self.connect()

            response = await self._client.post(
                f"/complaints/{ncrp_complaint_id}/evidence",
                json=evidence_data,
            )

            if response.status_code == 201:
                return IntegrationResponse(
                    request_id=ncrp_complaint_id,
                    status=IntegrationStatus.COMPLETED,
                    response_data=response.json(),
                    processed_at=datetime.now(UTC),
                )
            else:
                return IntegrationResponse(
                    request_id=ncrp_complaint_id,
                    status=IntegrationStatus.FAILED,
                    error_message=f"Failed to add evidence: HTTP {response.status_code}",
                )

        except Exception as e:
            return IntegrationResponse(
                request_id=ncrp_complaint_id,
                status=IntegrationStatus.FAILED,
                error_message=str(e),
            )

    def _transform_case_to_ncrp(self, case_data: dict[str, Any]) -> dict[str, Any]:
        """Transform CashNet case to NCRP format."""
        return {
            "complaint_type": self._map_complaint_type(case_data.get("fraud_type")),
            "title": case_data.get("title", ""),
            "description": case_data.get("description", ""),
            "incident_date": case_data.get("incident_date"),
            "incident_location": case_data.get("incident_location", {}),
            "financial_loss": {
                "amount": case_data.get("reported_amount", 0),
                "currency": case_data.get("currency", "INR"),
            },
            "complainant": {
                "name": case_data.get("victim_name"),
                "email": case_data.get("victim_email"),
                "phone": case_data.get("victim_phone"),
                "address": case_data.get("victim_address"),
            },
            "suspect": case_data.get("suspect_details", {}),
            "evidence": case_data.get("evidence", []),
            "metadata": {
                "cashnet_case_id": case_data.get("case_id"),
                "cashnet_reference": case_data.get("case_reference"),
                "source": "CASHNET",
            },
        }

    def _transform_ncrp_to_cashnet(self, ncrp_data: dict[str, Any]) -> dict[str, Any]:
        """Transform NCRP complaint to CashNet format."""
        return {
            "title": ncrp_data.get("title", ""),
            "description": ncrp_data.get("description", ""),
            "fraud_type": self._reverse_map_complaint_type(
                ncrp_data.get("complaint_type")
            ),
            "reported_amount": ncrp_data.get("financial_loss", {}).get("amount", 0),
            "currency": ncrp_data.get("financial_loss", {}).get("currency", "INR"),
            "victim_name": ncrp_data.get("complainant", {}).get("name"),
            "victim_email": ncrp_data.get("complainant", {}).get("email"),
            "victim_phone": ncrp_data.get("complainant", {}).get("phone"),
            "victim_address": ncrp_data.get("complainant", {}).get("address"),
            "suspect_details": ncrp_data.get("suspect", {}),
            "incident_date": ncrp_data.get("incident_date"),
            "incident_location": ncrp_data.get("incident_location", {}),
            "source": "NCRP",
            "external_id": ncrp_data.get("complaint_id"),
            "fir_number": ncrp_data.get("fir_number"),
            "station_code": ncrp_data.get("station_code"),
        }

    def _map_complaint_type(self, fraud_type: str | None) -> str:
        """Map CashNet fraud type to NCRP complaint type."""
        mapping = {
            "CRYPTO": "ONLINE_FRAUD",
            "BANKING": "BANKING_FRAUD",
            "INVESTMENT": "INVESTMENT_FRAUD",
            "PHISHING": "CYBER_CRIME",
            "RANSOMWARE": "RANSOMWARE",
        }
        return mapping.get(fraud_type or "", "OTHER")

    def _reverse_map_complaint_type(self, ncrp_type: str | None) -> str:
        """Map NCRP complaint type to CashNet fraud type."""
        mapping = {
            "ONLINE_FRAUD": "CRYPTO",
            "BANKING_FRAUD": "BANKING",
            "INVESTMENT_FRAUD": "INVESTMENT",
            "CYBER_CRIME": "PHISHING",
            "RANSOMWARE": "RANSOMWARE",
        }
        return mapping.get(ncrp_type or "", "OTHER")

    def _map_ncrp_status(self, ncrp_status: str | None) -> IntegrationStatus:
        """Map NCRP status to IntegrationStatus."""
        mapping = {
            "REGISTERED": IntegrationStatus.PENDING,
            "UNDER_INVESTIGATION": IntegrationStatus.PROCESSING,
            "IO_ASSIGNED": IntegrationStatus.PROCESSING,
            "EVIDENCE_COLLECTED": IntegrationStatus.PROCESSING,
            "CHARGE_SHEET": IntegrationStatus.COMPLETED,
            "CLOSED": IntegrationStatus.COMPLETED,
            "DISMISSED": IntegrationStatus.FAILED,
        }
        return mapping.get(ncrp_status or "", IntegrationStatus.PENDING)
