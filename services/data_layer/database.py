"""Database connection and query management for CASHNET.

Provides async database access with connection pooling and query builders.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any
from collections.abc import AsyncGenerator

import asyncpg
from asyncpg import Pool

# Global connection pool
_pool: Pool | None = None


async def get_pool() -> Pool:
    """Get or create the database connection pool."""
    global _pool
    if _pool is None:
        _pool = await create_pool()
    return _pool


async def create_pool() -> Pool:
    """Create a new database connection pool."""
    database_url = os.getenv(
        "DATABASE_URL", "postgresql://postgres:password@localhost:5432/cashnet"
    )
    pool = await asyncpg.create_pool(
        database_url,
        min_size=int(os.getenv("DB_POOL_MIN", "5")),
        max_size=int(os.getenv("DB_POOL_MAX", "20")),
        command_timeout=60,
    )
    return pool


async def close_pool() -> None:
    """Close the database connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a connection from the pool."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


class BaseRepository:
    """Base repository class with common database operations."""

    def __init__(self, table_name: str):
        self.table_name = table_name

    async def find_by_id(self, id_: str | int) -> dict[str, Any] | None:
        """Find a record by ID."""
        async with get_connection() as conn:
            query = f"SELECT * FROM {self.table_name} WHERE id = $1"
            row = await conn.fetchrow(query, id_)
            return dict(row) if row else None

    async def find_all(self, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        """Find all records with pagination."""
        async with get_connection() as conn:
            query = f"SELECT * FROM {self.table_name} ORDER BY created_at DESC LIMIT $1 OFFSET $2"
            rows = await conn.fetch(query, limit, offset)
            return [dict(row) for row in rows]

    async def count(self) -> int:
        """Count total records."""
        async with get_connection() as conn:
            query = f"SELECT COUNT(*) FROM {self.table_name}"
            result = await conn.fetchval(query)
            return result

    async def insert(self, data: dict[str, Any]) -> dict[str, Any]:
        """Insert a new record."""
        columns = list(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(columns)))
        query = f"""
            INSERT INTO {self.table_name} ({', '.join(columns)})
            VALUES ({placeholders})
            RETURNING *
        """
        async with get_connection() as conn:
            row = await conn.fetchrow(query, *data.values())
            return dict(row) if row else {}

    async def update(
        self, id_: str | int, data: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Update a record by ID."""
        if not data:
            return None

        data["updated_at"] = "NOW()"
        columns = list(data.keys())
        set_clause = ", ".join(f"{col} = ${i+1}" for i, col in enumerate(columns))
        query = f"""
            UPDATE {self.table_name}
            SET {set_clause}
            WHERE id = ${len(columns) + 1}
            RETURNING *
        """
        async with get_connection() as conn:
            row = await conn.fetchrow(query, *data.values(), id_)
            return dict(row) if row else None

    async def delete(self, id_: str | int) -> bool:
        """Delete a record by ID."""
        async with get_connection() as conn:
            query = f"DELETE FROM {self.table_name} WHERE id = $1"
            result = await conn.execute(query, id_)
            return result == "DELETE 1"

    async def execute(self, query: str, *args: Any) -> list[dict[str, Any]]:
        """Execute a custom query."""
        async with get_connection() as conn:
            rows = await conn.fetch(query, *args)
            return [dict(row) for row in rows]

    async def execute_scalar(self, query: str, *args: Any) -> Any:
        """Execute a query and return a single scalar value."""
        async with get_connection() as conn:
            return await conn.fetchval(query, *args)
