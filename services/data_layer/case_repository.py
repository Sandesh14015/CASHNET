"""Case repository for CASHNET database operations.

Handles all case-related database queries with real-time data support.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from .database import BaseRepository


class CaseRepository(BaseRepository):
    """Repository for case management."""

    def __init__(self):
        super().__init__("cases")

    async def create_case(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new case with validation."""
        case_data = {
            "id": str(uuid.uuid4()),
            "case_reference": data.get(
                "case_reference", f"CASE-{datetime.now(UTC).timestamp()}"
            ),
            "title": data["title"],
            "fraud_type": data["fraud_type"],
            "amount": data["amount"],
            "priority": data.get("priority", "MEDIUM"),
            "status": data.get("status", "NEW"),
            "source_type": data.get("source_type", "USER_PROVIDED"),
            "state": data.get("state", "Unspecified"),
            "city": data.get("city", "Unspecified"),
            "external_id": data.get("external_id"),
            "metadata": data.get("metadata", {}),
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        return await self.insert(case_data)

    async def get_cases_by_status(
        self, status: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Get cases filtered by status."""
        query = """
            SELECT * FROM cases
            WHERE status = $1
            ORDER BY created_at DESC
            LIMIT $2
        """
        return await self.execute(query, status, limit)

    async def get_cases_by_source(
        self, source: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Get cases filtered by source (NCRP, SAHYOG, USER_PROVIDED, SYNTHETIC)."""
        query = """
            SELECT * FROM cases
            WHERE source_type = $1
            ORDER BY created_at DESC
            LIMIT $2
        """
        return await self.execute(query, source, limit)

    async def get_cases_by_priority(
        self, priority: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Get high-priority cases."""
        query = """
            SELECT * FROM cases
            WHERE priority = $1
            ORDER BY created_at DESC
            LIMIT $2
        """
        return await self.execute(query, priority, limit)

    async def get_critical_cases(self, limit: int = 20) -> list[dict[str, Any]]:
        """Get all critical or high-priority cases."""
        query = """
            SELECT * FROM cases
            WHERE priority IN ('CRITICAL', 'HIGH')
            ORDER BY priority DESC, created_at DESC
            LIMIT $1
        """
        return await self.execute(query, limit)

    async def get_recent_cases(
        self, hours: int = 24, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Get cases created in the last N hours."""
        query = """
            SELECT * FROM cases
            WHERE created_at > NOW() - INTERVAL '1 hour' * $1
            ORDER BY created_at DESC
            LIMIT $2
        """
        return await self.execute(query, hours, limit)

    async def get_cases_by_location(
        self, state: str, city: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Get cases filtered by geographic location."""
        if city:
            query = """
                SELECT * FROM cases
                WHERE state = $1 AND city = $2
                ORDER BY created_at DESC
                LIMIT $3
            """
            return await self.execute(query, state, city, limit)
        else:
            query = """
                SELECT * FROM cases
                WHERE state = $1
                ORDER BY created_at DESC
                LIMIT $2
            """
            return await self.execute(query, state, limit)

    async def get_cases_by_amount_range(
        self, min_amount: float, max_amount: float, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Get cases within an amount range."""
        query = """
            SELECT * FROM cases
            WHERE amount BETWEEN $1 AND $2
            ORDER BY amount DESC
            LIMIT $3
        """
        return await self.execute(query, min_amount, max_amount, limit)

    async def link_external_case(
        self, internal_id: str, external_id: str, source: str
    ) -> dict[str, Any] | None:
        """Link an internal case to an external case (NCRP, SAHYOG)."""
        query = """
            UPDATE cases
            SET external_id = $1, source_type = $2, updated_at = NOW()
            WHERE id = $3
            RETURNING *
        """
        return await self.execute_scalar(query, external_id, source, internal_id)

    async def update_case_status(
        self, case_id: str, status: str, notes: str = ""
    ) -> dict[str, Any] | None:
        """Update case status and add audit note."""
        query = """
            UPDATE cases
            SET status = $1, updated_at = NOW(), metadata = jsonb_set(metadata, '{status_change_notes}', to_jsonb($2::text))
            WHERE id = $3
            RETURNING *
        """
        return await self.execute_scalar(query, status, notes, case_id)

    async def search_cases(self, query: str, limit: int = 50) -> list[dict[str, Any]]:
        """Full-text search on case titles and descriptions."""
        search_query = """
            SELECT * FROM cases
            WHERE title ILIKE $1 OR case_reference ILIKE $1
            ORDER BY created_at DESC
            LIMIT $2
        """
        return await self.execute(search_query, f"%{query}%", limit)

    async def get_case_statistics(self) -> dict[str, Any]:
        """Get aggregated case statistics."""
        query = """
            SELECT
                COUNT(*) as total_cases,
                COUNT(CASE WHEN priority = 'CRITICAL' THEN 1 END) as critical_cases,
                COUNT(CASE WHEN priority = 'HIGH' THEN 1 END) as high_priority_cases,
                COUNT(CASE WHEN status = 'NEW' THEN 1 END) as new_cases,
                COUNT(CASE WHEN status = 'INVESTIGATION' THEN 1 END) as investigating_cases,
                SUM(amount)::numeric as total_amount_involved,
                AVG(amount)::numeric as avg_amount,
                COUNT(DISTINCT source_type) as sources_count
            FROM cases
        """
        stats = await self.execute_scalar(query)
        return dict(stats) if stats else {}

    async def get_fraud_type_statistics(self) -> list[dict[str, Any]]:
        """Get statistics grouped by fraud type."""
        query = """
            SELECT
                fraud_type,
                COUNT(*) as count,
                SUM(amount)::numeric as total_amount,
                AVG(amount)::numeric as avg_amount,
                COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) as resolved_count
            FROM cases
            GROUP BY fraud_type
            ORDER BY count DESC
        """
        return await self.execute(query)

    async def get_cases_by_date_range(
        self, start_date: str, end_date: str, limit: int = 100
    ) -> list[dict[str, Any]]:
        """Get cases created within a date range."""
        query = """
            SELECT * FROM cases
            WHERE created_at BETWEEN $1::timestamp AND $2::timestamp
            ORDER BY created_at DESC
            LIMIT $3
        """
        return await self.execute(query, start_date, end_date, limit)
