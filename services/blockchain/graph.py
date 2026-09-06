"""Graph database service for transaction traversal.

Provides Neo4j integration for storing and querying transaction graphs.
"""

from __future__ import annotations

from typing import Any

from neo4j import AsyncDriver, AsyncGraphDatabase

from .base import AddressType, ChainType, NormalizedTransaction, TransactionType


class GraphService:
    """Graph database service using Neo4j."""

    def __init__(self, uri: str, user: str, password: str):
        self.uri = uri
        self.user = user
        self.password = password
        self.driver: AsyncDriver | None = None

    async def connect(self) -> bool:
        """Connect to Neo4j database."""
        try:
            self.driver = AsyncGraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password),
            )
            # Verify connectivity
            await self.driver.verify_connectivity()
            print(f"Connected to Neo4j at {self.uri}")
            return True
        except Exception as e:
            print(f"Failed to connect to Neo4j: {e}")
            return False

    async def disconnect(self) -> None:
        """Close the driver."""
        if self.driver:
            await self.driver.close()

    async def create_indexes(self) -> None:
        """Create necessary indexes for performance."""
        async with self.driver.session() as session:
            # Address index
            await session.run(
                "CREATE INDEX IF NOT EXISTS FOR (a:Address) ON (a.address)"
            )

            # Transaction index
            await session.run(
                "CREATE INDEX IF NOT EXISTS FOR (t:Transaction) ON (t.tx_hash)"
            )

            # Block index
            await session.run("CREATE INDEX IF NOT EXISTS FOR (b:Block) ON (b.number)")

            # Chain index
            await session.run("CREATE INDEX IF NOT EXISTS FOR (a:Address) ON (a.chain)")

            # Composite index for address + chain
            await session.run(
                "CREATE INDEX IF NOT EXISTS FOR (a:Address) ON (a.address, a.chain)"
            )

    async def store_transaction(self, transaction: NormalizedTransaction) -> bool:
        """Store a normalized transaction in the graph."""
        try:
            async with self.driver.session() as session:
                # Create or update addresses
                await session.run(
                    """
                    MERGE (from:Address {address: $from_address, chain: $chain})
                    SET from.type = $from_type,
                        from.last_seen = datetime()

                    MERGE (to:Address {address: $to_address, chain: $chain})
                    SET to.type = $to_type,
                        to.last_seen = datetime()
                    """,
                    from_address=transaction.from_address,
                    to_address=transaction.to_address,
                    chain=(
                        transaction.chain.value
                        if isinstance(transaction.chain, ChainType)
                        else transaction.chain
                    ),
                    from_type=(
                        transaction.from_address_type.value
                        if isinstance(transaction.from_address_type, AddressType)
                        else transaction.from_address_type
                    ),
                    to_type=(
                        transaction.to_address_type.value
                        if isinstance(transaction.to_address_type, AddressType)
                        else transaction.to_address_type
                    ),
                )

                # Create transaction and relationships
                await session.run(
                    """
                    MATCH (from:Address {address: $from_address, chain: $chain})
                    MATCH (to:Address {address: $to_address, chain: $chain})

                    MERGE (tx:Transaction {tx_hash: $tx_hash, chain: $chain})
                    SET tx.block_number = $block_number,
                        tx.block_timestamp = datetime($block_timestamp),
                        tx.value = $value,
                        tx.currency = $currency,
                        tx.transaction_type = $tx_type,
                        tx.is_success = $is_success,
                        tx.is_suspicious = $is_suspicious,
                        tx.risk_score = $risk_score,
                        tx.created_at = datetime()

                    MERGE (from)-[:SENT]->(tx)
                    MERGE (tx)-[:RECEIVED_BY]->(to)
                    """,
                    from_address=transaction.from_address,
                    to_address=transaction.to_address,
                    chain=(
                        transaction.chain.value
                        if isinstance(transaction.chain, ChainType)
                        else transaction.chain
                    ),
                    tx_hash=transaction.tx_hash,
                    block_number=transaction.block_number,
                    block_timestamp=transaction.block_timestamp.isoformat(),
                    value=transaction.value,
                    currency=transaction.currency,
                    tx_type=(
                        transaction.transaction_type.value
                        if isinstance(transaction.transaction_type, TransactionType)
                        else transaction.transaction_type
                    ),
                    is_success=transaction.is_success,
                    is_suspicious=transaction.is_suspicious,
                    risk_score=transaction.risk_score or 0.0,
                )

                return True

        except Exception as e:
            print(f"Error storing transaction: {e}")
            return False

    async def store_transactions_batch(
        self,
        transactions: list[NormalizedTransaction],
    ) -> int:
        """Store multiple transactions. Returns count of successfully stored."""
        count = 0
        for tx in transactions:
            if await self.store_transaction(tx):
                count += 1
        return count

    async def get_address_transactions(
        self,
        address: str,
        chain: ChainType,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Get all transactions for an address."""
        try:
            async with self.driver.session() as session:
                result = await session.run(
                    """
                    MATCH (a:Address {address: $address, chain: $chain})
                    OPTIONAL MATCH (a)-[:SENT]->(tx:Transaction)
                    OPTIONAL MATCH (tx)-[:RECEIVED_BY]->(to:Address)
                    RETURN tx, to.address as to_address
                    UNION
                    MATCH (a:Address {address: $address, chain: $chain})
                    OPTIONAL MATCH (tx:Transaction)-[:RECEIVED_BY]->(a)
                    OPTIONAL MATCH (from:Address)-[:SENT]->(tx)
                    RETURN tx, from.address as from_address
                    ORDER BY tx.block_timestamp DESC
                    LIMIT $limit
                    """,
                    address=address,
                    chain=chain.value,
                    limit=limit,
                )

                transactions = []
                async for record in result:
                    tx = record["tx"]
                    if tx:
                        transactions.append(
                            {
                                "tx_hash": tx["tx_hash"],
                                "block_number": tx["block_number"],
                                "value": tx["value"],
                                "currency": tx["currency"],
                                "transaction_type": tx["transaction_type"],
                                "is_suspicious": tx["is_suspicious"],
                                "risk_score": tx["risk_score"],
                            }
                        )

                return transactions

        except Exception as e:
            print(f"Error getting address transactions: {e}")
            return []

    async def find_paths(
        self,
        from_address: str,
        to_address: str,
        chain: ChainType,
        max_hops: int = 8,
        min_value: float = 0,
        max_time_days: int = 365,
    ) -> list[list[dict[str, Any]]]:
        """Find all paths between two addresses up to max_hops."""
        try:
            async with self.driver.session() as session:
                # Use variable-length path matching
                result = await session.run(
                    """
                    MATCH path = (from:Address {address: $from_address, chain: $chain})
                        -[:SENT|RECEIVED_BY*1.."""
                    + str(max_hops)
                    + """]->
                        (to:Address {address: $to_address, chain: $chain})

                    WHERE ALL(tx IN nodes(path) WHERE
                        tx:Transaction AND
                        tx.value >= $min_value AND
                        tx.block_timestamp >= datetime() - duration({days: $max_time_days})
                    )

                    RETURN path,
                           [n IN nodes(path) | n] as nodes,
                           [r IN relationships(path) | r] as relationships
                    LIMIT 100
                    """,
                    from_address=from_address,
                    to_address=to_address,
                    chain=chain.value,
                    min_value=min_value,
                    max_time_days=max_time_days,
                )

                paths = []
                async for record in result:
                    path_data = []
                    for node in record["nodes"]:
                        path_data.append(
                            {
                                "type": (
                                    "address" if "address" in node else "transaction"
                                ),
                                "data": dict(node),
                            }
                        )
                    paths.append(path_data)

                return paths

        except Exception as e:
            print(f"Error finding paths: {e}")
            return []

    async def get_transaction_graph(
        self,
        address: str,
        chain: ChainType,
        depth: int = 2,
        limit: int = 50,
    ) -> dict[str, Any]:
        """Get a graph visualization of transactions around an address."""
        try:
            async with self.driver.session() as session:
                # Get nodes and relationships within depth
                result = await session.run(
                    """
                    MATCH path = (center:Address {address: $address, chain: $chain})
                        -[:SENT|RECEIVED_BY*1.."""
                    + str(depth)
                    + """]->
                        (connected:Address)

                    WITH center, connected, path

                    OPTIONAL MATCH (center)-[r1:SENT|RECEIVED_BY]->(tx1:Transaction)
                    OPTIONAL MATCH (tx1)-[r2:SENT|RECEIVED_BY]->(connected)

                    RETURN DISTINCT
                        collect(DISTINCT {
                            id: center.address,
                            type: 'center',
                            chain: center.chain
                        }) as center_nodes,
                        collect(DISTINCT {
                            id: connected.address,
                            type: 'connected',
                            chain: connected.chain,
                            address_type: connected.type
                        }) as connected_nodes,
                        collect(DISTINCT {
                            source: CASE
                                WHEN startNode(r1).address = center.address THEN center.address
                                ELSE connected.address
                            END,
                            target: CASE
                                WHEN endNode(r1).address = connected.address THEN connected.address
                                ELSE center.address
                            END,
                            tx_hash: tx1.tx_hash,
                            value: tx1.value,
                            currency: tx1.currency
                        }) as relationships
                    LIMIT 1
                    """,
                    address=address,
                    chain=chain.value,
                )

                record = await result.single()
                if record:
                    return {
                        "nodes": record["center_nodes"] + record["connected_nodes"],
                        "relationships": record["relationships"],
                    }

                return {"nodes": [], "relationships": []}

        except Exception as e:
            print(f"Error getting transaction graph: {e}")
            return {"nodes": [], "relationships": []}

    async def get_address_risk_score(
        self,
        address: str,
        chain: ChainType,
    ) -> dict[str, Any]:
        """Calculate risk score for an address based on transaction history."""
        try:
            async with self.driver.session() as session:
                result = await session.run(
                    """
                    MATCH (a:Address {address: $address, chain: $chain})

                    // Get all transactions
                    OPTIONAL MATCH (a)-[:SENT]->(tx_out:Transaction)
                    OPTIONAL MATCH (tx_in:Transaction)-[:RECEIVED_BY]->(a)

                    // Count suspicious transactions
                    WITH a,
                         count(DISTINCT tx_out) as outgoing_count,
                         count(DISTINCT tx_in) as incoming_count,
                         sum(CASE WHEN tx_out.is_suspicious THEN 1 ELSE 0 END) as suspicious_out,
                         sum(CASE WHEN tx_in.is_suspicious THEN 1 ELSE 0 END) as suspicious_in,
                         sum(tx_out.value) as total_out_value,
                         sum(tx_in.value) as total_in_value,
                         avg(CASE WHEN tx_out.is_suspicious THEN tx_out.risk_score ELSE 0 END) as avg_risk_score

                    // Get connected addresses
                    OPTIONAL MATCH (a)-[:SENT|RECEIVED_BY*1..2]-(connected:Address)
                    WHERE connected.type = 'mixer' OR connected.type = 'exchange'

                    RETURN a.address as address,
                           outgoing_count,
                           incoming_count,
                           suspicious_out,
                           suspicious_in,
                           total_out_value,
                           total_in_value,
                           avg_risk_score,
                           count(DISTINCT connected) as risky_connections
                    """,
                    address=address,
                    chain=chain.value,
                )

                record = await result.single()
                if record:
                    # Calculate risk score
                    risk_score = 0.0

                    # Suspicious transaction ratio
                    total_tx = record["outgoing_count"] + record["incoming_count"]
                    if total_tx > 0:
                        suspicious_ratio = (
                            record["suspicious_out"] + record["suspicious_in"]
                        ) / total_tx
                        risk_score += suspicious_ratio * 0.4

                    # Average risk score of transactions
                    risk_score += (record["avg_risk_score"] or 0) * 0.3

                    # Risky connections
                    if record["risky_connections"] > 0:
                        risk_score += min(record["risky_connections"] * 0.1, 0.3)

                    return {
                        "address": record["address"],
                        "risk_score": min(risk_score, 1.0),
                        "outgoing_count": record["outgoing_count"],
                        "incoming_count": record["incoming_count"],
                        "suspicious_out": record["suspicious_out"],
                        "suspicious_in": record["suspicious_in"],
                        "total_out_value": record["total_out_value"],
                        "total_in_value": record["total_in_value"],
                        "risky_connections": record["risky_connections"],
                    }

                return {"address": address, "risk_score": 0.0}

        except Exception as e:
            print(f"Error calculating risk score: {e}")
            return {"address": address, "risk_score": 0.0}

    async def cleanup_old_data(self, days: int = 365) -> int:
        """Clean up data older than specified days."""
        try:
            async with self.driver.session() as session:
                result = await session.run(
                    """
                    MATCH (tx:Transaction)
                    WHERE tx.block_timestamp < datetime() - duration({days: $days})
                    DETACH DELETE tx
                    RETURN count(tx) as deleted
                    """,
                    days=days,
                )

                record = await result.single()
                return record["deleted"] if record else 0

        except Exception as e:
            print(f"Error cleaning up old data: {e}")
            return 0
