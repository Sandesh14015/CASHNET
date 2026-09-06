"""Ethereum chain adapter implementation.

Provides integration with Ethereum blockchain via Web3.py and public APIs.
"""

from __future__ import annotations

from datetime import datetime, UTC
from typing import Any

from web3 import Web3

try:
    from web3.middleware import geth_poa_middleware
except ImportError:
    geth_poa_middleware = None

from .base import (
    AddressType,
    ChainAdapter,
    ChainHealth,
    ChainType,
    NormalizedTransaction,
    TransactionType,
)
import contextlib


class EthereumAdapter(ChainAdapter):
    """Ethereum blockchain adapter."""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._chain_type = ChainType.ETHEREUM

        # Configuration
        self.rpc_url = config.get("rpc_url", "https://eth.llamarpc.com")
        self.api_key = config.get("api_key")
        self.max_retries = config.get("max_retries", 3)
        self.timeout = config.get("timeout", 30)

        # Web3 instance
        self.w3: Web3 | None = None

        # Known contract addresses (for address classification)
        self._known_contracts: dict[str, str] = {}

        # ERC20 token decimals cache
        self._token_decimals: dict[str, int] = {}

    async def connect(self) -> bool:
        """Connect to Ethereum node."""
        try:
            self.w3 = Web3(
                Web3.HTTPProvider(
                    self.rpc_url, request_kwargs={"timeout": self.timeout}
                )
            )

            # Add PoA middleware for some providers
            with contextlib.suppress(Exception):
                self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)

            # Check connection
            if not self.w3.is_connected():
                raise ConnectionError("Failed to connect to Ethereum node")

            # Get chain ID
            chain_id = self.w3.eth.chain_id
            print(f"Connected to Ethereum (Chain ID: {chain_id})")

            return True

        except Exception as e:
            print(f"Failed to connect to Ethereum: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from Ethereum node."""
        self.w3 = None

    async def get_chain_health(self) -> ChainHealth:
        """Get Ethereum chain health status."""
        try:
            if not self.w3:
                await self.connect()

            block_number = await self.get_block_number()
            block = await self.get_block_by_number(block_number)
            block_timestamp = datetime.fromtimestamp(block["timestamp"], tz=UTC)

            # Calculate lag
            now = datetime.now(UTC)
            lag_seconds = int((now - block_timestamp).total_seconds())

            # Determine sync status
            if lag_seconds < 300:  # 5 minutes
                sync_status = "synced"
            elif lag_seconds < 3600:  # 1 hour
                sync_status = "syncing"
            else:
                sync_status = "stale"

            return ChainHealth(
                chain=ChainType.ETHEREUM,
                is_healthy=lag_seconds < 3600,
                block_height=block_number,
                block_timestamp=block_timestamp,
                sync_status=sync_status,
                lag_seconds=lag_seconds,
            )

        except Exception as e:
            return ChainHealth(
                chain=ChainType.ETHEREUM,
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

            # Get receipt for status and gas
            receipt = self.w3.eth.get_transaction_receipt(tx_hash)

            # Get block timestamp
            block = self.w3.eth.get_block(tx["blockNumber"])

            # Check if sender/recipient are contracts
            from_type = await self._classify_address(tx["from"])
            to_type = AddressType.UNKNOWN
            if tx.get("to"):
                to_type = await self._classify_address(tx["to"])

            # Determine transaction type
            tx_type = self._determine_tx_type(tx, receipt)

            # Calculate value in ETH
            value_eth = float(Web3.from_wei(tx["value"], "ether"))

            # Calculate fee
            gas_used = receipt.get("gasUsed", 0)
            gas_price = tx.get("gasPrice", 0)
            fee_eth = float(Web3.from_wei(gas_used * gas_price, "ether"))

            # Check if contract interaction
            method_id = None
            input_data = tx.get("input", "0x")
            if input_data and input_data != "0x" and len(input_data) >= 10:
                method_id = input_data[:10]

            return NormalizedTransaction(
                tx_hash=tx_hash,
                chain=ChainType.ETHEREUM,
                block_number=tx["blockNumber"],
                block_timestamp=datetime.fromtimestamp(block["timestamp"], tz=UTC),
                from_address=tx["from"].lower(),
                from_address_type=from_type,
                to_address=tx.get("to", "").lower() if tx.get("to") else "",
                to_address_type=to_type,
                value=value_eth,
                currency="ETH",
                gas_price=float(Web3.from_wei(gas_price, "gwei")),
                gas_used=gas_used,
                fee=fee_eth,
                transaction_type=tx_type,
                is_success=receipt.get("status", 1) == 1,
                error_message=(
                    None if receipt.get("status", 1) == 1 else "Transaction reverted"
                ),
                method_id=method_id,
                input_data=input_data if input_data != "0x" else None,
            )

        except Exception as e:
            print(f"Error getting transaction {tx_hash}: {e}")
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

            # Note: This is a simplified implementation
            # In production, use Etherscan API or archive node
            # For now, we'll use the trace API if available

            address = Web3.to_checksum_address(address)

            # Get latest block if end_block not specified
            if end_block == -1:
                end_block = await self.get_block_number()

            # Limit the range to avoid excessive API calls
            block_range = min(end_block - start_block, 1000)

            # This is a placeholder - in production, use proper indexing
            # Etherscan API, The Graph, or archive node
            print(
                f"Getting transactions for {address} (blocks {start_block}-{start_block + block_range})"
            )

            return transactions

        except Exception as e:
            print(f"Error getting transactions for {address}: {e}")
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
                # Get receipt
                receipt = self.w3.eth.get_transaction_receipt(tx["hash"].hex())

                # Classify addresses
                from_type = await self._classify_address(tx["from"])
                to_type = AddressType.UNKNOWN
                if tx.get("to"):
                    to_type = await self._classify_address(tx["to"])

                # Calculate values
                value_eth = float(Web3.from_wei(tx["value"], "ether"))
                gas_used = receipt.get("gasUsed", 0)
                gas_price = tx.get("gasPrice", 0)
                fee_eth = float(Web3.from_wei(gas_used * gas_price, "ether"))

                transactions.append(
                    NormalizedTransaction(
                        tx_hash=tx["hash"].hex(),
                        chain=ChainType.ETHEREUM,
                        block_number=block_number,
                        block_timestamp=datetime.fromtimestamp(
                            block["timestamp"], tz=UTC
                        ),
                        from_address=tx["from"].lower(),
                        from_address_type=from_type,
                        to_address=tx.get("to", "").lower() if tx.get("to") else "",
                        to_address_type=to_type,
                        value=value_eth,
                        currency="ETH",
                        gas_price=float(Web3.from_wei(gas_price, "gwei")),
                        gas_used=gas_used,
                        fee=fee_eth,
                        transaction_type=self._determine_tx_type(tx, receipt),
                        is_success=receipt.get("status", 1) == 1,
                    )
                )

            return transactions

        except Exception as e:
            print(f"Error getting block {block_number}: {e}")
            return transactions

    async def get_address_info(self, address: str) -> dict[str, Any]:
        """Get information about an address."""
        try:
            if not self.w3:
                await self.connect()

            address = Web3.to_checksum_address(address)

            # Get balance
            balance_wei = self.w3.eth.get_balance(address)
            balance_eth = float(Web3.from_wei(balance_wei, "ether"))

            # Check if contract
            code = self.w3.eth.get_code(address)
            is_contract = len(code) > 0

            # Get transaction count (nonce)
            nonce = self.w3.eth.get_transaction_count(address)

            return {
                "address": address.lower(),
                "balance": balance_eth,
                "balance_wei": balance_wei,
                "is_contract": is_contract,
                "nonce": nonce,
                "chain": ChainType.ETHEREUM.value,
            }

        except Exception as e:
            print(f"Error getting address info for {address}: {e}")
            return {
                "address": address.lower(),
                "balance": 0,
                "is_contract": False,
                "nonce": 0,
                "chain": ChainType.ETHEREUM.value,
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
        """Get ERC20 token transfers."""
        transfers = []

        try:
            if not self.w3:
                await self.connect()

            # Transfer event signature
            transfer_topic = Web3.keccak(text="Transfer(address,address,uint256)")

            # Build filter
            filter_args = {
                "fromBlock": start_block,
                "toBlock": "latest",
                "address": Web3.to_checksum_address(token_address),
                "topics": [transfer_topic.hex()],
            }

            if from_address:
                filter_args["topics"].append(
                    Web3.keccak(text="Transfer(address,address,uint256)")
                )
                # Pad address to 32 bytes
                padded_from = "0x" + from_address.lower()[2:].zfill(64)
                filter_args["topics"][1] = padded_from

            # Get logs
            logs = self.w3.eth.get_logs(filter_args)

            # Get token decimals
            decimals = await self._get_token_decimals(token_address)

            for log in logs[:limit]:
                try:
                    # Parse transfer event
                    from_addr = "0x" + log["topics"][1].hex()[-40:]
                    to_addr = "0x" + log["topics"][2].hex()[-40:]
                    value = int(log["data"].hex(), 16)
                    value_normalized = value / (10**decimals)

                    # Get transaction details
                    _ = self.w3.eth.get_transaction(log["transactionHash"].hex())
                    receipt = self.w3.eth.get_transaction_receipt(
                        log["transactionHash"].hex()
                    )
                    block = self.w3.eth.get_block(log["blockNumber"])

                    transfers.append(
                        NormalizedTransaction(
                            tx_hash=log["transactionHash"].hex(),
                            chain=ChainType.ETHEREUM,
                            block_number=log["blockNumber"],
                            block_timestamp=datetime.fromtimestamp(
                                block["timestamp"], tz=UTC
                            ),
                            from_address=from_addr.lower(),
                            from_address_type=await self._classify_address(from_addr),
                            to_address=to_addr.lower(),
                            to_address_type=await self._classify_address(to_addr),
                            value=value_normalized,
                            currency="TOKEN",
                            transaction_type=TransactionType.TRANSFER,
                            is_success=receipt.get("status", 1) == 1,
                            token_address=token_address.lower(),
                            token_decimals=decimals,
                        )
                    )

                except Exception as e:
                    print(f"Error parsing transfer log: {e}")
                    continue

            return transfers

        except Exception as e:
            print(f"Error getting token transfers: {e}")
            return transfers

    async def trace_transaction(self, tx_hash: str) -> list[dict[str, Any]]:
        """Trace internal transactions."""
        # Note: Requires archive node with trace API
        # This is a placeholder implementation
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
        """Classify an address type."""
        address = address.lower()

        # Check known contracts
        if address in self._known_contracts:
            contract_type = self._known_contracts[address]
            if contract_type == "exchange":
                return AddressType.EXCHANGE
            elif contract_type == "mixer":
                return AddressType.MIXER

        # Check if contract
        try:
            info = await self.get_address_info(address)
            if info.get("is_contract"):
                return AddressType.CONTRACT
        except Exception:
            pass

        return AddressType.EOA

    def _determine_tx_type(self, tx: dict, receipt: dict) -> TransactionType:
        """Determine transaction type based on input data."""
        input_data = tx.get("input", "0x")

        if input_data == "0x" or len(input_data) < 10:
            return TransactionType.TRANSFER

        # Common function signatures
        method_id = input_data[:10]

        # ERC20 transfer
        if method_id == "0xa9059cbb":
            return TransactionType.TRANSFER

        # Uniswap swap
        uniswap_methods = [
            "0x38ed1739",  # swapExactTokensForTokens
            "0x8803dbee",  # swapTokensForExactTokens
            "0x7ff36ab5",  # swapExactETHForTokens
            "0x18cbafe5",  # swapExactTokensForETH
        ]
        if method_id in uniswap_methods:
            return TransactionType.SWAP

        # Contract interaction (default for non-transfer)
        return TransactionType.CONTRACT_INTERACTION

    async def _get_token_decimals(self, token_address: str) -> int:
        """Get token decimals (cached)."""
        token_address = token_address.lower()

        if token_address in self._token_decimals:
            return self._token_decimals[token_address]

        try:
            # ERC20 decimals() function signature
            decimals_signature = "0x313ce567"

            result = self.w3.eth.call(
                {
                    "to": Web3.to_checksum_address(token_address),
                    "data": decimals_signature,
                }
            )

            decimals = int(result.hex(), 16)
            self._token_decimals[token_address] = decimals

            return decimals

        except Exception:
            # Default to 18 decimals
            return 18
