"""Tron chain adapter implementation.

Provides integration with Tron blockchain via Trongrid API.
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


class TronAdapter(ChainAdapter):
    """Tron blockchain adapter using Trongrid API."""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._chain_type = ChainType.TRON

        # Configuration
        self.api_url = config.get("api_url", "https://api.trongrid.io")
        self.api_key = config.get("api_key")
        self.timeout = config.get("timeout", 30)

        # HTTP client
        self._client: httpx.AsyncClient | None = None

        # Known contract addresses
        self._known_contracts: dict[str, str] = {
            "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t": "usdt",
            "TEkxiTtzYBBzKx1Noc3Yn8CcoH6RSDjbPB": "usdc",
            "TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax": "sun",
        }

    async def connect(self) -> bool:
        """Connect to Trongrid API."""
        try:
            headers = {"Accept": "application/json"}
            if self.api_key:
                headers["TRON-PRO-API-KEY"] = self.api_key

            self._client = httpx.AsyncClient(
                base_url=self.api_url,
                timeout=self.timeout,
                headers=headers,
            )

            # Test connection
            response = await self._client.get("/wallet/getnowblock")
            if response.status_code == 200:
                block_data = response.json()
                block_height = (
                    block_data.get("block_header", {})
                    .get("raw_data", {})
                    .get("number", 0)
                )
                print(f"Connected to Tron (Block height: {block_height})")
                return True

            return False

        except Exception as e:
            print(f"Failed to connect to Tron API: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from API."""
        if self._client:
            await self._client.aclose()

    async def get_chain_health(self) -> ChainHealth:
        """Get Tron chain health status."""
        try:
            if not self._client:
                await self.connect()

            # Get latest block
            response = await self._client.get("/wallet/getnowblock")
            if response.status_code != 200:
                raise Exception("Failed to get block")

            block_data = response.json()
            block_header = block_data.get("block_header", {})
            raw_data = block_header.get("raw_data", {})

            block_height = raw_data.get("number", 0)
            block_timestamp = raw_data.get("timestamp", 0)
            block_time = datetime.fromtimestamp(block_timestamp / 1000, tz=UTC)

            # Calculate lag
            now = datetime.now(UTC)
            lag_seconds = int((now - block_time).total_seconds())

            # Determine sync status (Tron blocks ~3 seconds)
            if lag_seconds < 30:
                sync_status = "synced"
            elif lag_seconds < 300:
                sync_status = "syncing"
            else:
                sync_status = "stale"

            return ChainHealth(
                chain=ChainType.TRON,
                is_healthy=lag_seconds < 300,
                block_height=block_height,
                block_timestamp=block_time,
                sync_status=sync_status,
                lag_seconds=lag_seconds,
            )

        except Exception as e:
            return ChainHealth(
                chain=ChainType.TRON,
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

            # Get transaction info
            response = await self._client.get(
                "/wallet/gettransactionbyid",
                params={"value": tx_hash},
            )

            if response.status_code != 200:
                return None

            tx_data = response.json()
            if not tx_data:
                return None

            # Get block timestamp
            block_height = tx_data.get("blockNumber", 0)
            block_timestamp_raw = tx_data.get("raw_data", {}).get("timestamp", 0)
            block_timestamp = datetime.fromtimestamp(block_timestamp_raw / 1000, tz=UTC)

            # Parse transaction
            raw_data = tx_data.get("raw_data", {})
            contract = raw_data.get("contract", [{}])[0]
            contract_type = contract.get("type", "")
            parameter = contract.get("parameter", {}).get("value", {})

            from_address = parameter.get("owner_address", "")
            to_address = parameter.get("to_address", "")

            # Convert hex addresses to base58 if needed
            if from_address.startswith("41"):
                from_address = self._hex_to_base58(from_address)
            if to_address.startswith("41"):
                to_address = self._hex_to_base58(to_address)

            # Get value
            amount = parameter.get("amount", 0)
            value_trx = amount / 1_000_000  # TRX has 6 decimals

            # Determine transaction type
            tx_type = self._determine_tx_type(contract_type)

            # Check if contract interaction
            contract_address = None
            if contract_type == "TriggerSmartContract":
                contract_address = parameter.get("contract_address", "")

            # Get energy and bandwidth usage
            fee = tx_data.get("fee", 0) / 1_000_000  # Convert to TRX

            # Get receipt for success status
            receipt_response = await self._client.get(
                "/wallet/gettransactionreceiptbyid",
                params={"value": tx_hash},
            )
            is_success = True
            if receipt_response.status_code == 200:
                receipt = receipt_response.json()
                is_success = receipt.get("receipt", {}).get("result", "") == "SUCCESS"

            return NormalizedTransaction(
                tx_hash=tx_hash,
                chain=ChainType.TRON,
                block_number=block_height,
                block_timestamp=block_timestamp,
                from_address=from_address,
                from_address_type=await self._classify_address(from_address),
                to_address=to_address,
                to_address_type=await self._classify_address(to_address),
                value=value_trx,
                currency="TRX",
                fee=fee,
                transaction_type=tx_type,
                is_success=is_success,
                token_address=contract_address,
                method_id=contract_type,
            )

        except Exception as e:
            print(f"Error getting Tron transaction {tx_hash}: {e}")
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

            # Get account transactions
            params = {
                "address": address,
                "limit": limit,
                "order_by": "block_timestamp,desc",
            }

            response = await self._client.get(
                "/v1/accounts/{address}/transactions",
                params=params,
            )

            if response.status_code != 200:
                return transactions

            data = response.json()
            txs_data = data.get("data", [])

            for tx_data in txs_data:
                # Parse transaction
                tx_hash = tx_data.get("txID", "")

                # Get block info
                block_height = tx_data.get("blockNumber", 0)
                block_timestamp_raw = tx_data.get("raw_data", {}).get("timestamp", 0)
                block_timestamp = datetime.fromtimestamp(
                    block_timestamp_raw / 1000, tz=UTC
                )

                # Parse contract
                raw_data = tx_data.get("raw_data", {})
                contract = raw_data.get("contract", [{}])[0]
                parameter = contract.get("parameter", {}).get("value", {})

                from_address = self._hex_to_base58(parameter.get("owner_address", ""))
                to_address = self._hex_to_base58(parameter.get("to_address", ""))

                amount = parameter.get("amount", 0)
                value_trx = amount / 1_000_000

                transactions.append(
                    NormalizedTransaction(
                        tx_hash=tx_hash,
                        chain=ChainType.TRON,
                        block_number=block_height,
                        block_timestamp=block_timestamp,
                        from_address=from_address,
                        from_address_type=await self._classify_address(from_address),
                        to_address=to_address,
                        to_address_type=await self._classify_address(to_address),
                        value=value_trx,
                        currency="TRX",
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

            # Get block by number
            response = await self._client.get(
                "/wallet/getblockbynum",
                params={"num": block_number, "detail": "true"},
            )

            if response.status_code != 200:
                return transactions

            block_data = response.json()
            block_timestamp_raw = (
                block_data.get("block_header", {})
                .get("raw_data", {})
                .get("timestamp", 0)
            )
            block_timestamp = datetime.fromtimestamp(block_timestamp_raw / 1000, tz=UTC)

            txs = block_data.get("transactions", [])

            for tx_data in txs:
                tx_hash = tx_data.get("txID", "")
                raw_data = tx_data.get("raw_data", {})
                contract = raw_data.get("contract", [{}])[0]
                parameter = contract.get("parameter", {}).get("value", {})

                from_address = self._hex_to_base58(parameter.get("owner_address", ""))
                to_address = self._hex_to_base58(parameter.get("to_address", ""))

                amount = parameter.get("amount", 0)
                value_trx = amount / 1_000_000

                transactions.append(
                    NormalizedTransaction(
                        tx_hash=tx_hash,
                        chain=ChainType.TRON,
                        block_number=block_number,
                        block_timestamp=block_timestamp,
                        from_address=from_address,
                        from_address_type=await self._classify_address(from_address),
                        to_address=to_address,
                        to_address_type=await self._classify_address(to_address),
                        value=value_trx,
                        currency="TRX",
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

            # Get account info
            response = await self._client.get(
                "/v1/accounts/{address}",
                params={"address": address},
            )

            if response.status_code != 200:
                return {
                    "address": address,
                    "balance": 0,
                    "is_contract": False,
                    "chain": ChainType.TRON.value,
                }

            account_data = response.json()
            balance_sun = account_data.get("balance", 0)
            balance_trx = balance_sun / 1_000_000

            # Check if contract
            is_contract = bool(account_data.get("contract_code"))

            return {
                "address": address,
                "balance": balance_trx,
                "balance_sun": balance_sun,
                "is_contract": is_contract,
                "chain": ChainType.TRON.value,
                "account_type": "contract" if is_contract else "account",
                "create_time": account_data.get("create_time"),
            }

        except Exception as e:
            print(f"Error getting address info for {address}: {e}")
            return {
                "address": address,
                "balance": 0,
                "is_contract": False,
                "chain": ChainType.TRON.value,
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
        """Get TRC20 token transfers."""
        transfers = []

        try:
            if not self._client:
                await self.connect()

            # Get token transfers
            params = {"limit": limit, "order_by": "block_timestamp,desc"}

            response = await self._client.get(
                f"/v1/contracts/{token_address}/transactions",
                params=params,
            )

            if response.status_code != 200:
                return transfers

            data = response.json()
            txs_data = data.get("data", [])

            for tx_data in txs_data:
                tx_hash = tx_data.get("txID", "")

                # Parse token transfer
                raw_data = tx_data.get("raw_data", {})
                contract = raw_data.get("contract", [{}])[0]
                parameter = contract.get("parameter", {}).get("value", {})

                from_addr = self._hex_to_base58(parameter.get("owner_address", ""))
                to_addr = self._hex_to_base58(parameter.get("to_address", ""))

                # Get token amount
                amount = parameter.get("amount", 0)

                # Get block timestamp
                block_timestamp_raw = raw_data.get("timestamp", 0)
                block_timestamp = datetime.fromtimestamp(
                    block_timestamp_raw / 1000, tz=UTC
                )

                transfers.append(
                    NormalizedTransaction(
                        tx_hash=tx_hash,
                        chain=ChainType.TRON,
                        block_number=tx_data.get("blockNumber", 0),
                        block_timestamp=block_timestamp,
                        from_address=from_addr,
                        from_address_type=await self._classify_address(from_addr),
                        to_address=to_addr,
                        to_address_type=await self._classify_address(to_addr),
                        value=float(amount),
                        currency="TOKEN",
                        transaction_type=TransactionType.TRANSFER,
                        is_success=True,
                        token_address=token_address,
                    )
                )

            return transfers

        except Exception as e:
            print(f"Error getting token transfers: {e}")
            return transfers

    async def trace_transaction(self, tx_hash: str) -> list[dict[str, Any]]:
        """Trace transaction (Tron doesn't have trace API like Ethereum)."""
        return []

    async def get_block_number(self) -> int:
        """Get the latest block number."""
        if not self._client:
            await self.connect()

        response = await self._client.get("/wallet/getnowblock")
        if response.status_code == 200:
            block_data = response.json()
            return (
                block_data.get("block_header", {}).get("raw_data", {}).get("number", 0)
            )
        return 0

    async def get_block_by_number(self, block_number: int) -> dict[str, Any]:
        """Get block details by number."""
        if not self._client:
            await self.connect()

        response = await self._client.get(
            "/wallet/getblockbynum",
            params={"num": block_number, "detail": "true"},
        )

        if response.status_code == 200:
            block_data = response.json()
            raw_data = block_data.get("block_header", {}).get("raw_data", {})
            return {
                "number": raw_data.get("number", 0),
                "hash": block_data.get("blockID", ""),
                "timestamp": raw_data.get("timestamp", 0),
                "transactions": len(block_data.get("transactions", [])),
                "witness_address": raw_data.get("witness_address", ""),
            }
        return {}

    async def _classify_address(self, address: str) -> AddressType:
        """Classify a Tron address."""
        if not address:
            return AddressType.UNKNOWN

        # Check known contracts
        if address in self._known_contracts:
            return AddressType.CONTRACT

        # Check if it's a contract
        try:
            info = await self.get_address_info(address)
            if info.get("is_contract"):
                return AddressType.CONTRACT
        except Exception:
            pass

        return AddressType.EOA

    def _determine_tx_type(self, contract_type: str) -> TransactionType:
        """Determine transaction type based on contract type."""
        type_map = {
            "TransferContract": TransactionType.TRANSFER,
            "TriggerSmartContract": TransactionType.CONTRACT_INTERACTION,
            "TransferAssetContract": TransactionType.TRANSFER,
            "ParticipateAssetIssueContract": TransactionType.CONTRACT_INTERACTION,
            "UnfreezeAssetContract": TransactionType.CONTRACT_INTERACTION,
            "UnfreezeBalanceContract": TransactionType.CONTRACT_INTERACTION,
            "WithdrawBalanceContract": TransactionType.WITHDRAWAL,
            "UpdateSettingContract": TransactionType.CONTRACT_INTERACTION,
        }
        return type_map.get(contract_type, TransactionType.TRANSFER)

    def _hex_to_base58(self, hex_address: str) -> str:
        """Convert hex address to base58 format."""
        if not hex_address or not hex_address.startswith("41"):
            return hex_address

        try:
            import base58

            return base58.b58encode_check(bytes.fromhex(hex_address)).decode()
        except Exception:
            # Fallback: return hex address
            return hex_address
