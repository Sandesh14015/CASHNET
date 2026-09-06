"""Solana chain adapter implementation.

Provides integration with Solana blockchain via JSON-RPC.
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


class SolanaAdapter(ChainAdapter):
    """Solana blockchain adapter."""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self._chain_type = ChainType.SOLANA

        # Configuration
        self.rpc_url = config.get("rpc_url", "https://api.mainnet-beta.solana.com")
        self.timeout = config.get("timeout", 30)

        # HTTP client
        self._client: httpx.AsyncClient | None = None

        # Known program addresses
        self._known_programs: dict[str, str] = {
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA": "spl_token",
            "11111111111111111111111111111111": "system_program",
            "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL": "associated_token",
        }

        # Token decimals cache
        self._token_decimals: dict[str, int] = {}

    async def connect(self) -> bool:
        """Connect to Solana RPC."""
        try:
            self._client = httpx.AsyncClient(
                base_url=self.rpc_url,
                timeout=self.timeout,
                headers={"Content-Type": "application/json"},
            )

            # Test connection
            response = await self._rpc_call("getHealth")
            if response and response.get("result") == "ok":
                # Get version
                version_response = await self._rpc_call("getVersion")
                version = version_response.get("result", {}).get(
                    "solana-core", "unknown"
                )
                print(f"Connected to Solana (Version: {version})")
                return True

            return False

        except Exception as e:
            print(f"Failed to connect to Solana: {e}")
            return False

    async def disconnect(self) -> None:
        """Disconnect from API."""
        if self._client:
            await self._client.aclose()

    async def _rpc_call(self, method: str, params: list | None = None) -> dict:
        """Make an RPC call."""
        if not self._client:
            await self.connect()

        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or [],
        }

        response = await self._client.post("", json=payload)
        if response.status_code == 200:
            return response.json()
        return {}

    async def get_chain_health(self) -> ChainHealth:
        """Get Solana chain health status."""
        try:
            if not self._client:
                await self.connect()

            # Get health
            health_response = await self._rpc_call("getHealth")
            is_healthy = health_response.get("result") == "ok"

            # Get slot (block)
            slot_response = await self._rpc_call("getSlot")
            block_height = slot_response.get("result", 0)

            # Get block time
            block_time_response = await self._rpc_call("getBlockTime", [block_height])
            block_time_unix = block_time_response.get("result", 0)
            block_timestamp = (
                datetime.fromtimestamp(block_time_unix, tz=UTC)
                if block_time_unix
                else datetime.now(UTC)
            )

            # Calculate lag
            now = datetime.now(UTC)
            lag_seconds = int((now - block_timestamp).total_seconds())

            # Solana blocks ~400ms
            if lag_seconds < 10:
                sync_status = "synced"
            elif lag_seconds < 60:
                sync_status = "syncing"
            else:
                sync_status = "stale"

            return ChainHealth(
                chain=ChainType.SOLANA,
                is_healthy=is_healthy and lag_seconds < 60,
                block_height=block_height,
                block_timestamp=block_timestamp,
                sync_status=sync_status,
                lag_seconds=lag_seconds,
            )

        except Exception as e:
            return ChainHealth(
                chain=ChainType.SOLANA,
                is_healthy=False,
                block_height=0,
                block_timestamp=datetime.now(UTC),
                sync_status="error",
                lag_seconds=-1,
                error_message=str(e),
            )

    async def get_transaction(self, tx_hash: str) -> NormalizedTransaction | None:
        """Get a single transaction by signature."""
        try:
            if not self._client:
                await self.connect()

            # Get transaction
            response = await self._rpc_call(
                "getTransaction", [tx_hash, {"encoding": "jsonParsed"}]
            )

            tx_data = response.get("result")
            if not tx_data:
                return None

            # Parse transaction
            meta = tx_data.get("meta", {})
            transaction = tx_data.get("transaction", {})

            # Get block time
            block_time = tx_data.get("blockTime", 0)
            block_timestamp = (
                datetime.fromtimestamp(block_time, tz=UTC)
                if block_time
                else datetime.now(UTC)
            )

            # Get slot
            slot = tx_data.get("slot", 0)

            # Parse account keys
            account_keys = transaction.get("message", {}).get("accountKeys", [])
            if not account_keys:
                # Try parsed format
                account_keys = [
                    key.get("pubkey", "") if isinstance(key, dict) else key
                    for key in transaction.get("transaction", {})
                    .get("message", {})
                    .get("accountKeys", [])
                ]

            # Get fee
            fee_lamports = meta.get("fee", 0)
            fee_sol = fee_lamports / 1_000_000_000

            # Get pre/post balances
            pre_balances = meta.get("preBalances", [])
            post_balances = meta.get("postBalances", [])

            # Determine sender and receiver
            from_address = account_keys[0] if account_keys else ""
            to_address = ""

            # Find the transfer
            value_lamports = 0
            for i, balance_change in enumerate(post_balances):
                if i < len(pre_balances):
                    change = balance_change - pre_balances[i]
                    if change < 0 and i == 0:
                        value_lamports = abs(change)
                    elif change > 0 and i > 0:
                        to_address = account_keys[i] if i < len(account_keys) else ""

            value_sol = value_lamports / 1_000_000_000

            # Check success
            err = meta.get("err")
            is_success = err is None

            return NormalizedTransaction(
                tx_hash=tx_hash,
                chain=ChainType.SOLANA,
                block_number=slot,
                block_timestamp=block_timestamp,
                from_address=from_address,
                from_address_type=await self._classify_address(from_address),
                to_address=to_address,
                to_address_type=await self._classify_address(to_address),
                value=value_sol,
                currency="SOL",
                fee=fee_sol,
                transaction_type=TransactionType.TRANSFER,
                is_success=is_success,
                error_message=str(err) if err else None,
            )

        except Exception as e:
            print(f"Error getting Solana transaction {tx_hash}: {e}")
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

            # Get signatures
            response = await self._rpc_call(
                "getSignaturesForAddress", [address, {"limit": limit}]
            )

            signatures = response.get("result", [])

            for sig_info in signatures:
                tx_hash = sig_info.get("signature", "")

                # Get transaction details
                tx_response = await self._rpc_call(
                    "getTransaction", [tx_hash, {"encoding": "jsonParsed"}]
                )

                tx_data = tx_response.get("result")
                if not tx_data:
                    continue

                # Parse transaction (simplified)
                meta = tx_data.get("meta", {})
                block_time = tx_data.get("blockTime", 0)
                slot = tx_data.get("slot", 0)

                block_timestamp = (
                    datetime.fromtimestamp(block_time, tz=UTC)
                    if block_time
                    else datetime.now(UTC)
                )

                fee_lamports = meta.get("fee", 0)
                fee_sol = fee_lamports / 1_000_000_000

                is_success = meta.get("err") is None

                transactions.append(
                    NormalizedTransaction(
                        tx_hash=tx_hash,
                        chain=ChainType.SOLANA,
                        block_number=slot,
                        block_timestamp=block_timestamp,
                        from_address=address,
                        from_address_type=await self._classify_address(address),
                        to_address="",  # Would need to parse further
                        to_address_type=AddressType.UNKNOWN,
                        value=0,  # Would need to parse further
                        currency="SOL",
                        fee=fee_sol,
                        transaction_type=TransactionType.TRANSFER,
                        is_success=is_success,
                    )
                )

            return transactions

        except Exception as e:
            print(f"Error getting Solana transactions: {e}")
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

            # Get block
            response = await self._rpc_call(
                "getBlock",
                [
                    block_number,
                    {"encoding": "jsonParsed", "transactionDetails": "full"},
                ],
            )

            block_data = response.get("result")
            if not block_data:
                return transactions

            block_time = block_data.get("blockTime", 0)
            block_timestamp = (
                datetime.fromtimestamp(block_time, tz=UTC)
                if block_time
                else datetime.now(UTC)
            )

            txs = block_data.get("transactions", [])

            for tx_info in txs:
                meta = tx_info.get("meta", {})
                transaction = tx_info.get("transaction", {})

                # Get signatures
                signatures = transaction.get("signatures", [])
                tx_hash = signatures[0] if signatures else ""

                # Get account keys
                account_keys = transaction.get("message", {}).get("accountKeys", [])
                from_address = account_keys[0] if account_keys else ""
                to_address = account_keys[1] if len(account_keys) > 1 else ""

                # Get fee
                fee_lamports = meta.get("fee", 0)
                fee_sol = fee_lamports / 1_000_000_000

                is_success = meta.get("err") is None

                transactions.append(
                    NormalizedTransaction(
                        tx_hash=tx_hash,
                        chain=ChainType.SOLANA,
                        block_number=block_number,
                        block_timestamp=block_timestamp,
                        from_address=from_address,
                        from_address_type=await self._classify_address(from_address),
                        to_address=to_address,
                        to_address_type=await self._classify_address(to_address),
                        value=0,  # Would need balance analysis
                        currency="SOL",
                        fee=fee_sol,
                        transaction_type=TransactionType.TRANSFER,
                        is_success=is_success,
                    )
                )

            return transactions

        except Exception as e:
            print(f"Error getting Solana block: {e}")
            return transactions

    async def get_address_info(self, address: str) -> dict[str, Any]:
        """Get information about an address."""
        try:
            if not self._client:
                await self.connect()

            # Get balance
            balance_response = await self._rpc_call("getBalance", [address])

            balance_lamports = balance_response.get("result", {}).get("value", 0)
            balance_sol = balance_lamports / 1_000_000_000

            # Check if account exists
            account_response = await self._rpc_call(
                "getAccountInfo", [address, {"encoding": "jsonParsed"}]
            )

            account_data = account_response.get("result", {}).get("value")
            is_program = False

            if account_data:
                # Check if it's a program (executable)
                is_program = account_data.get("executable", False)

            return {
                "address": address,
                "balance": balance_sol,
                "balance_lamports": balance_lamports,
                "is_contract": is_program,  # Solana calls them "programs"
                "chain": ChainType.SOLANA.value,
            }

        except Exception as e:
            print(f"Error getting Solana address info: {e}")
            return {
                "address": address,
                "balance": 0,
                "is_contract": False,
                "chain": ChainType.SOLANA.value,
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
        """Get SPL token transfers."""
        # Solana token transfers are more complex
        # Would need to parse token program instructions
        return []

    async def trace_transaction(self, tx_hash: str) -> list[dict[str, Any]]:
        """Trace transaction instructions."""
        try:
            if not self._client:
                await self.connect()

            response = await self._rpc_call(
                "getTransaction", [tx_hash, {"encoding": "jsonParsed"}]
            )

            tx_data = response.get("result")
            if not tx_data:
                return []

            instructions = (
                tx_data.get("transaction", {})
                .get("message", {})
                .get("instructions", [])
            )

            return [
                {
                    "index": i,
                    "program": instr.get("programId", ""),
                    "accounts": instr.get("accounts", []),
                    "data": instr.get("data", ""),
                }
                for i, instr in enumerate(instructions)
            ]

        except Exception as e:
            print(f"Error tracing Solana transaction: {e}")
            return []

    async def get_block_number(self) -> int:
        """Get the latest slot (block) number."""
        if not self._client:
            await self.connect()

        response = await self._rpc_call("getSlot")
        return response.get("result", 0)

    async def get_block_by_number(self, block_number: int) -> dict[str, Any]:
        """Get block details by slot number."""
        if not self._client:
            await self.connect()

        response = await self._rpc_call(
            "getBlock", [block_number, {"encoding": "jsonParsed"}]
        )

        block_data = response.get("result", {})
        if block_data:
            return {
                "number": block_number,
                "hash": block_data.get("blockhash", ""),
                "timestamp": block_data.get("blockTime", 0),
                "transactions": len(block_data.get("transactions", [])),
                "parent_slot": block_data.get("parentSlot", 0),
            }
        return {}

    async def _classify_address(self, address: str) -> AddressType:
        """Classify a Solana address."""
        if not address:
            return AddressType.UNKNOWN

        # Check known programs
        if address in self._known_programs:
            return AddressType.CONTRACT

        try:
            info = await self.get_address_info(address)
            if info.get("is_contract"):
                return AddressType.CONTRACT
        except Exception:
            pass

        return AddressType.EOA
