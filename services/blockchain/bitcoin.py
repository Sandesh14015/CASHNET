"""Bitcoin chain adapter implementation.

Provides integration with Bitcoin blockchain via Blockstream API.
"""

from __future__ import annotations

from datetime import datetime, UTC
from typing import Any

import httpx

from .base import (
    AddressType,
    ChainAdapter,
    ChainHealth,
    ChainType,
    NormalizedTransaction,
    TransactionType,
)


class BitcoinAdapter(ChainAdapter):
    """Bitcoin blockchain adapter using Blockstream API."""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._chain_type = ChainType.BITCOIN

        # Configuration
        self.api_url = config.get("api_url", "https://blockstream.info/api")
        self.timeout = config.get("timeout", 30)

        # HTTP client
        self._client: httpx.AsyncClient | None = None

        # Known address labels
        self._known_addresses: dict[str, str] = {}

    async def connect(self) -> bool:
        """Connect to Blockstream API."""
        try:
            self._client = httpx.AsyncClient(
                base_url=self.api_url,
                timeout=self.timeout,
                headers={"Accept": "application/json"},
            )

            # Test connection
            response = await self._client.get("/blocks/tip/height")
            if response.status_code == 200:
                block_height = response.json()
                print(f"Connected to Bitcoin (Block height: {block_height})")
                return True

            return False

        except Exception as e:
            print(f"Failed to connect to Bitcoin API: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from API."""
        if self._client:
            await self._client.aclose()

    async def get_chain_health(self) -> ChainHealth:
        """Get Bitcoin chain health status."""
        try:
            if not self._client:
                await self.connect()

            # Get latest block height
            block_height = await self.get_block_number()

            # Get block info
            block_info = await self._client.get(f"/blocks/{block_height}")
            block_data = block_info.json()

            block_timestamp = datetime.fromtimestamp(
                block_data.get("timestamp", 0), tz=UTC
            )

            # Calculate lag
            now = datetime.now(UTC)
            lag_seconds = int((now - block_timestamp).total_seconds())

            # Determine sync status (Bitcoin blocks ~10 min)
            if lag_seconds < 1200:  # 20 minutes
                sync_status = "synced"
            elif lag_seconds < 7200:  # 2 hours
                sync_status = "syncing"
            else:
                sync_status = "stale"

            return ChainHealth(
                chain=ChainType.BITCOIN,
                is_healthy=lag_seconds < 7200,
                block_height=block_height,
                block_timestamp=block_timestamp,
                sync_status=sync_status,
                lag_seconds=lag_seconds,
            )

        except Exception as e:
            return ChainHealth(
                chain=ChainType.BITCOIN,
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
            if not self._client:
                await self.connect()

            # Get transaction details
            response = await self._client.get(f"/tx/{tx_hash}")
            if response.status_code != 200:
                return None

            tx_data = response.json()

            # Get block timestamp
            block_height = tx_data.get("block_height")
            block_timestamp = datetime.now(UTC)

            if block_height:
                block_response = await self._client.get(f"/blocks/{block_height}")
                if block_response.status_code == 200:
                    block_data = block_response.json()
                    block_timestamp = datetime.fromtimestamp(
                        block_data.get("timestamp", 0), tz=UTC
                    )

            # Parse inputs and outputs
            inputs = tx_data.get("vin", [])
            outputs = tx_data.get("vout", [])

            # Calculate total input and output values
            total_input = sum(inp.get("prevout", {}).get("value", 0) for inp in inputs)
            total_output = sum(out.get("value", 0) for out in outputs)

            # Fee is difference between input and output
            fee = total_input - total_output

            # Get sender and receiver addresses
            from_address = (
                inputs[0].get("prevout", {}).get("scriptpubkey_address", "")
                if inputs
                else ""
            )
            to_address = outputs[0].get("scriptpubkey_address", "") if outputs else ""

            # Convert satoshis to BTC
            value_btc = total_output / 100_000_000
            fee_btc = fee / 100_000_000

            # Classify addresses
            from_type = await self._classify_address(from_address)
            to_type = await self._classify_address(to_address)

            # Determine transaction type
            tx_type = self._determine_tx_type(tx_data)

            return NormalizedTransaction(
                tx_hash=tx_hash,
                chain=ChainType.BITCOIN,
                block_number=block_height or 0,
                block_timestamp=block_timestamp,
                from_address=from_address,
                from_address_type=from_type,
                to_address=to_address,
                to_address_type=to_type,
                value=value_btc,
                currency="BTC",
                fee=fee_btc,
                transaction_type=tx_type,
                is_success=True,  # Bitcoin transactions don't have explicit success/failure
                input_data=tx_data.get("hex", ""),
            )

        except Exception as e:
            print(f"Error getting Bitcoin transaction {tx_hash}: {e}")
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
            if not self._client:
                await self.connect()

            # Get address transactions
            params = {"limit": limit}
            if end_block != -1:
                params["until_block"] = end_block

            response = await self._client.get(
                f"/address/{address}/txs",
                params=params,
            )

            if response.status_code != 200:
                return transactions

            txs_data = response.json()

            for tx_data in txs_data:
                # Parse transaction
                tx_hash = tx_data.get("txid", "")

                # Get block info
                block_height = tx_data.get("block_height")
                block_timestamp = datetime.now(UTC)

                if block_height:
                    try:
                        block_response = await self._client.get(
                            f"/blocks/{block_height}"
                        )
                        if block_response.status_code == 200:
                            block_data = block_response.json()
                            block_timestamp = datetime.fromtimestamp(
                                block_data.get("timestamp", 0), tz=UTC
                            )
                    except Exception:
                        pass

                # Calculate values
                inputs = tx_data.get("vin", [])
                outputs = tx_data.get("vout", [])

                # Find value for this address
                value_btc = 0
                for out in outputs:
                    if out.get("scriptpubkey_address") == address:
                        value_btc += out.get("value", 0) / 100_000_000

                # Determine if sending or receiving
                is_sending = any(
                    inp.get("prevout", {}).get("scriptpubkey_address") == address
                    for inp in inputs
                )

                from_addr = (
                    address
                    if is_sending
                    else (
                        inputs[0].get("prevout", {}).get("scriptpubkey_address", "")
                        if inputs
                        else ""
                    )
                )
                to_addr = (
                    address
                    if not is_sending
                    else (outputs[0].get("scriptpubkey_address", "") if outputs else "")
                )

                transactions.append(
                    NormalizedTransaction(
                        tx_hash=tx_hash,
                        chain=ChainType.BITCOIN,
                        block_number=block_height or 0,
                        block_timestamp=block_timestamp,
                        from_address=from_addr,
                        from_address_type=await self._classify_address(from_addr),
                        to_address=to_addr,
                        to_address_type=await self._classify_address(to_addr),
                        value=value_btc,
                        currency="BTC",
                        fee=sum(
                            inp.get("prevout", {}).get("value", 0) for inp in inputs
                        )
                        / 100_000_000
                        - sum(out.get("value", 0) for out in outputs) / 100_000_000,
                        transaction_type=TransactionType.TRANSFER,
                        is_success=True,
                    )
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
            if not self._client:
                await self.connect()

            # Get block hash
            response = await self._client.get(f"/blocks/{block_number}")
            if response.status_code != 200:
                return transactions

            block_data = response.json()
            block_hash = block_data.get("id", "")

            # Get block transactions
            txs_response = await self._client.get(f"/block/{block_hash}/txs")
            if txs_response.status_code != 200:
                return transactions

            txs_data = txs_response.json()
            block_timestamp = datetime.fromtimestamp(
                block_data.get("timestamp", 0), tz=UTC
            )

            for tx_data in txs_data:
                tx_hash = tx_data.get("txid", "")
                inputs = tx_data.get("vin", [])
                outputs = tx_data.get("vout", [])

                from_address = (
                    inputs[0].get("prevout", {}).get("scriptpubkey_address", "")
                    if inputs
                    else ""
                )
                to_address = (
                    outputs[0].get("scriptpubkey_address", "") if outputs else ""
                )

                value_btc = sum(out.get("value", 0) for out in outputs) / 100_000_000

                transactions.append(
                    NormalizedTransaction(
                        tx_hash=tx_hash,
                        chain=ChainType.BITCOIN,
                        block_number=block_number,
                        block_timestamp=block_timestamp,
                        from_address=from_address,
                        from_address_type=await self._classify_address(from_address),
                        to_address=to_address,
                        to_address_type=await self._classify_address(to_address),
                        value=value_btc,
                        currency="BTC",
                        transaction_type=TransactionType.TRANSFER,
                        is_success=True,
                    )
                )

            return transactions

        except Exception as e:
            print(f"Error getting block {block_number}: {e}")
            return transactions

    async def get_address_info(self, address: str) -> dict[str, Any]:
        """Get information about an address."""
        try:
            if not self._client:
                await self.connect()

            # Get address statistics
            response = await self._client.get(f"/address/{address}")
            if response.status_code != 200:
                return {
                    "address": address,
                    "balance": 0,
                    "is_contract": False,
                    "chain": ChainType.BITCOIN.value,
                }

            addr_data = response.json()

            # Get balance
            stats_response = await self._client.get(f"/address/{address}/utxo")
            balance_satoshis = 0
            if stats_response.status_code == 200:
                utxos = stats_response.json()
                balance_satoshis = sum(utxo.get("value", 0) for utxo in utxos)

            balance_btc = balance_satoshis / 100_000_000

            # Bitcoin addresses are always EOAs (no contracts)
            return {
                "address": address,
                "balance": balance_btc,
                "balance_satoshis": balance_satoshis,
                "is_contract": False,  # Bitcoin doesn't have smart contracts
                "chain": ChainType.BITCOIN.value,
                "tx_count": addr_data.get("chain_stats", {}).get("tx_count", 0),
                "funded_txo_count": addr_data.get("chain_stats", {}).get(
                    "funded_txo_count", 0
                ),
                "spent_txo_count": addr_data.get("chain_stats", {}).get(
                    "spent_txo_count", 0
                ),
            }

        except Exception as e:
            print(f"Error getting address info for {address}: {e}")
            return {
                "address": address,
                "balance": 0,
                "is_contract": False,
                "chain": ChainType.BITCOIN.value,
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
        """Get token transfers (not applicable for Bitcoin)."""
        # Bitcoin doesn't have native token transfers
        # This would be for Wrapped Bitcoin (WBTC) on other chains
        return []

    async def trace_transaction(self, tx_hash: str) -> list[dict[str, Any]]:
        """Trace transaction inputs and outputs."""
        try:
            if not self._client:
                await self.connect()

            response = await self._client.get(f"/tx/{tx_hash}/out")
            if response.status_code != 200:
                return []

            outputs = response.json()
            return [
                {
                    "index": i,
                    "value": out.get("value", 0) / 100_000_000,
                    "address": out.get("scriptpubkey_address", ""),
                }
                for i, out in enumerate(outputs)
            ]

        except Exception as e:
            print(f"Error tracing transaction: {e}")
            return []

    async def get_block_number(self) -> int:
        """Get the latest block number."""
        if not self._client:
            await self.connect()

        response = await self._client.get("/blocks/tip/height")
        if response.status_code == 200:
            return response.json()
        return 0

    async def get_block_by_number(self, block_number: int) -> dict[str, Any]:
        """Get block details by number."""
        if not self._client:
            await self.connect()

        response = await self._client.get(f"/blocks/{block_number}")
        if response.status_code == 200:
            block_data = response.json()
            return {
                "number": block_number,
                "hash": block_data.get("id", ""),
                "timestamp": block_data.get("timestamp", 0),
                "transactions": block_data.get("tx_count", 0),
                "size": block_data.get("size", 0),
                "weight": block_data.get("weight", 0),
                "difficulty": block_data.get("difficulty", 0),
            }
        return {}

    async def _classify_address(self, address: str) -> AddressType:
        """Classify a Bitcoin address."""
        if not address:
            return AddressType.UNKNOWN

        # Check known addresses
        if address in self._known_addresses:
            label = self._known_addresses[address]
            if "exchange" in label.lower():
                return AddressType.EXCHANGE
            elif "mixer" in label.lower():
                return AddressType.MIXER

        # Bitcoin addresses are always EOAs
        return AddressType.EOA

    def _determine_tx_type(self, tx_data: dict) -> TransactionType:
        """Determine transaction type."""
        # Simple transfer
        return TransactionType.TRANSFER
