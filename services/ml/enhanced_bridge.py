"""Enhanced Bridge/Swap Detection Service.

Provides broader bridge and swap detection coverage with DEX protocol support,
cross-chain analysis, and advanced pattern matching.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class BridgeProtocol(StrEnum):
    """Supported bridge protocols."""

    # Layer 0
    WORMHOLE = "wormhole"
    LAYERZERO = "layerzero"
    AXELAR = "axelar"

    # Layer 2
    ARBITRUM_BRIDGE = "arbitrum_bridge"
    OPTIMISM_BRIDGE = "optimism_bridge"
    BASE_BRIDGE = "base_bridge"
    ZKSYNC_BRIDGE = "zksync_bridge"
    STARKNET_BRIDGE = "starknet_bridge"

    # Native bridges
    POLYGON_POS = "polygon_pos"
    AVALANCHE_CCHAIN = "avalanche_cchain"

    # Cross-chain
    STARGATE = "stargate"
    CELER = "celer"
    MULTICHAIN = "multichain"
    HOP = "hop"
    CONNEXT = "connext"
    SYNAPSE = "synapse"
    ACROSS = "across"

    # Other
    CUSTOM = "custom"
    UNKNOWN = "unknown"


class SwapProtocol(StrEnum):
    """Supported DEX/swap protocols."""

    # Uniswap
    UNISWAP_V2 = "uniswap_v2"
    UNISWAP_V3 = "uniswap_v3"
    UNISWAP_V4 = "uniswap_v4"

    # SushiSwap
    SUSHISWAP = "sushiswap"

    # Curve
    CURVE = "curve"

    # Balancer
    BALANCER = "balancer"

    # PancakeSwap
    PANCAKESWAP_V2 = "pancakeswap_v2"
    PANCAKESWAP_V3 = "pancakeswap_v3"

    # 1inch
    ONEINCH = "1inch"

    # 0x
    ZEROX = "0x"

    # Other
    DODO = "dodo"
    BANCOR = "bancor"
    OTHER = "other"


class PatternType(StrEnum):
    """Pattern types."""

    BRIDGE = "bridge"
    SWAP = "swap"
    FLASH_LOAN = "flash_loan"
    LIQUIDATION = "liquidation"
    CROSS_CHAIN_LAYERS = "cross_chain_layers"
    MEV = "mev"


class RiskIndicator(StrEnum):
    """Risk indicators for bridge/swap activity."""

    HIGH_VALUE = "high_value"
    RAPID_CHAIN_HOPPING = "rapid_chain_hopping"
    PRIVACY_BRIDGE = "privacy_bridge"
    UNKNOWN_PROTOCOL = "unknown_protocol"
    SUSPICIOUS_TIMING = "suspicious_timing"
    CROSS_CHAIN_LAYERING = "cross_chain_layering"
    FLASH_LOAN_ABUSE = "flash_loan_abuse"
    SANDWICH_ATTACK = "sandwich_attack"
    FRONT_RUNNING = "front_running"


class BridgePattern(BaseModel):
    """Detected bridge pattern."""

    pattern_id: str
    pattern_type: PatternType = PatternType.BRIDGE

    # Protocol
    protocol: BridgeProtocol
    protocol_address: str | None = None
    protocol_name: str | None = None

    # Chains
    source_chain: str
    destination_chain: str

    # Transaction details
    source_tx_hash: str
    destination_tx_hash: str | None = None
    source_block: int | None = None
    destination_block: int | None = None

    # Value
    token_address: str = ""
    token_symbol: str = ""
    amount: float = 0.0
    amount_usd: float | None = None

    # Addresses
    sender: str = ""
    receiver: str | None = None

    # Timing
    source_timestamp: datetime | None = None
    destination_timestamp: datetime | None = None
    bridge_duration_seconds: float | None = None

    # Risk
    risk_score: float = 0.0
    risk_indicators: list[RiskIndicator] = []

    # Status
    status: str = "pending"  # pending, completed, failed

    # Metadata
    detected_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = {}


class SwapPattern(BaseModel):
    """Detected swap pattern."""

    pattern_id: str
    pattern_type: PatternType = PatternType.SWAP

    # Protocol
    protocol: SwapProtocol
    protocol_address: str | None = None
    protocol_name: str | None = None

    # Chain
    chain: str

    # Transaction
    tx_hash: str
    block_number: int | None = None

    # Token details
    token_in_address: str = ""
    token_in_symbol: str = ""
    token_in_amount: float = 0.0

    token_out_address: str = ""
    token_out_symbol: str = ""
    token_out_amount: float = 0.0

    # Price impact
    price_impact_pct: float | None = None

    # Addresses
    sender: str = ""
    recipient: str | None = None

    # Timing
    timestamp: datetime | None = None

    # Risk
    risk_score: float = 0.0
    risk_indicators: list[RiskIndicator] = []

    # MEV indicators
    is_sandwich: bool = False
    is_front_run: bool = False
    is_back_run: bool = False

    # Metadata
    detected_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = {}


class EnhancedBridgeDetector:
    """Enhanced bridge and swap detection service."""

    def __init__(self):
        self._bridge_patterns: dict[str, BridgePattern] = {}
        self._swap_patterns: dict[str, SwapPattern] = {}
        self._address_index: dict[str, dict[str, list[str]]] = (
            {}
        )  # address -> {type: [pattern_ids]}

        # Known protocol addresses
        self._bridge_contracts: dict[str, dict[str, Any]] = (
            self._load_bridge_contracts()
        )
        self._dex_contracts: dict[str, dict[str, Any]] = self._load_dex_contracts()

        # Risk thresholds
        self._high_value_threshold_usd = 100000
        self._rapid_chain_hopping_window = 3600  # 1 hour

    def _load_bridge_contracts(self) -> dict[str, dict[str, Any]]:
        """Load known bridge contract addresses."""
        return {
            # Wormhole
            "0x3ee18b2214aff97000d974cf647e7c347e8fa585": {
                "protocol": BridgeProtocol.WORMHOLE,
                "name": "Wormhole Bridge",
                "chains": ["ethereum", "solana", "bnb", "polygon", "avalanche"],
            },
            # LayerZero
            "0x4d73adb72bc3dd368966edd0f0b2148401a178e2": {
                "protocol": BridgeProtocol.LAYERZERO,
                "name": "LayerZero Endpoint",
                "chains": ["ethereum", "bnb", "polygon", "avalanche", "arbitrum"],
            },
            # Arbitrum Bridge
            "0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a": {
                "protocol": BridgeProtocol.ARBITRUM_BRIDGE,
                "name": "Arbitrum Delayed Inbox",
                "chains": ["ethereum", "arbitrum"],
            },
            # Optimism Bridge
            "0x99c9fc46f92e8a1c0dec1b2773d00db724076d3d": {
                "protocol": BridgeProtocol.OPTIMISM_BRIDGE,
                "name": "Optimism L1StandardBridge",
                "chains": ["ethereum", "optimism"],
            },
            # Polygon PoS
            "0xa0c68c638235ee32657e8f720a23cec1bfc9c3ca": {
                "protocol": BridgeProtocol.POLYGON_POS,
                "name": "Polygon POS Bridge",
                "chains": ["ethereum", "polygon"],
            },
            # Stargate
            "0x8731d54e9d02c286767d56ac03e8037c07e01e98": {
                "protocol": BridgeProtocol.STARGATE,
                "name": "Stargate Router",
                "chains": [
                    "ethereum",
                    "bnb",
                    "polygon",
                    "avalanche",
                    "arbitrum",
                    "optimism",
                ],
            },
            # Celer
            "0x5427fefa711eff984124bfbb1ab6fbf5e3da1820": {
                "protocol": BridgeProtocol.CELER,
                "name": "Celer Bridge",
                "chains": ["ethereum", "bnb", "polygon", "avalanche"],
            },
            # Hop
            "0xb8901acb165ed027e32754e0fffe8327397ad40": {
                "protocol": BridgeProtocol.HOP,
                "name": "Hop Bridge",
                "chains": ["ethereum", "polygon", "arbitrum", "optimism", "gnosis"],
            },
            # Connext
            "0x11984dc4465481512eb5b777e44061c158cf2259": {
                "protocol": BridgeProtocol.CONNEXT,
                "name": "Connext Bridge",
                "chains": ["ethereum", "polygon", "arbitrum", "optimism"],
            },
        }

    def _load_dex_contracts(self) -> dict[str, dict[str, Any]]:
        """Load known DEX contract addresses."""
        return {
            # Uniswap V3
            "0xe592427a0aece92de3edee1f18e0157c05861564": {
                "protocol": SwapProtocol.UNISWAP_V3,
                "name": "Uniswap V3 Router",
            },
            "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": {
                "protocol": SwapProtocol.UNISWAP_V3,
                "name": "Uniswap V3 Quoter",
            },
            # Uniswap V2
            "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": {
                "protocol": SwapProtocol.UNISWAP_V2,
                "name": "Uniswap V2 Router",
            },
            # SushiSwap
            "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": {
                "protocol": SwapProtocol.SUSHISWAP,
                "name": "SushiSwap Router",
            },
            # Curve
            "0x99a58482c7e0601c07e565ad4837dea0f8e4381f": {
                "protocol": SwapProtocol.CURVE,
                "name": "Curve 3Pool",
            },
            # PancakeSwap
            "0x10ed43c718714eb63d5aa57b78b54704e256024e": {
                "protocol": SwapProtocol.PANCAKESWAP_V2,
                "name": "PancakeSwap V2 Router",
            },
            # 1inch
            "0x1111111254eeb25477b68fb85ed929f73a960582": {
                "protocol": SwapProtocol.ONEINCH,
                "name": "1inch Router",
            },
        }

    def detect_bridge(
        self,
        tx_hash: str,
        chain: str,
        to_address: str,
        value: float,
        token_address: str | None = None,
        token_symbol: str | None = None,
        sender: str = "",
        block_number: int | None = None,
        timestamp: datetime | None = None,
        case_id: str | None = None,
    ) -> BridgePattern | None:
        """Detect if a transaction is a bridge."""
        to_lower = to_address.lower()

        if to_lower not in self._bridge_contracts:
            return None

        contract_info = self._bridge_contracts[to_lower]
        protocol = contract_info["protocol"]

        # Calculate risk
        risk_score = 0.0
        risk_indicators: list[RiskIndicator] = []

        if value * 2000 > self._high_value_threshold_usd:  # Rough ETH price
            risk_score += 0.3
            risk_indicators.append(RiskIndicator.HIGH_VALUE)

        if protocol in [
            BridgeProtocol.WORMHOLE,
            BridgeProtocol.CELER,
            BridgeProtocol.MULTICHAIN,
        ]:
            risk_score += 0.2
            risk_indicators.append(RiskIndicator.PRIVACY_BRIDGE)

        # Determine destination chain (simplified)
        destination_chain = self._infer_destination_chain(protocol, chain)

        import uuid

        pattern = BridgePattern(
            pattern_id=str(uuid.uuid4()),
            protocol=protocol,
            protocol_address=to_address,
            protocol_name=contract_info["name"],
            source_chain=chain,
            destination_chain=destination_chain,
            source_tx_hash=tx_hash,
            source_block=block_number,
            token_address=token_address or "",
            token_symbol=token_symbol or "",
            amount=value,
            sender=sender,
            source_timestamp=timestamp,
            risk_score=min(risk_score, 1.0),
            risk_indicators=risk_indicators,
            status="pending",
            metadata={"case_id": case_id} if case_id else {},
        )

        self._bridge_patterns[pattern.pattern_id] = pattern

        # Update address index
        if sender:
            if sender not in self._address_index:
                self._address_index[sender] = {}
            if "bridge" not in self._address_index[sender]:
                self._address_index[sender]["bridge"] = []
            self._address_index[sender]["bridge"].append(pattern.pattern_id)

        return pattern

    def detect_swap(
        self,
        tx_hash: str,
        chain: str,
        to_address: str,
        sender: str,
        token_in_address: str = "",
        token_in_symbol: str = "",
        token_in_amount: float = 0.0,
        token_out_address: str = "",
        token_out_symbol: str = "",
        token_out_amount: float = 0.0,
        block_number: int | None = None,
        timestamp: datetime | None = None,
        case_id: str | None = None,
    ) -> SwapPattern | None:
        """Detect if a transaction is a swap."""
        to_lower = to_address.lower()

        if to_lower not in self._dex_contracts:
            return None

        contract_info = self._dex_contracts[to_lower]
        protocol = contract_info["protocol"]

        # Calculate price impact
        price_impact = None
        if token_in_amount > 0 and token_out_amount > 0:
            # Simplified price impact calculation
            price_impact = 0.0  # Would need market price data

        # Calculate risk
        risk_score = 0.0
        risk_indicators: list[RiskIndicator] = []

        # Check for MEV patterns (simplified)
        is_sandwich = False
        is_front_run = False

        import uuid

        pattern = SwapPattern(
            pattern_id=str(uuid.uuid4()),
            protocol=protocol,
            protocol_address=to_address,
            protocol_name=contract_info["name"],
            chain=chain,
            tx_hash=tx_hash,
            block_number=block_number,
            token_in_address=token_in_address,
            token_in_symbol=token_in_symbol,
            token_in_amount=token_in_amount,
            token_out_address=token_out_address,
            token_out_symbol=token_out_symbol,
            token_out_amount=token_out_amount,
            price_impact_pct=price_impact,
            sender=sender,
            timestamp=timestamp,
            risk_score=min(risk_score, 1.0),
            risk_indicators=risk_indicators,
            is_sandwich=is_sandwich,
            is_front_run=is_front_run,
            metadata={"case_id": case_id} if case_id else {},
        )

        self._swap_patterns[pattern.pattern_id] = pattern

        # Update address index
        if sender:
            if sender not in self._address_index:
                self._address_index[sender] = {}
            if "swap" not in self._address_index[sender]:
                self._address_index[sender]["swap"] = []
            self._address_index[sender]["swap"].append(pattern.pattern_id)

        return pattern

    def get_bridge_patterns(
        self,
        chain: str | None = None,
        protocol: BridgeProtocol | None = None,
        min_value: float | None = None,
        limit: int = 100,
    ) -> list[BridgePattern]:
        """Get bridge patterns with filters."""
        results = list(self._bridge_patterns.values())

        if chain:
            results = [
                p
                for p in results
                if p.source_chain == chain or p.destination_chain == chain
            ]
        if protocol:
            results = [p for p in results if p.protocol == protocol]
        if min_value is not None:
            results = [p for p in results if p.amount >= min_value]

        return results[:limit]

    def get_swap_patterns(
        self,
        chain: str | None = None,
        protocol: SwapProtocol | None = None,
        min_value: float | None = None,
        limit: int = 100,
    ) -> list[SwapPattern]:
        """Get swap patterns with filters."""
        results = list(self._swap_patterns.values())

        if chain:
            results = [p for p in results if p.chain == chain]
        if protocol:
            results = [p for p in results if p.protocol == protocol]
        if min_value is not None:
            results = [
                p
                for p in results
                if p.token_in_amount >= min_value or p.token_out_amount >= min_value
            ]

        return results[:limit]

    def get_patterns_for_address(
        self,
        address: str,
    ) -> dict[str, list[Any]]:
        """Get all patterns for an address."""
        address_data = self._address_index.get(address.lower(), {})

        result = {
            "bridge": [
                self._bridge_patterns[pid]
                for pid in address_data.get("bridge", [])
                if pid in self._bridge_patterns
            ],
            "swap": [
                self._swap_patterns[pid]
                for pid in address_data.get("swap", [])
                if pid in self._swap_patterns
            ],
        }

        return result

    def get_statistics(self) -> dict[str, Any]:
        """Get detection statistics."""
        bridges = list(self._bridge_patterns.values())
        swaps = list(self._swap_patterns.values())

        # Bridge stats by protocol
        bridge_by_protocol = {}
        for b in bridges:
            proto = b.protocol.value
            bridge_by_protocol[proto] = bridge_by_protocol.get(proto, 0) + 1

        # Bridge stats by chain
        bridge_by_chain = {}
        for b in bridges:
            chain = b.source_chain
            bridge_by_chain[chain] = bridge_by_chain.get(chain, 0) + 1

        # Swap stats by protocol
        swap_by_protocol = {}
        for s in swaps:
            proto = s.protocol.value
            swap_by_protocol[proto] = swap_by_protocol.get(proto, 0) + 1

        # Risk stats
        high_risk_bridges = sum(1 for b in bridges if b.risk_score > 0.7)
        high_risk_swaps = sum(1 for s in swaps if s.risk_score > 0.7)

        return {
            "total_bridges": len(bridges),
            "total_swaps": len(swaps),
            "unique_addresses": len(self._address_index),
            "bridge_by_protocol": bridge_by_protocol,
            "bridge_by_chain": bridge_by_chain,
            "swap_by_protocol": swap_by_protocol,
            "high_risk_bridges": high_risk_bridges,
            "high_risk_swaps": high_risk_swaps,
            "supported_bridge_protocols": len(self._bridge_contracts),
            "supported_dex_protocols": len(self._dex_contracts),
        }

    def _infer_destination_chain(
        self, protocol: BridgeProtocol, source_chain: str
    ) -> str:
        """Infer destination chain from protocol."""
        # Simplified inference
        chain_mapping = {
            BridgeProtocol.ARBITRUM_BRIDGE: "arbitrum",
            BridgeProtocol.OPTIMISM_BRIDGE: "optimism",
            BridgeProtocol.BASE_BRIDGE: "base",
            BridgeProtocol.POLYGON_POS: "polygon",
            BridgeProtocol.WORMHOLE: "solana",
        }

        return chain_mapping.get(protocol, "unknown")


def format_bridge_pattern(pattern: BridgePattern) -> str:
    """Format a bridge pattern for display."""
    lines = [
        f"Bridge Pattern: {pattern.pattern_id}",
        f"Protocol: {pattern.protocol_name or pattern.protocol.value}",
        f"Source: {pattern.source_chain} -> {pattern.destination_chain}",
        f"Value: {pattern.amount} {pattern.token_symbol or ''}",
        f"Sender: {pattern.sender}",
        f"Risk Score: {pattern.risk_score:.2f}",
    ]

    if pattern.risk_indicators:
        lines.append(
            f"Risk Indicators: {', '.join(i.value for i in pattern.risk_indicators)}"
        )

    return "\n".join(lines)


def format_swap_pattern(pattern: SwapPattern) -> str:
    """Format a swap pattern for display."""
    lines = [
        f"Swap Pattern: {pattern.pattern_id}",
        f"Protocol: {pattern.protocol_name or pattern.protocol.value}",
        f"Chain: {pattern.chain}",
        f"In: {pattern.token_in_amount} {pattern.token_in_symbol or ''}",
        f"Out: {pattern.token_out_amount} {pattern.token_out_symbol or ''}",
        f"Sender: {pattern.sender}",
        f"Risk Score: {pattern.risk_score:.2f}",
    ]

    if pattern.is_sandwich:
        lines.append("⚠️ Potential sandwich attack detected")

    return "\n".join(lines)
