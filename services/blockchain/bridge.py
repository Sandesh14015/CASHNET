"""Bridge event detection for cross-chain transactions.

Detects and tracks bridge events for cross-chain transfers.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any, ClassVar

from pydantic import BaseModel

from .base import ChainType, NormalizedTransaction


class BridgeType(StrEnum):
    """Supported bridge types."""

    WORMHOLE = "wormhole"
    CELER = "celer"
    MULTICHAIN = "multichain"
    STARGATE = "stargate"
    HOP = "hop"
    ARBITRUM = "arbitrum"
    OPTIMISM = "optimism"
    BASE = "base"
    POLYGON_POS = "polygon_pos"
    UNKNOWN = "unknown"


class BridgeEvent(BaseModel):
    """Bridge event data."""

    event_id: str
    bridge_type: BridgeType

    # Source chain
    source_chain: ChainType
    source_tx_hash: str
    source_block_number: int
    source_timestamp: datetime
    source_address: str

    # Destination chain
    destination_chain: ChainType
    destination_tx_hash: str | None = None
    destination_block_number: int | None = None
    destination_timestamp: datetime | None = None
    destination_address: str | None = None

    # Transfer details
    token_address: str
    token_symbol: str
    amount: float

    # Status
    status: str = "pending"  # pending, completed, failed

    # Risk indicators
    is_suspicious: bool = False
    risk_score: float = 0.0

    # Bridge-specific metadata
    metadata: dict[str, Any] = {}


class BridgeDetector:
    """Detects bridge events across chains."""

    # Known bridge contract addresses
    BRIDGE_CONTRACTS: ClassVar[dict[str, dict[str, Any]]] = {
        # Wormhole
        "0x3ee18b2214aff97000d974cf647e7c347e8fa585": {
            "name": "wormhole",
            "type": BridgeType.WORMHOLE,
            "chain": ChainType.ETHEREUM,
        },
        "0x7a4b5a039c878a4508de9cfc1d5320a5d8e626d1": {
            "name": "wormhole",
            "type": BridgeType.WORMHOLE,
            "chain": ChainType.BNB,
        },
        # Celer
        "0x5427fefa711eff984124bfbb1ab6fbf5e3da1820": {
            "name": "celer",
            "type": BridgeType.CELER,
            "chain": ChainType.ETHEREUM,
        },
        # Multichain
        "0x1515d9422931164d185d3d1785e19c6c4e4d9f3e": {
            "name": "multichain",
            "type": BridgeType.MULTICHAIN,
            "chain": ChainType.ETHEREUM,
        },
        # Stargate (LayerZero)
        "0x8731d54e9d02c286767d56ac03e8037c07e01e98": {
            "name": "stargate",
            "type": BridgeType.STARGATE,
            "chain": ChainType.ETHEREUM,
        },
        # Polygon PoS Bridge
        "0xa0c68c638235ee32657e8f720a23cec1bfc9c3ca": {
            "name": "polygon_pos",
            "type": BridgeType.POLYGON_POS,
            "chain": ChainType.ETHEREUM,
        },
        # Arbitrum Bridge
        "0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a": {
            "name": "arbitrum",
            "type": BridgeType.ARBITRUM,
            "chain": ChainType.ETHEREUM,
        },
        # Optimism Bridge
        "0x99c9fc46f92e8a1c0dec1b2773d00db724076d3d": {
            "name": "optimism",
            "type": BridgeType.OPTIMISM,
            "chain": ChainType.ETHEREUM,
        },
    }

    # Bridge event signatures
    BRIDGE_EVENT_SIGNATURES: ClassVar[dict[str, str]] = {
        "0x5b071b590a59395fe40950651348571e68d08ab67b877f378b9562a0a97c8a2c": "Transfer",
        "0x67196e18f37379c9471ee27bab480d2e6fc2f39e0a11e6d7e9c912d0a3b2a1c2": "Deposit",
    }

    def __init__(self):
        self._detected_events: dict[str, BridgeEvent] = {}

    def detect_bridge_event(
        self,
        transaction: NormalizedTransaction,
    ) -> BridgeEvent | None:
        """Detect if a transaction is a bridge event."""
        # Check if contract address is a known bridge
        if transaction.to_address.lower() in self.BRIDGE_CONTRACTS:
            bridge_info = self.BRIDGE_CONTRACTS[transaction.to_address.lower()]

            # Create bridge event
            event = BridgeEvent(
                event_id=f"{transaction.chain}:{transaction.tx_hash}",
                bridge_type=bridge_info["type"],
                source_chain=transaction.chain,
                source_tx_hash=transaction.tx_hash,
                source_block_number=transaction.block_number,
                source_timestamp=transaction.block_timestamp,
                source_address=transaction.from_address,
                destination_chain=self._infer_destination_chain(
                    transaction, bridge_info
                ),
                token_address=transaction.token_address or "",
                token_symbol=transaction.token_symbol or "UNKNOWN",
                amount=transaction.value,
                status="pending",
            )

            # Calculate risk score
            event.risk_score = self._calculate_risk_score(event, transaction)
            event.is_suspicious = event.risk_score > 0.7

            # Store event
            self._detected_events[event.event_id] = event

            return event

        return None

    def _infer_destination_chain(
        self,
        transaction: NormalizedTransaction,
        bridge_info: dict[str, Any],
    ) -> ChainType:
        """Infer destination chain from bridge type."""
        # This is simplified - in production, parse event logs
        bridge_type = bridge_info["type"]

        if bridge_type == BridgeType.POLYGON_POS:
            return ChainType.POLYGON
        elif bridge_type == BridgeType.ARBITRUM:
            return ChainType.ETHEREUM  # Arbitrum is L2
        elif bridge_type == BridgeType.OPTIMISM:
            return ChainType.ETHEREUM  # Optimism is L2
        elif bridge_type == BridgeType.WORMHOLE:
            # Would need to parse event logs
            return ChainType.SOLANA  # Default for Wormhole
        elif bridge_type == BridgeType.CELER:
            return ChainType.BNB  # Common Celer destination
        else:
            return ChainType.ETHEREUM

    def _calculate_risk_score(
        self,
        event: BridgeEvent,
        transaction: NormalizedTransaction,
    ) -> float:
        """Calculate risk score for a bridge event."""
        score = 0.0

        # Large value bridge
        if event.amount > 100000:
            score += 0.4
        elif event.amount > 10000:
            score += 0.2

        # Unknown destination
        if event.destination_chain == ChainType.ETHEREUM:
            # Bridging to Ethereum is common, lower risk
            score += 0.0
        else:
            # Bridging to other chains might be suspicious
            score += 0.1

        # Failed transaction
        if not transaction.is_success:
            score += 0.2

        # Rapid bridging (potential laundering)
        # Would need historical data to detect

        return min(score, 1.0)

    def update_destination(
        self,
        event_id: str,
        destination_tx_hash: str,
        destination_chain: ChainType,
        destination_block_number: int,
        destination_address: str,
    ) -> bool:
        """Update event with destination transaction details."""
        if event_id in self._detected_events:
            event = self._detected_events[event_id]
            event.destination_tx_hash = destination_tx_hash
            event.destination_chain = destination_chain
            event.destination_block_number = destination_block_number
            event.destination_timestamp = datetime.now(UTC)
            event.destination_address = destination_address
            event.status = "completed"
            return True
        return False

    def get_event(self, event_id: str) -> BridgeEvent | None:
        """Get a bridge event by ID."""
        return self._detected_events.get(event_id)

    def get_events_by_address(
        self,
        address: str,
        chain: ChainType | None = None,
    ) -> list[BridgeEvent]:
        """Get all bridge events for an address."""
        events = []

        for event in self._detected_events.values():
            if event.source_address == address:
                if chain is None or event.source_chain == chain:
                    events.append(event)
            elif event.destination_address == address:
                if chain is None or event.destination_chain == chain:
                    events.append(event)

        return events

    def get_events_by_bridge_type(
        self,
        bridge_type: BridgeType,
    ) -> list[BridgeEvent]:
        """Get all events for a specific bridge type."""
        return [
            event
            for event in self._detected_events.values()
            if event.bridge_type == bridge_type
        ]

    def get_pending_events(self) -> list[BridgeEvent]:
        """Get all pending bridge events."""
        return [
            event
            for event in self._detected_events.values()
            if event.status == "pending"
        ]

    def get_suspicious_events(self) -> list[BridgeEvent]:
        """Get all suspicious bridge events."""
        return [
            event for event in self._detected_events.values() if event.is_suspicious
        ]

    def get_statistics(self) -> dict[str, Any]:
        """Get bridge event statistics."""
        events = list(self._detected_events.values())

        if not events:
            return {"total": 0}

        # Count by bridge type
        by_type = {}
        for event in events:
            bridge_type = event.bridge_type.value
            by_type[bridge_type] = by_type.get(bridge_type, 0) + 1

        # Count by status
        by_status = {}
        for event in events:
            status = event.status
            by_status[status] = by_status.get(status, 0) + 1

        # Count by chain
        by_source_chain = {}
        for event in events:
            chain = event.source_chain.value
            by_source_chain[chain] = by_source_chain.get(chain, 0) + 1

        # Total value
        total_value = sum(event.amount for event in events)

        # Suspicious count
        suspicious_count = sum(1 for event in events if event.is_suspicious)

        return {
            "total": len(events),
            "by_type": by_type,
            "by_status": by_status,
            "by_source_chain": by_source_chain,
            "total_value": total_value,
            "suspicious_count": suspicious_count,
            "pending_count": by_status.get("pending", 0),
        }


def format_bridge_event(event: BridgeEvent) -> str:
    """Format bridge event for display."""
    lines = [
        f"Bridge Event: {event.event_id}",
        f"Type: {event.bridge_type.value}",
        f"Status: {event.status}",
        "",
        "Source:",
        f"  Chain: {event.source_chain.value}",
        f"  Tx: {event.source_tx_hash}",
        f"  Block: {event.source_block_number}",
        f"  Time: {event.source_timestamp.isoformat()}",
        f"  Address: {event.source_address}",
        "",
        "Destination:",
        f"  Chain: {event.destination_chain.value}",
        f"  Tx: {event.destination_tx_hash or 'Pending'}",
        f"  Block: {event.destination_block_number or 'Pending'}",
        f"  Time: {event.destination_timestamp.isoformat() if event.destination_timestamp else 'Pending'}",
        f"  Address: {event.destination_address or 'Pending'}",
        "",
        "Transfer:",
        f"  Token: {event.token_symbol} ({event.token_address})",
        f"  Amount: {event.amount}",
        "",
        f"Risk: {event.risk_score:.2f} ({'Suspicious' if event.is_suspicious else 'Normal'})",
    ]

    return "\n".join(lines)
