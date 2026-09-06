"""Mixer/Tumbler Detection Service.

Detects mixer, tumbler, and other privacy-enhancing transaction patterns
using heuristic analysis and known address lists.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class MixerType(StrEnum):
    """Types of mixers/tumblers."""

    TORNADO_CASH = "tornado_cash"
    centralized_mixer = "centralized_mixer"
    decentralized_mixer = "decentralized_mixer"
    coinjoin = "coinjoin"
    wasabi = "wasabi"
    chipmixer = "chipmixer"
    unknown_mixer = "unknown_mixer"
    privacy_pool = "privacy_pool"
    other = "other"


class MixerRiskLevel(StrEnum):
    """Mixer risk levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class DetectionMethod(StrEnum):
    """Detection methods."""

    KNOWN_ADDRESS = "known_address"
    TRANSACTION_PATTERN = "transaction_pattern"
    BEHAVIORAL = "behavioral"
    STRUCTURAL = "structural"
    AMOUNT_ANALYSIS = "amount_analysis"
    TIMING_ANALYSIS = "timing_analysis"
    CLUSTER_ANALYSIS = "cluster_analysis"
    HEURISTIC = "heuristic"


class MixerSignal(BaseModel):
    """A mixer detection signal."""

    signal_id: str
    address: str
    chain: str

    # Detection details
    mixer_type: MixerType
    detection_method: DetectionMethod
    confidence: float  # 0.0 to 1.0
    risk_level: MixerRiskLevel

    # Evidence
    evidence: list[dict[str, Any]] = []
    indicators: list[str] = []

    # Known references
    known_mixer_address: str | None = None
    mixer_contract: str | None = None

    # Context
    transaction_hash: str | None = None
    case_id: str | None = None

    # Metadata
    detected_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = {}


class KnownMixer(BaseModel):
    """A known mixer/tumbler."""

    address: str
    chain: str
    mixer_type: MixerType
    name: str
    risk_level: MixerRiskLevel

    # Details
    total_volume: float = 0.0
    transaction_count: int = 0
    first_seen: datetime | None = None
    last_seen: datetime | None = None

    # Metadata
    source: str = "manual"  # "manual", "verified", "community"
    tags: list[str] = []
    metadata: dict[str, Any] = {}


