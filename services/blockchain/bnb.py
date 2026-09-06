"""BNB Chain adapter implementation.

Provides integration with BNB Smart Chain via BscScan API.
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


class BNBAdapter(ChainAdapter):
    """BNB Smart Chain adapter."""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._chain_type = ChainType.BNB

        # Configuration
        self.rpc_url = config.get("rpc_url", "https://bsc-dataseed.binance.org/")
        self.api_key = config.get("bscscan_api_key")
        self.timeout = config.get("timeout", 30)

        # Web3 instance
        self.w3: Web3 | None = None

        # Known contract addresses (BSC)
        self._known_contracts: dict[str, str] = {
            "0x55d398326f99059ff775485246999027b3197955": "usdt",
            "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "usdc",
            "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "wbtc",
            "0xe9e7cea3dedca5984780bafc599bd69add087d56": "busd",
        }

        # PancakeSwap Router
        self._pancake_router = "0x10ed43c718714eb63d5aa57b78b54704e256024e"

    async def connect(self) -> bool:
        """Connect to BNB Smart Chain node."""
        try:
            self.w3 = Web3(
                Web3.HTTPProvider(
                    self.rpc_url, request_kwargs={"timeout": self.timeout}
                )
            )

            # Check connection
            if not self.w3.is_connected():
                raise ConnectionError("Failed to connect to BNB node")

            chain_id = self.w3.eth.chain_id
            print(f"Connected to BNB Smart Chain (Chain ID: {chain_id})")

            return True

        except Exception as e:
            print(f"Failed to connect to BNB: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from BNB node."""
        self.w3 = None

    async def get_chain_health(self) -> ChainHealth:
        """Get BNB chain health status."""
        try:
            if not self.w3:
                await self.connect()

            block_number = await self.get_block_number()
            block = await self.get_block_by_number(block_number)
            block_timestamp = datetime.fromtimestamp(block["timestamp"], tz=UTC)

            now = datetime.now(UTC)
            lag_seconds = int((now - block_timestamp).total_seconds())

            # BSC blocks ~3 seconds
            if lag_seconds < 30:
                sync_status = "synced"
            elif lag_seconds < 300:
                sync_status = "syncing"
            else:
                sync_status = "stale"

            return ChainHealth(
                chain=ChainType.BNB,
                is_healthy=lag_seconds < 300,
                block_height=block_number,
                block_timestamp=block_timestamp,
                sync_status=sync_status,
                lag_seconds=lag_seconds,
            )

        except Exception as e:
            return ChainHealth(
                chain=ChainType.BNB,
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
            value_bnb = float(Web3.from_wei(tx["value"], "ether"))
            gas_used = receipt.get("gasUsed", 0)
            gas_price = tx.get("gasPrice", 0)
            fee_bnb = float(Web3.from_wei(gas_used * gas_price, "ether"))

            # Check method ID
            method_id = None
            input_data = tx.get("input", "0x")
            if input_data and input_data != "0x" and len(input_data) >= 10:
                method_id = input_data[:10]

            # Determine transaction type
            tx_type = self._determine_tx_type(tx, receipt)

            return NormalizedTransaction(
                tx_hash=tx_hash,
                chain=ChainType.BNB,
                block_number=tx["blockNumber"],
                block_timestamp=datetime.fromtimestamp(block["timestamp"], tz=UTC),
                from_address=tx["from"].lower(),
                from_address_type=from_type,
                to_address=tx.get("to", "").lower() if tx.get("to") else "",
                to_address_type=to_type,
                value=value_bnb,
                currency="BNB",
                gas_price=float(Web3.from_wei(gas_price, "gwei")),
                gas_used=gas_used,
                fee=fee_bnb,
                transaction_type=tx_type,
                is_success=receipt.get("status", 1) == 1,
                method_id=method_id,
            )

        except Exception as e:
            print(f"Error getting BNB transaction {tx_hash}: {e}")
            return None

    async def get_transactions_by_address(
        self,
        address: str,
        start_block: int = 0,
        end_block: int = -1,
        limit: int = 100,
    ) -> list[NormalizedTransaction]:
        """Get transactions for a specific address."""
        # Similar to Ethereum implementation
        transactions = []

        try:
            if not self.w3:
                await self.connect()

            address = Web3.to_checksum_address(address)

            # Get latest block if not specified
            if end_block == -1:
                end_block = await self.get_block_number()

            # This is a simplified version - in production use BscScan API
            print(f"Getting BNB transactions for {address}")

            return transactions

        except Exception as e:
            print(f"Error getting BNB transactions: {e}")
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

                value_bnb = float(Web3.from_wei(tx["value"], "ether"))
                gas_used = receipt.get("gasUsed", 0)
                gas_price = tx.get("gasPrice", 0)
                fee_bnb = float(Web3.from_wei(gas_used * gas_price, "ether"))

                transactions.append(
                    NormalizedTransaction(
                        tx_hash=tx["hash"].hex(),
                        chain=ChainType.BNB,
                        block_number=block_number,
                        block_timestamp=datetime.fromtimestamp(
                            block["timestamp"], tz=UTC
                        ),
                        from_address=tx["from"].lower(),
                        from_address_type=from_type,
                        to_address=tx.get("to", "").lower() if tx.get("to") else "",
                        to_address_type=to_type,
                        value=value_bnb,
                        currency="BNB",
                        gas_price=float(Web3.from_wei(gas_price, "gwei")),
                        gas_used=gas_used,
                        fee=fee_bnb,
                        transaction_type=self._determine_tx_type(tx, receipt),
                        is_success=receipt.get("status", 1) == 1,
                    )
                )

            return transactions

        except Exception as e:
            print(f"Error getting BNB block {block_number}: {e}")
            return transactions

    async def get_address_info(self, address: str) -> dict[str, Any]:
        """Get information about an address."""
        try:
            if not self.w3:
                await self.connect()

            address = Web3.to_checksum_address(address)

            balance_wei = self.w3.eth.get_balance(address)
            balance_bnb = float(Web3.from_wei(balance_wei, "ether"))

            code = self.w3.eth.get_code(address)
            is_contract = len(code) > 0

            nonce = self.w3.eth.get_transaction_count(address)

            return {
                "address": address.lower(),
                "balance": balance_bnb,
                "balance_wei": balance_wei,
                "is_contract": is_contract,
                "nonce": nonce,
                "chain": ChainType.BNB.value,
            }

        except Exception as e:
            print(f"Error getting BNB address info: {e}")
            return {
                "address": address.lower(),
                "balance": 0,
                "is_contract": False,
                "chain": ChainType.BNB.value,
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
        """Get BEP20 token transfers."""
        # Similar to Ethereum ERC20 implementation
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
        }

    async def _classify_address(self, address: str) -> AddressType:
        """Classify a BNB address."""
        address = address.lower()

        if address in self._known_contracts:
            return AddressType.CONTRACT

        # Check PancakeSwap
        if address == self._pancake_router:
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

        # BEP20 transfer
        if method_id == "0xa9059cbb":
            return TransactionType.TRANSFER

        # PancakeSwap swap methods
        pancake_methods = [
            "0x38ed1739",  # swapExactTokensForTokens
            "0x8803dbee",  # swapTokensForExactTokens
            "0x7ff36ab5",  # swapExactETHForTokens
            "0x18cbafe5",  # swapExactTokensForETH
        ]
        if method_id in pancake_methods:
            return TransactionType.SWAP

        return TransactionType.CONTRACT_INTERACTION
