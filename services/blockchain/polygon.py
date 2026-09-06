"""Polygon chain adapter implementation.

Provides integration with Polygon PoS via Web3.py.
"""

from __future__ import annotations

from datetime import datetime, UTC
from typing import Any

from web3 import Web3

from .base import (
    AddressType,
    ChainAdapter,
    ChainHealth,
    ChainType,
    NormalizedTransaction,
    TransactionType,
)


class PolygonAdapter(ChainAdapter):
    """Polygon PoS blockchain adapter."""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._chain_type = ChainType.POLYGON

        # Configuration
        self.rpc_url = config.get("rpc_url", "https://polygon-rpc.com/")
        self.api_key = config.get("polygonscan_api_key")
        self.timeout = config.get("timeout", 30)

        # Web3 instance
        self.w3: Web3 | None = None

        # Known contract addresses (Polygon)
        self._known_contracts: dict[str, str] = {
            "0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "usdt",
            "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": "usdc",
            "0x1bfd67037b42cef7ac72eb3b744d0f06eba6a230": "wbtc",
            "0xd6df932a45c0f255f85145f286ea0b292b21c90b": "aave",
        }

        # QuickSwap Router (Uniswap fork on Polygon)
        self._quickswap_router = "0xa5e0829cacdedbbff799dcdde387d9dff14b30af"

    async def connect(self) -> bool:
        """Connect to Polygon node."""
        try:
            self.w3 = Web3(
                Web3.HTTPProvider(
                    self.rpc_url, request_kwargs={"timeout": self.timeout}
                )
            )

            if not self.w3.is_connected():
                raise ConnectionError("Failed to connect to Polygon node")

            chain_id = self.w3.eth.chain_id
            print(f"Connected to Polygon (Chain ID: {chain_id})")

            return True

        except Exception as e:
            print(f"Failed to connect to Polygon: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from Polygon node."""
        self.w3 = None

    async def get_chain_health(self) -> ChainHealth:
        """Get Polygon chain health status."""
        try:
            if not self.w3:
                await self.connect()

            block_number = await self.get_block_number()
            block = await self.get_block_by_number(block_number)
            block_timestamp = datetime.fromtimestamp(block["timestamp"], tz=UTC)

            now = datetime.now(UTC)
            lag_seconds = int((now - block_timestamp).total_seconds())

            # Polygon blocks ~2 seconds
            if lag_seconds < 20:
                sync_status = "synced"
            elif lag_seconds < 120:
                sync_status = "syncing"
            else:
                sync_status = "stale"

            return ChainHealth(
                chain=ChainType.POLYGON,
                is_healthy=lag_seconds < 120,
                block_height=block_number,
                block_timestamp=block_timestamp,
                sync_status=sync_status,
                lag_seconds=lag_seconds,
            )

        except Exception as e:
            return ChainHealth(
                chain=ChainType.POLYGON,
                is_healthy=False,
                block_height=0,
                block_timestamp=datetime.now(UTC),
                sync_status="error",
                lag_seconds=-1,
                error_message=str(e),
            )

    async def get_transaction(self, tx_hash: str) -> NormalizedTransaction | None:
        """Get a single transaction by hash."""
        try:
            if not self.w3:
                await self.connect()

            # Get transaction
            tx = self.w3.eth.get_transaction(tx_hash)
            if not tx:
                return None

            # Get receipt
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)

            # Get block timestamp
            block = self.w3.eth.get_block(tx["blockNumber"])

            # Classify addresses
            from_type = await self._classify_address(tx["from"])
            to_type = AddressType.UNKNOWN
            if tx.get("to"):
                to_type = await self._classify_address(tx["to"])

            # Calculate values
            value_matic = float(Web3.from_wei(tx["value"], "ether"))
            gas_used = receipt.get("gasUsed", 0)
            gas_price = tx.get("gasPrice", 0)
            fee_matic = float(Web3.from_wei(gas_used * gas_price, "ether"))

            # Check method ID
            method_id = None
            input_data = tx.get("input", "0x")
            if input_data and input_data != "0x" and len(input_data) >= 10:
                method_id = input_data[:10]

            # Determine transaction type
            tx_type = self._determine_tx_type(tx, receipt)

            return NormalizedTransaction(
                tx_hash=tx_hash,
                chain=ChainType.POLYGON,
                block_number=tx["blockNumber"],
                block_timestamp=datetime.fromtimestamp(block["timestamp"], tz=UTC),
                from_address=tx["from"].lower(),
                from_address_type=from_type,
                to_address=tx.get("to", "").lower() if tx.get("to") else "",
                to_address_type=to_type,
                value=value_matic,
                currency="MATIC",
                gas_price=float(Web3.from_wei(gas_price, "gwei")),
                gas_used=gas_used,
                fee=fee_matic,
                transaction_type=tx_type,
                is_success=receipt.get("status", 1) == 1,
                method_id=method_id,
            )

        except Exception as e:
            print(f"Error getting Polygon transaction {tx_hash}: {e}")
            return None

    async def get_transactions_by_address(
        self,
        address: str,
        start_block: int = 0,
        end_block: int = -1,
        limit: int = 100,
    ) -> list[NormalizedTransaction]:
        """Get transactions for a specific address."""
        transactions = []

        try:
            if not self.w3:
                await self.connect()

            address = Web3.to_checksum_address(address)

            if end_block == -1:
                end_block = await self.get_block_number()

            # Simplified - in production use Polygonscan API
            print(f"Getting Polygon transactions for {address}")

            return transactions

        except Exception as e:
            print(f"Error getting Polygon transactions: {e}")
            return transactions

    async def get_transactions_by_block(
        self,
        block_number: int,
    ) -> list[NormalizedTransaction]:
        """Get all transactions in a block."""
        transactions = []

        try:
            if not self.w3:
                await self.connect()

            block = self.w3.eth.get_block(block_number, full_transactions=True)

            for tx in block["transactions"]:
                receipt = self.w3.eth.get_transaction_receipt(tx["hash"].hex())

                from_type = await self._classify_address(tx["from"])
                to_type = AddressType.UNKNOWN
                if tx.get("to"):
                    to_type = await self._classify_address(tx["to"])

                value_matic = float(Web3.from_wei(tx["value"], "ether"))
                gas_used = receipt.get("gasUsed", 0)
                gas_price = tx.get("gasPrice", 0)
                fee_matic = float(Web3.from_wei(gas_used * gas_price, "ether"))

                transactions.append(
                    NormalizedTransaction(
                        tx_hash=tx["hash"].hex(),
                        chain=ChainType.POLYGON,
                        block_number=block_number,
                        block_timestamp=datetime.fromtimestamp(
                            block["timestamp"], tz=UTC
                        ),
                        from_address=tx["from"].lower(),
                        from_address_type=from_type,
                        to_address=tx.get("to", "").lower() if tx.get("to") else "",
                        to_address_type=to_type,
                        value=value_matic,
                        currency="MATIC",
                        gas_price=float(Web3.from_wei(gas_price, "gwei")),
                        gas_used=gas_used,
                        fee=fee_matic,
                        transaction_type=self._determine_tx_type(tx, receipt),
                        is_success=receipt.get("status", 1) == 1,
                    )
                )

            return transactions

        except Exception as e:
            print(f"Error getting Polygon block: {e}")
            return transactions

    async def get_address_info(self, address: str) -> dict[str, Any]:
        """Get information about an address."""
        try:
            if not self.w3:
                await self.connect()

            address = Web3.to_checksum_address(address)

            balance_wei = self.w3.eth.get_balance(address)
            balance_matic = float(Web3.from_wei(balance_wei, "ether"))

            code = self.w3.eth.get_code(address)
            is_contract = len(code) > 0

            nonce = self.w3.eth.get_transaction_count(address)

            return {
                "address": address.lower(),
                "balance": balance_matic,
                "balance_wei": balance_wei,
                "is_contract": is_contract,
                "nonce": nonce,
                "chain": ChainType.POLYGON.value,
            }

        except Exception as e:
            print(f"Error getting Polygon address info: {e}")
            return {
                "address": address.lower(),
                "balance": 0,
                "is_contract": False,
                "chain": ChainType.POLYGON.value,
                "error": str(e),
            }

    async def get_token_transfers(
        self,
        token_address: str,
        from_address: str | None = None,
        to_address: str | None = None,
        start_block: int = 0,
        limit: int = 100,
    ) -> list[NormalizedTransaction]:
        """Get ERC20/POL20 token transfers."""
        return []

    async def trace_transaction(self, tx_hash: str) -> list[dict[str, Any]]:
        """Trace internal transactions."""
        return []

    async def get_block_number(self) -> int:
        """Get the latest block number."""
        if not self.w3:
            await self.connect()
        return self.w3.eth.block_number

    async def get_block_by_number(self, block_number: int) -> dict[str, Any]:
        """Get block details by number."""
        if not self.w3:
            await self.connect()

        block = self.w3.eth.get_block(block_number)
        return {
            "number": block["number"],
            "hash": block["hash"].hex(),
            "timestamp": block["timestamp"],
            "transactions": len(block["transactions"]),
            "gas_used": block["gasUsed"],
            "gas_limit": block["gasLimit"],
            "base_fee_per_gas": block.get("baseFeePerGas"),
        }

    async def _classify_address(self, address: str) -> AddressType:
        """Classify a Polygon address."""
        address = address.lower()

        if address in self._known_contracts:
            return AddressType.CONTRACT

        if address == self._quickswap_router:
            return AddressType.CONTRACT

        try:
            info = await self.get_address_info(address)
            if info.get("is_contract"):
                return AddressType.CONTRACT
        except Exception:
            pass

        return AddressType.EOA

    def _determine_tx_type(self, tx: dict, receipt: dict) -> TransactionType:
        """Determine transaction type."""
        input_data = tx.get("input", "0x")

        if input_data == "0x" or len(input_data) < 10:
            return TransactionType.TRANSFER

        method_id = input_data[:10]

        # ERC20 transfer
        if method_id == "0xa9059cbb":
            return TransactionType.TRANSFER

        # QuickSwap swap methods
        quickswap_methods = [
            "0x38ed1739",  # swapExactTokensForTokens
            "0x8803dbee",  # swapTokensForExactTokens
            "0x7ff36ab5",  # swapExactETHForTokens
            "0x18cbafe5",  # swapExactTokensForETH
        ]
        if method_id in quickswap_methods:
            return TransactionType.SWAP

        return TransactionType.CONTRACT_INTERACTION