class MixerDetector:
    """Mixer/Tumbler detection service."""

    def __init__(self):
        self._known_mixers: dict[str, KnownMixer] = {}  # key: chain:address
        self._signals: list[MixerSignal] = []
        self._address_index: dict[str, list[str]] = {}  # address -> [signal_ids]

        # Load known mixers
        self._load_known_mixers()

    def _load_known_mixers(self) -> None:
        """Load known mixer addresses."""
        known_mixers = [
            # Tornado Cash
            KnownMixer(
                address="0xd90f62eb3b6ed24c4626180e21a378b236c2f495",
                chain="ethereum",
                mixer_type=MixerType.TORNADO_CASH,
                name="Tornado Cash 100 ETH",
                risk_level=MixerRiskLevel.CRITICAL,
                source="verified",
                tags=["tornado_cash", "sanctioned", "ofac"],
            ),
            KnownMixer(
                address="0xsd89fbb1a8c41d24cb251453042a468f1c3b8e85",
                chain="ethereum",
                mixer_type=MixerType.TORNADO_CASH,
                name="Tornado Cash 10 ETH",
                risk_level=MixerRiskLevel.CRITICAL,
                source="verified",
                tags=["tornado_cash", "sanctioned", "ofac"],
            ),
            KnownMixer(
                address="0x12d66f276e5d2df608adb8ff9de6f91f10f4e6ed",
                chain="ethereum",
                mixer_type=MixerType.TORNADO_CASH,
                name="Tornado Cash 0.1 ETH",
                risk_level=MixerRiskLevel.CRITICAL,
                source="verified",
                tags=["tornado_cash", "sanctioned", "ofac"],
            ),
            KnownMixer(
                address="0x47ce0c6ed56a4b97781f9a5de5fb7b7a1b348a68",
                chain="ethereum",
                mixer_type=MixerType.TORNADO_CASH,
                name="Tornado Cash 1 ETH",
                risk_level=MixerRiskLevel.CRITICAL,
                source="verified",
                tags=["tornado_cash", "sanctioned", "ofac"],
            ),
            # ChipMixer
            KnownMixer(
                address="0x8576acc5c05d6ce88f4e49bf65bdf0caca26cb78",
                chain="bitcoin",
                mixer_type=MixerType.chipmixer,
                name="ChipMixer",
                risk_level=MixerRiskLevel.HIGH,
                source="verified",
                tags=["chipmixer", "seized"],
            ),
        ]

        for mixer in known_mixers:
            key = f"{mixer.chain}:{mixer.address.lower()}"
            self._known_mixers[key] = mixer

    def register_known_mixer(self, mixer: KnownMixer) -> KnownMixer:
        """Register a known mixer."""
        key = f"{mixer.chain}:{mixer.address.lower()}"
        self._known_mixers[key] = mixer
        return mixer

    def check_address(
        self,
        address: str,
        chain: str,
        transaction_data: dict[str, Any] | None = None,
        case_id: str | None = None,
    ) -> list[MixerSignal]:
        """Check an address for mixer indicators."""
        signals: list[MixerSignal] = []

        # Check known mixer list
        known_signal = self._check_known_mixers(address, chain, case_id)
        if known_signal:
            signals.append(known_signal)

        # Check transaction patterns
        if transaction_data:
            pattern_signals = self._check_patterns(
                address, chain, transaction_data, case_id
            )
            signals.extend(pattern_signals)

            # Check amount analysis
            amount_signal = self._check_amounts(
                address, chain, transaction_data, case_id
            )
            if amount_signal:
                signals.append(amount_signal)

            # Check timing analysis
            timing_signal = self._check_timing(
                address, chain, transaction_data, case_id
            )
            if timing_signal:
                signals.append(timing_signal)

        # Store signals
        for signal in signals:
            self._signals.append(signal)
            if address not in self._address_index:
                self._address_index[address.lower()] = []
            self._address_index[address.lower()].append(signal.signal_id)

        return signals

    def get_signals_for_address(self, address: str) -> list[MixerSignal]:
        """Get all mixer signals for an address."""
        signal_ids = self._address_index.get(address.lower(), [])
        return [s for s in self._signals if s.signal_id in signal_ids]

    def get_all_signals(
        self,
        chain: str | None = None,
        mixer_type: MixerType | None = None,
        risk_level: MixerRiskLevel | None = None,
        limit: int = 100,
    ) -> list[MixerSignal]:
        """Get all mixer signals with optional filters."""
        results = self._signals

        if chain:
            results = [s for s in results if s.chain == chain]
        if mixer_type:
            results = [s for s in results if s.mixer_type == mixer_type]
        if risk_level:
            results = [s for s in results if s.risk_level == risk_level]

        return results[:limit]

    def get_known_mixers(
        self,
        chain: str | None = None,
        mixer_type: MixerType | None = None,
    ) -> list[KnownMixer]:
        """Get all known mixers."""
        results = list(self._known_mixers.values())

        if chain:
            results = [m for m in results if m.chain == chain]
        if mixer_type:
            results = [m for m in results if m.mixer_type == mixer_type]

        return results

    def get_statistics(self) -> dict[str, Any]:
        """Get mixer detection statistics."""
        signals = self._signals
        known = list(self._known_mixers.values())

        # Count signals by type
        signals_by_type = {}
        for s in signals:
            mtype = s.mixer_type.value
            signals_by_type[mtype] = signals_by_type.get(mtype, 0) + 1

        # Count signals by risk level
        signals_by_risk = {}
        for s in signals:
            risk = s.risk_level.value
            signals_by_risk[risk] = signals_by_risk.get(risk, 0) + 1

        # Count known mixers by chain
        known_by_chain = {}
        for m in known:
            chain = m.chain
            known_by_chain[chain] = known_by_chain.get(chain, 0) + 1

        # Average confidence
        avg_confidence = (
            sum(s.confidence for s in signals) / len(signals) if signals else 0.0
        )

        return {
            "total_signals": len(signals),
            "unique_addresses": len(self._address_index),
            "total_known_mixers": len(known),
            "signals_by_type": signals_by_type,
            "signals_by_risk": signals_by_risk,
            "known_by_chain": known_by_chain,
            "average_confidence": round(avg_confidence, 4),
        }

    def _check_known_mixers(
        self,
        address: str,
        chain: str,
        case_id: str | None,
    ) -> MixerSignal | None:
        """Check if address is a known mixer."""
        key = f"{chain}:{address.lower()}"
        known = self._known_mixers.get(key)

        if known:
            import uuid

            return MixerSignal(
                signal_id=str(uuid.uuid4()),
                address=address.lower(),
                chain=chain,
                mixer_type=known.mixer_type,
                detection_method=DetectionMethod.KNOWN_ADDRESS,
                confidence=0.99,
                risk_level=known.risk_level,
                evidence=[
                    {
                        "type": "known_mixer",
                        "name": known.name,
                        "source": known.source,
                    }
                ],
                indicators=[f"Address is a known {known.mixer_type.value} mixer"],
                known_mixer_address=address,
                case_id=case_id,
            )

        return None

    def _check_patterns(
        self,
        address: str,
        chain: str,
        transaction_data: dict[str, Any],
        case_id: str | None,
    ) -> list[MixerSignal]:
        """Check for mixer transaction patterns."""
        signals = []

        # Pattern 1: Multiple inputs to single output (consolidation)
        input_count = transaction_data.get("input_count", 0)
        if input_count >= 5:
            signals.append(
                self._create_signal(
                    address,
                    chain,
                    MixerType.unknown_mixer,
                    DetectionMethod.TRANSACTION_PATTERN,
                    0.6,
                    MixerRiskLevel.MEDIUM,
                    [f"Transaction has {input_count} inputs (consolidation pattern)"],
                    case_id,
                )
            )

        # Pattern 2: Fixed denomination amounts
        amounts = transaction_data.get("amounts", [])
        if amounts:
            unique_amounts = set(amounts)
            if len(unique_amounts) <= 3 and len(amounts) >= 5:
                signals.append(
                    self._create_signal(
                        address,
                        chain,
                        MixerType.unknown_mixer,
                        DetectionMethod.AMOUNT_ANALYSIS,
                        0.7,
                        MixerRiskLevel.MEDIUM,
                        [f"Fixed denomination amounts detected: {unique_amounts}"],
                        case_id,
                    )
                )

        return signals

    def _check_amounts(
        self,
        address: str,
        chain: str,
        transaction_data: dict[str, Any],
        case_id: str | None,
    ) -> MixerSignal | None:
        """Check for suspicious amount patterns."""
        # Check for amounts that are powers of 2 (common in mixers)
        amounts = transaction_data.get("amounts", [])

        for amount in amounts:
            if amount > 0 and (amount & (amount - 1)) == 0:  # Power of 2
                return self._create_signal(
                    address,
                    chain,
                    MixerType.unknown_mixer,
                    DetectionMethod.AMOUNT_ANALYSIS,
                    0.5,
                    MixerRiskLevel.LOW,
                    [f"Power-of-2 amount detected: {amount}"],
                    case_id,
                )

        return None

    def _check_timing(
        self,
        address: str,
        chain: str,
        transaction_data: dict[str, Any],
        case_id: str | None,
    ) -> MixerSignal | None:
        """Check for suspicious timing patterns."""
        # Check for uniform time intervals (automated mixing)
        timestamps = transaction_data.get("timestamps", [])

        if len(timestamps) >= 3:
            intervals = [
                timestamps[i + 1] - timestamps[i] for i in range(len(timestamps) - 1)
            ]

            # Check if intervals are very similar (automated)
            if intervals:
                avg_interval = sum(intervals) / len(intervals)
                if avg_interval > 0:
                    variance = sum((i - avg_interval) ** 2 for i in intervals) / len(
                        intervals
                    )
                    cv = (variance**0.5) / avg_interval if avg_interval > 0 else 0

                    if cv < 0.1:  # Very uniform intervals
                        return self._create_signal(
                            address,
                            chain,
                            MixerType.unknown_mixer,
                            DetectionMethod.TIMING_ANALYSIS,
                            0.65,
                            MixerRiskLevel.MEDIUM,
                            [f"Uniform transaction intervals detected (CV: {cv:.3f})"],
                            case_id,
                        )

        return None

    def _create_signal(
        self,
        address: str,
        chain: str,
        mixer_type: MixerType,
        detection_method: DetectionMethod,
        confidence: float,
        risk_level: MixerRiskLevel,
        indicators: list[str],
        case_id: str | None,
    ) -> MixerSignal:
        """Create a mixer signal."""
        import uuid

        return MixerSignal(
            signal_id=str(uuid.uuid4()),
            address=address.lower(),
            chain=chain,
            mixer_type=mixer_type,
            detection_method=detection_method,
            confidence=confidence,
            risk_level=risk_level,
            indicators=indicators,
            case_id=case_id,
        )


def format_mixer_signal(signal: MixerSignal) -> str:
    """Format a mixer signal for display."""
    lines = [
        "Mixer Detection Signal",
        f"Address: {signal.address}",
        f"Chain: {signal.chain}",
        f"Type: {signal.mixer_type.value}",
        f"Detection: {signal.detection_method.value}",
        f"Confidence: {signal.confidence:.1%}",
        f"Risk: {signal.risk_level.value}",
        "",
        "Indicators:",
    ]

    for indicator in signal.indicators:
        lines.append(f"  - {indicator}")

    if signal.known_mixer_address:
        lines.append(f"\nKnown Mixer: {signal.known_mixer_address}")

    return "\n".join(lines)
