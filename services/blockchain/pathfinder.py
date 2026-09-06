"""Multi-hop path discovery algorithm.

Implements bounded BFS/DFS for finding transaction paths between addresses.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from .base import ChainType, NormalizedTransaction


class PathFindingStrategy(StrEnum):
    """Path finding strategies."""

    BFS = "bfs"  # Breadth-First Search (shortest paths)
    DFS = "dfs"  # Depth-First Search (all paths)
    DIJKSTRA = "dijkstra"  # Weighted shortest path


@dataclass
class PathConstraints:
    """Constraints for path finding."""

    max_hops: int = 8
    min_value: float = 0
    max_value: float = float("inf")
    start_time: datetime | None = None
    end_time: datetime | None = None
    chains: list[ChainType] | None = None
    exclude_addresses: set[str] | None = None
    include_suspicious_only: bool = False


@dataclass
class TransactionEdge:
    """Represents a transaction in the path."""

    tx_hash: str
    from_address: str
    to_address: str
    value: float
    currency: str
    timestamp: datetime
    chain: ChainType
    is_suspicious: bool = False
    risk_score: float = 0.0


@dataclass
class Path:
    """Represents a complete path between two addresses."""

    source: str
    destination: str
    edges: list[TransactionEdge]
    total_value: float
    hop_count: int
    total_risk_score: float
    chains_used: list[ChainType]

    @property
    def average_risk_score(self) -> float:
        """Calculate average risk score."""
        if not self.edges:
            return 0.0
        return sum(e.risk_score for e in self.edges) / len(self.edges)

    @property
    def duration_hours(self) -> float:
        """Calculate path duration in hours."""
        if len(self.edges) < 2:
            return 0.0
        first_ts = min(e.timestamp for e in self.edges)
        last_ts = max(e.timestamp for e in self.edges)
        return (last_ts - first_ts).total_seconds() / 3600


class TransactionGraph:
    """In-memory transaction graph for path finding."""

    def __init__(self):
        # Adjacency list: address -> list of (neighbor, edge)
        self._outgoing: dict[str, list[tuple[str, TransactionEdge]]] = defaultdict(list)
        self._incoming: dict[str, list[tuple[str, TransactionEdge]]] = defaultdict(list)
        self._addresses: set[str] = set()

    def add_transaction(self, tx: NormalizedTransaction) -> None:
        """Add a transaction to the graph."""
        edge = TransactionEdge(
            tx_hash=tx.tx_hash,
            from_address=tx.from_address,
            to_address=tx.to_address,
            value=tx.value,
            currency=tx.currency,
            timestamp=tx.block_timestamp,
            chain=tx.chain if isinstance(tx.chain, ChainType) else ChainType(tx.chain),
            is_suspicious=tx.is_suspicious,
            risk_score=tx.risk_score or 0.0,
        )

        self._outgoing[tx.from_address].append((tx.to_address, edge))
        self._incoming[tx.to_address].append((tx.from_address, edge))
        self._addresses.add(tx.from_address)
        self._addresses.add(tx.to_address)

    def add_transactions_batch(self, transactions: list[NormalizedTransaction]) -> int:
        """Add multiple transactions. Returns count added."""
        count = 0
        for tx in transactions:
            try:
                self.add_transaction(tx)
                count += 1
            except Exception:
                continue
        return count

    def get_neighbors(self, address: str) -> list[tuple[str, TransactionEdge]]:
        """Get all neighbors (both incoming and outgoing)."""
        neighbors = []
        neighbors.extend(self._outgoing.get(address, []))
        neighbors.extend(self._incoming.get(address, []))
        return neighbors

    def get_outgoing(self, address: str) -> list[tuple[str, TransactionEdge]]:
        """Get outgoing transactions from an address."""
        return self._outgoing.get(address, [])

    def get_incoming(self, address: str) -> list[tuple[str, TransactionEdge]]:
        """Get incoming transactions to an address."""
        return self._incoming.get(address, [])

    def has_address(self, address: str) -> bool:
        """Check if address exists in graph."""
        return address in self._addresses

    @property
    def address_count(self) -> int:
        """Get number of unique addresses."""
        return len(self._addresses)

    @property
    def edge_count(self) -> int:
        """Get number of edges."""
        return sum(len(edges) for edges in self._outgoing.values())


class PathFinder:
    """Finds paths between addresses in the transaction graph."""

    def __init__(self, graph: TransactionGraph):
        self.graph = graph

    def find_paths(
        self,
        source: str,
        destination: str,
        constraints: PathConstraints | None = None,
        strategy: PathFindingStrategy = PathFindingStrategy.BFS,
        max_paths: int = 10,
    ) -> list[Path]:
        """Find paths between source and destination."""
        if constraints is None:
            constraints = PathConstraints()

        if strategy == PathFindingStrategy.BFS:
            return self._bfs(source, destination, constraints, max_paths)
        elif strategy == PathFindingStrategy.DFS:
            return self._dfs(source, destination, constraints, max_paths)
        else:
            return self._bfs(source, destination, constraints, max_paths)

    def _bfs(
        self,
        source: str,
        destination: str,
        constraints: PathConstraints,
        max_paths: int,
    ) -> list[Path]:
        """Breadth-First Search for shortest paths."""
        paths: list[Path] = []

        # Queue: (current_address, edges_so_far, visited_set)
        queue: deque[tuple[str, list[TransactionEdge], set[str]]] = deque()
        queue.append((source, [], {source}))

        while queue and len(paths) < max_paths:
            current, edges, visited = queue.popleft()

            # Check if we reached destination
            if current == destination and edges:
                path = self._create_path(source, destination, edges)
                if path and self._validate_path(path, constraints):
                    paths.append(path)
                continue

            # Check hop limit
            if len(edges) >= constraints.max_hops:
                continue

            # Get neighbors
            for neighbor, edge in self.graph.get_outgoing(current):
                # Skip if already visited
                if neighbor in visited:
                    continue

                # Skip excluded addresses
                if (
                    constraints.exclude_addresses
                    and neighbor in constraints.exclude_addresses
                ):
                    continue

                # Validate edge
                if not self._validate_edge(edge, constraints):
                    continue

                # Add to queue
                new_edges = [*edges, edge]
                new_visited = visited | {neighbor}
                queue.append((neighbor, new_edges, new_visited))

        return paths

    def _dfs(
        self,
        source: str,
        destination: str,
        constraints: PathConstraints,
        max_paths: int,
    ) -> list[Path]:
        """Depth-First Search for all paths."""
        paths: list[Path] = []

        def dfs_recursive(
            current: str,
            edges: list[TransactionEdge],
            visited: set[str],
        ) -> None:
            if len(paths) >= max_paths:
                return

            # Check if we reached destination
            if current == destination and edges:
                path = self._create_path(source, destination, edges)
                if path and self._validate_path(path, constraints):
                    paths.append(path)
                return

            # Check hop limit
            if len(edges) >= constraints.max_hops:
                return

            # Get neighbors
            for neighbor, edge in self.graph.get_outgoing(current):
                # Skip if already visited
                if neighbor in visited:
                    continue

                # Skip excluded addresses
                if (
                    constraints.exclude_addresses
                    and neighbor in constraints.exclude_addresses
                ):
                    continue

                # Validate edge
                if not self._validate_edge(edge, constraints):
                    continue

                # Recurse
                dfs_recursive(
                    neighbor,
                    [*edges, edge],
                    visited | {neighbor},
                )

        dfs_recursive(source, [], {source})
        return paths

    def _create_path(
        self,
        source: str,
        destination: str,
        edges: list[TransactionEdge],
    ) -> Path | None:
        """Create a Path object from edges."""
        if not edges:
            return None

        total_value = sum(e.value for e in edges)
        total_risk = sum(e.risk_score for e in edges)
        chains_used = list({e.chain for e in edges})

        return Path(
            source=source,
            destination=destination,
            edges=edges,
            total_value=total_value,
            hop_count=len(edges),
            total_risk_score=total_risk,
            chains_used=chains_used,
        )

    def _validate_edge(
        self,
        edge: TransactionEdge,
        constraints: PathConstraints,
    ) -> bool:
        """Validate if an edge meets constraints."""
        # Value constraints
        if edge.value < constraints.min_value:
            return False
        if edge.value > constraints.max_value:
            return False

        # Time constraints
        if constraints.start_time and edge.timestamp < constraints.start_time:
            return False
        if constraints.end_time and edge.timestamp > constraints.end_time:
            return False

        # Chain constraints
        if constraints.chains and edge.chain not in constraints.chains:
            return False

        # Suspicious filter
        return not (constraints.include_suspicious_only and not edge.is_suspicious)

    def _validate_path(
        self,
        path: Path,
        constraints: PathConstraints,
    ) -> bool:
        """Validate if a complete path meets constraints."""
        # Hop count
        if path.hop_count > constraints.max_hops:
            return False

        # Minimum hops (at least 1)
        return not path.hop_count < 1

    def find_shortest_path(
        self,
        source: str,
        destination: str,
        constraints: PathConstraints | None = None,
    ) -> Path | None:
        """Find the shortest path between two addresses."""
        paths = self.find_paths(
            source,
            destination,
            constraints,
            PathFindingStrategy.BFS,
            max_paths=1,
        )
        return paths[0] if paths else None

    def find_all_paths(
        self,
        source: str,
        destination: str,
        constraints: PathConstraints | None = None,
        max_paths: int = 100,
    ) -> list[Path]:
        """Find all paths between two addresses."""
        return self.find_paths(
            source,
            destination,
            constraints,
            PathFindingStrategy.DFS,
            max_paths,
        )

    def find_high_risk_paths(
        self,
        source: str,
        destination: str,
        risk_threshold: float = 0.5,
        constraints: PathConstraints | None = None,
    ) -> list[Path]:
        """Find paths with high risk scores."""
        paths = self.find_paths(
            source,
            destination,
            constraints,
            PathFindingStrategy.DFS,
            max_paths=100,
        )

        # Filter by risk score
        high_risk_paths = [p for p in paths if p.average_risk_score >= risk_threshold]

        # Sort by risk score (highest first)
        high_risk_paths.sort(key=lambda p: p.average_risk_score, reverse=True)

        return high_risk_paths

    def get_address_neighbors(
        self,
        address: str,
        depth: int = 1,
    ) -> dict[str, Any]:
        """Get all neighbors within specified depth."""
        result = {
            "address": address,
            "depth": depth,
            "neighbors": [],
            "total_value": 0.0,
            "transaction_count": 0,
        }

        visited = {address}
        queue: deque[tuple[str, int]] = deque([(address, 0)])

        while queue:
            current, current_depth = queue.popleft()

            if current_depth >= depth:
                continue

            for neighbor, edge in self.graph.get_outgoing(current):
                if neighbor not in visited:
                    visited.add(neighbor)
                    result["neighbors"].append(
                        {
                            "address": neighbor,
                            "depth": current_depth + 1,
                            "value": edge.value,
                            "currency": edge.currency,
                            "tx_hash": edge.tx_hash,
                            "timestamp": edge.timestamp.isoformat(),
                        }
                    )
                    result["total_value"] += edge.value
                    result["transaction_count"] += 1

                    queue.append((neighbor, current_depth + 1))

        return result


def format_path_for_display(path: Path) -> str:
    """Format a path for human-readable display."""
    lines = []
    lines.append(f"Path: {path.source} -> {path.destination}")
    lines.append(f"Hops: {path.hop_count}")
    lines.append(
        f"Total Value: {path.total_value:.4f} {path.edges[0].currency if path.edges else 'N/A'}"
    )
    lines.append(f"Risk Score: {path.average_risk_score:.2f}")
    lines.append(f"Chains: {', '.join(c.value for c in path.chains_used)}")
    lines.append("")
    lines.append("Transactions:")

    for i, edge in enumerate(path.edges, 1):
        lines.append(
            f"  {i}. {edge.from_address[:8]}...{edge.from_address[-6:]} -> "
            f"{edge.to_address[:8]}...{edge.to_address[-6:]} "
            f"({edge.value:.4f} {edge.currency}) "
            f"[{edge.timestamp.strftime('%Y-%m-%d %H:%M')}]"
        )

    return "\n".join(lines)
