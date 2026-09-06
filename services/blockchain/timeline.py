"""Timeline Generation Service.

Generates chronological timelines from transaction traces and investigation events.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel

from .base import ChainType, NormalizedTransaction


class TimelineEventType(StrEnum):
    """Timeline event types."""

    TRANSACTION = "transaction"
    BRIDGE_EVENT = "bridge_event"
    ADDRESS_DISCOVERY = "address_discovery"
    VASP_ATTRIBUTION = "vasp_attribution"
    FINDING = "finding"
    ACTION_REQUEST = "action_request"
    CASE_STATUS_CHANGE = "case_status_change"
    INVESTIGATION_NOTE = "investigation_note"
    EXTERNAL_INTEGRATION = "external_integration"
    OTHER = "other"


class TimelineEvent(BaseModel):
    """A single event in the timeline."""

    event_id: str
    event_type: TimelineEventType
    timestamp: datetime

    # Related entities
    case_id: str | None = None
    tx_hash: str | None = None
    address: str | None = None
    chain: ChainType | None = None

    # Event details
    title: str
    description: str | None = None
    value: float | None = None
    currency: str | None = None

    # Source
    source: str = "system"  # "system", "investigator", "integration"
    source_id: str | None = None  # Reference to source object

    # Risk
    risk_score: float | None = None
    is_suspicious: bool = False

    # Metadata
    metadata: dict[str, Any] = {}


class TimelineFilter(BaseModel):
    """Filter criteria for timeline."""

    start_time: datetime | None = None
    end_time: datetime | None = None
    event_types: list[TimelineEventType] | None = None
    chains: ChainType | None = None
    addresses: list[str] | None = None
    min_value: float | None = None
    max_value: float | None = None
    include_suspicious_only: bool = False


class TimelineSummary(BaseModel):
    """Summary statistics for a timeline."""

    total_events: int = 0
    time_span_hours: float = 0.0
    first_event: datetime | None = None
    last_event: datetime | None = None

    # By type
    events_by_type: dict[str, int] = {}

    # By chain
    events_by_chain: dict[str, int] = {}

    # Value statistics
    total_value: float = 0.0
    max_single_value: float = 0.0
    avg_value: float = 0.0

    # Risk statistics
    suspicious_count: int = 0
    avg_risk_score: float = 0.0

    # Unique entities
    unique_addresses: int = 0
    unique_chains: int = 0


class TimelineService:
    """Generates and manages investigation timelines."""

    def __init__(self):
        self._events: dict[str, TimelineEvent] = {}
        self._case_index: dict[str, list[str]] = {}  # case_id -> [event_ids]
        self._address_index: dict[str, list[str]] = {}  # address -> [event_ids]
        self._chain_index: dict[ChainType, list[str]] = {}  # chain -> [event_ids]

    def add_transaction_event(
        self,
        transaction: NormalizedTransaction,
        case_id: str | None = None,
        source: str = "system",
    ) -> TimelineEvent:
        """Add a transaction to the timeline."""
        import uuid

        event = TimelineEvent(
            event_id=str(uuid.uuid4()),
            event_type=TimelineEventType.TRANSACTION,
            timestamp=transaction.block_timestamp,
            case_id=case_id,
            tx_hash=transaction.tx_hash,
            address=transaction.from_address,
            chain=transaction.chain,
            title=f"Transaction {transaction.tx_hash[:16]}...",
            description=f"{transaction.value} {transaction.currency} from {transaction.from_address[:16]}... to {transaction.to_address[:16]}...",
            value=transaction.value,
            currency=transaction.currency,
            source=source,
            risk_score=transaction.risk_score,
            is_suspicious=transaction.is_suspicious,
            metadata={
                "from_address": transaction.from_address,
                "to_address": transaction.to_address,
                "block_number": transaction.block_number,
                "transaction_type": (
                    transaction.transaction_type.value
                    if hasattr(transaction.transaction_type, "value")
                    else transaction.transaction_type
                ),
                "is_success": transaction.is_success,
            },
        )

        return self._add_event(event)

    def add_bridge_event(
        self,
        source_tx: NormalizedTransaction,
        destination_chain: ChainType,
        bridge_type: str,
        case_id: str | None = None,
    ) -> TimelineEvent:
        """Add a bridge event to the timeline."""
        import uuid

        event = TimelineEvent(
            event_id=str(uuid.uuid4()),
            event_type=TimelineEventType.BRIDGE_EVENT,
            timestamp=source_tx.block_timestamp,
            case_id=case_id,
            tx_hash=source_tx.tx_hash,
            address=source_tx.from_address,
            chain=source_tx.chain,
            title=f"Bridge via {bridge_type}",
            description=f"Cross-chain transfer from {source_tx.chain.value} to {destination_chain.value}",
            value=source_tx.value,
            currency=source_tx.currency,
            source="system",
            metadata={
                "source_chain": source_tx.chain.value,
                "destination_chain": destination_chain.value,
                "bridge_type": bridge_type,
                "from_address": source_tx.from_address,
                "to_address": source_tx.to_address,
            },
        )

        return self._add_event(event)

    def add_address_discovery(
        self,
        address: str,
        chain: ChainType,
        discovery_method: str,
        case_id: str | None = None,
        timestamp: datetime | None = None,
    ) -> TimelineEvent:
        """Add an address discovery event."""
        import uuid

        event = TimelineEvent(
            event_id=str(uuid.uuid4()),
            event_type=TimelineEventType.ADDRESS_DISCOVERY,
            timestamp=timestamp or datetime.now(UTC),
            case_id=case_id,
            address=address,
            chain=chain,
            title=f"Address Discovered: {address[:16]}...",
            description=f"New address discovered via {discovery_method}",
            source="system",
            metadata={
                "discovery_method": discovery_method,
            },
        )

        return self._add_event(event)

    def add_vasp_attribution(
        self,
        address: str,
        chain: ChainType,
        entity_name: str,
        confidence: float,
        case_id: str | None = None,
    ) -> TimelineEvent:
        """Add a VASP attribution event."""
        import uuid

        event = TimelineEvent(
            event_id=str(uuid.uuid4()),
            event_type=TimelineEventType.VASP_ATTRIBUTION,
            timestamp=datetime.now(UTC),
            case_id=case_id,
            address=address,
            chain=chain,
            title=f"VASP Attribution: {entity_name}",
            description=f"Address attributed to {entity_name} with {confidence:.1%} confidence",
            source="system",
            metadata={
                "entity_name": entity_name,
                "confidence": confidence,
            },
        )

        return self._add_event(event)

    def add_finding(
        self,
        finding_id: str,
        finding_type: str,
        case_id: str,
        description: str,
        risk_score: float | None = None,
    ) -> TimelineEvent:
        """Add a finding event."""
        import uuid

        event = TimelineEvent(
            event_id=str(uuid.uuid4()),
            event_type=TimelineEventType.FINDING,
            timestamp=datetime.now(UTC),
            case_id=case_id,
            title=f"Finding: {finding_type}",
            description=description,
            source="system",
            source_id=finding_id,
            risk_score=risk_score,
            metadata={
                "finding_id": finding_id,
                "finding_type": finding_type,
            },
        )

        return self._add_event(event)

    def add_investigation_note(
        self,
        case_id: str,
        title: str,
        content: str,
        author: str,
    ) -> TimelineEvent:
        """Add an investigation note."""
        import uuid

        event = TimelineEvent(
            event_id=str(uuid.uuid4()),
            event_type=TimelineEventType.INVESTIGATION_NOTE,
            timestamp=datetime.now(UTC),
            case_id=case_id,
            title=title,
            description=content,
            source="investigator",
            source_id=author,
            metadata={
                "author": author,
            },
        )

        return self._add_event(event)

    def get_timeline(
        self,
        case_id: str,
        timeline_filter: TimelineFilter | None = None,
    ) -> list[TimelineEvent]:
        """Get timeline for a case, optionally filtered."""
        event_ids = self._case_index.get(case_id, [])
        events = [self._events[eid] for eid in event_ids if eid in self._events]

        # Apply filters
        if timeline_filter:
            events = self._apply_filter(events, timeline_filter)

        # Sort by timestamp
        events.sort(key=lambda e: e.timestamp)

        return events

    def get_address_timeline(
        self,
        address: str,
        chain: ChainType | None = None,
    ) -> list[TimelineEvent]:
        """Get timeline for an address."""
        event_ids = self._address_index.get(address.lower(), [])
        events = [self._events[eid] for eid in event_ids if eid in self._events]

        # Filter by chain if specified
        if chain:
            events = [e for e in events if e.chain == chain]

        # Sort by timestamp
        events.sort(key=lambda e: e.timestamp)

        return events

    def get_summary(self, case_id: str) -> TimelineSummary:
        """Get summary statistics for a timeline."""
        event_ids = self._case_index.get(case_id, [])
        events = [self._events[eid] for eid in event_ids if eid in self._events]

        if not events:
            return TimelineSummary()

        # Sort by timestamp
        events.sort(key=lambda e: e.timestamp)

        # Time span
        first_event = events[0].timestamp
        last_event = events[-1].timestamp
        time_span = (last_event - first_event).total_seconds() / 3600

        # Count by type
        events_by_type = {}
        for event in events:
            event_type = event.event_type.value
            events_by_type[event_type] = events_by_type.get(event_type, 0) + 1

        # Count by chain
        events_by_chain = {}
        for event in events:
            if event.chain:
                chain = event.chain.value
                events_by_chain[chain] = events_by_chain.get(chain, 0) + 1

        # Value statistics
        values = [e.value for e in events if e.value is not None]
        total_value = sum(values)
        max_value = max(values) if values else 0
        avg_value = total_value / len(values) if values else 0

        # Risk statistics
        suspicious = [e for e in events if e.is_suspicious]
        risk_scores = [e.risk_score for e in events if e.risk_score is not None]
        avg_risk = sum(risk_scores) / len(risk_scores) if risk_scores else 0

        # Unique entities
        unique_addresses = set()
        unique_chains = set()
        for event in events:
            if event.address:
                unique_addresses.add(event.address.lower())
            if event.chain:
                unique_chains.add(event.chain)

        return TimelineSummary(
            total_events=len(events),
            time_span_hours=round(time_span, 2),
            first_event=first_event,
            last_event=last_event,
            events_by_type=events_by_type,
            events_by_chain=events_by_chain,
            total_value=total_value,
            max_single_value=max_value,
            avg_value=round(avg_value, 4),
            suspicious_count=len(suspicious),
            avg_risk_score=round(avg_risk, 4),
            unique_addresses=len(unique_addresses),
            unique_chains=len(unique_chains),
        )

    def get_statistics(self) -> dict[str, Any]:
        """Get overall timeline statistics."""
        total_events = len(self._events)
        total_cases = len(self._case_index)

        # Count by type
        by_type = {}
        for event in self._events.values():
            event_type = event.event_type.value
            by_type[event_type] = by_type.get(event_type, 0) + 1

        return {
            "total_events": total_events,
            "total_cases": total_cases,
            "events_by_type": by_type,
        }

    def _add_event(self, event: TimelineEvent) -> TimelineEvent:
        """Add an event to the timeline."""
        self._events[event.event_id] = event

        # Update case index
        if event.case_id:
            if event.case_id not in self._case_index:
                self._case_index[event.case_id] = []
            self._case_index[event.case_id].append(event.event_id)

        # Update address index
        if event.address:
            addr = event.address.lower()
            if addr not in self._address_index:
                self._address_index[addr] = []
            self._address_index[addr].append(event.event_id)

        # Update chain index
        if event.chain:
            if event.chain not in self._chain_index:
                self._chain_index[event.chain] = []
            self._chain_index[event.chain].append(event.event_id)

        return event

    def _apply_filter(
        self,
        events: list[TimelineEvent],
        timeline_filter: TimelineFilter,
    ) -> list[TimelineEvent]:
        """Apply filter to events."""
        filtered = events

        if timeline_filter.start_time:
            filtered = [
                e for e in filtered if e.timestamp >= timeline_filter.start_time
            ]

        if timeline_filter.end_time:
            filtered = [e for e in filtered if e.timestamp <= timeline_filter.end_time]

        if timeline_filter.event_types:
            filtered = [
                e for e in filtered if e.event_type in timeline_filter.event_types
            ]

        if filter.chains:
            filtered = [e for e in filtered if e.chain == filter.chains]

        if filter.addresses:
            filter_addrs = {a.lower() for a in filter.addresses}
            filtered = [
                e for e in filtered if e.address and e.address.lower() in filter_addrs
            ]

        if filter.min_value is not None:
            filtered = [
                e
                for e in filtered
                if e.value is not None and e.value >= filter.min_value
            ]

        if filter.max_value is not None:
            filtered = [
                e
                for e in filtered
                if e.value is not None and e.value <= filter.max_value
            ]

        if filter.include_suspicious_only:
            filtered = [e for e in filtered if e.is_suspicious]

        return filtered


def format_timeline_event(event: TimelineEvent) -> str:
    """Format a timeline event for display."""
    lines = [
        f"[{event.timestamp.isoformat()}] {event.event_type.value.upper()}",
        f"  {event.title}",
    ]

    if event.description:
        lines.append(f"  {event.description}")

    if event.tx_hash:
        lines.append(f"  Tx: {event.tx_hash}")

    if event.address:
        lines.append(f"  Address: {event.address}")

    if event.chain:
        lines.append(f"  Chain: {event.chain.value}")

    if event.value is not None:
        lines.append(f"  Value: {event.value} {event.currency or ''}")

    if event.is_suspicious:
        lines.append(f"  ⚠️ SUSPICIOUS (Risk: {event.risk_score:.2f})")

    return "\n".join(lines)
