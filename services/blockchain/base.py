"""Base chain adapter interface for all blockchain integrations.

Defines the common interface that all chain adapters must implement.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ChainType(StrEnum):
    """Supported blockchain types."""

    ETHEREUM = "ethereum"
    BITCOIN = "bitcoin"
    TRON = "tron"
    BNB = "bnb"
    SOLANA = "solana"
    POLYGON = "polygon"


class TransactionType(StrEnum):
    """Normalized transaction types."""

    TRANSFER = "transfer"
    SWAP = "swap"
    BRIDGE = "bridge"
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    CONTRACT_INTERACTION = "contract_interaction"
    UNKNOWN = "unknown"


class AddressType(StrEnum):
    """Address classification types."""

    EOA = "eoa"  # Externally Owned Account
    CONTRACT = "contract"
    EXCHANGE = "exchange"
    MIXER = "mixer"
    UNKNOWN = "unknown"


class NormalizedTransaction(BaseModel):
    """Normalized transaction format across all chains."""

    # Unique identifiers
    tx_hash: str
    chain: ChainType
    block_number: int
    block_timestamp: datetime

    # Addresses
    from_address: str
    from_address_type: AddressType = AddressType.UNKNOWN
    to_address: str
    to_address_type: AddressType = AddressType.UNKNOWN

    # Value
    value: float
    currency: str
    value_usd: float | None = None

    # Gas/Fees
    gas_price: float | None = None
    gas_used: int | None = None
    fee: float | None = None

    # Transaction metadata
    transaction_type: TransactionType = TransactionType.TRANSFER
    is_success: bool = True
    error_message: str | None = None

    # Token transfers (if applicable)
    token_address: str | None = None
    token_symbol: str | None = None
    token_decimals: int | None = None

    # Additional metadata
    method_id: str | None = None  # Contract method called
    input_data: str | None = None

    # Risk indicators
    is_suspicious: bool = False
    risk_score: float | None = None

    class Config:
        use_enum_values = True


class ChainHealth(BaseModel):
    """Chain health status."""

    chain: ChainType
    is_healthy: bool
    block_height: int
    block_timestamp: datetime
    sync_status: str  # "synced", "syncing", "stale"
    lag_seconds: int  # Seconds behind latest block
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    error_message: str | None = None


class ChainAdapter(ABC):
    """Abstract base class for chain adapters."""

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self._chain_type: ChainType

    @property
    def chain_type(self) -> ChainType:
        """Get the chain type."""
        return self._chain_type

    @abstractmethod
    async def connect(self) -> bool:
        """Connect to the blockchain node/API."""

    @abstractmethod
    async def disconnect(self) -> None:
        """Disconnect from the blockchain."""

    @abstractmethod
    async def get_chain_health(self) -> ChainHealth:
        """Get current chain health status."""

    @abstractmethod
    async def get_transaction(self, tx_hash: str) -> NormalizedTransaction | None:
        """Get a single transaction by hash."""

    @abstractmethod
    async def get_transactions_by_address(
        self,
        address: str,
        start_block: int = 0,
        end_block: int = -1,
        limit: int = 100,
    ) -> list[NormalizedTransaction]:
        """Get transactions for a specific address."""

    @abstractmethod
    async def get_transactions_by_block(
        self,
        block_number: int,
    ) -> list[NormalizedTransaction]:
        """Get all transactions in a block."""

    @abstractmethod
    async def get_address_info(self, address: str) -> dict[str, Any]:
        """Get information about an address (balance, type, etc.)."""

    @abstractmethod
    async def get_token_transfers(
        self,
        token_address: str,
        from_address: str | None = None,
        to_address: str | None = None,
        start_block: int = 0,
        limit: int = 100,
    ) -> list[NormalizedTransaction]:
        """Get token transfers for a specific token."""

    @abstractmethod
    async def trace_transaction(self, tx_hash: str) -> list[dict[str, Any]]:
        """Trace internal transactions (for debugging/analysis)."""

    @abstractmethod
    async def get_block_number(self) -> int:
        """Get the latest block number."""

    @abstractmethod
    async def get_block_by_number(self, block_number: int) -> dict[str, Any]:
        """Get block details by number."""

    async def normalize_address(self, address: str) -> str:
        """Normalize address format (e.g., checksum for Ethereum)."""
        return address.lower()

    async def is_contract(self, address: str) -> bool:
        """Check if an address is a contract."""
        info = await self.get_address_info(address)
        return info.get("is_contract", False)

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(chain={self._chain_type})>"
