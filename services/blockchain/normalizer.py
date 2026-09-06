"""Transaction normalizer for multi-chain support.

Provides normalization, enrichment, and risk scoring for transactions.
"""

from __future__ import annotations

import hashlib
from typing import Any

from .base import (
    AddressType,
    ChainType,
    NormalizedTransaction,
    TransactionType,
)


class TransactionNormalizer:
    """Normalizes and enriches transactions across chains."""

    def __init__(self):
        # Known exchange addresses (simplified)
        self._known_exchanges: dict[str, str] = {
            "0x28c6c06298d514db089934071355e5743bf21d60": "binance",
            "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "binance",
            "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": "binance",
            "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": "binance",
            "0x85b931a32a0725be14285b66f1a22178c22d2117": "coinbase",
            "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": "coinbase",
            "0x503828976d22510aad0201ac7ec88293211d23da": "coinbase",
        }

        # Known mixer addresses
        self._known_mixers: set[str] = {
            "0xd90f62eb3b6ed24c4626180e21a378b236c2f495",  # Tornado Cash
            "0xsd89fbb1a8c41d24cb251453042a468f1c3b8e85",  # Tornado Cash
        }

        # Risk indicators
        self._high_risk_patterns: list[dict[str, Any]] = [
            {
                "type": "mixer_interaction",
                "score": 0.8,
                "description": "Transaction involves known mixer",
            },
            {
                "type": "large_value",
                "score": 0.3,
                "description": "Transaction value > 100 ETH",
            },
            {
                "type": "rapid_movement",
                "score": 0.4,
                "description": "Funds moved within 1 block",
            },
        ]

    def normalize(
        self,
        transaction: NormalizedTransaction,
        enrich: bool = True,
    ) -> NormalizedTransaction:
        """Normalize a transaction."""
        # Ensure consistent address format
        transaction.from_address = transaction.from_address.lower()
        transaction.to_address = (
            transaction.to_address.lower() if transaction.to_address else ""
        )

        # Enrich with additional data
        if enrich:
            transaction = self._enrich(transaction)

        # Calculate risk score
        transaction.risk_score = self._calculate_risk_score(transaction)
        transaction.is_suspicious = transaction.risk_score > 0.7

        return transaction

    def normalize_batch(
        self,
        transactions: list[NormalizedTransaction],
        enrich: bool = True,
    ) -> list[NormalizedTransaction]:
        """Normalize a batch of transactions."""
        return [self.normalize(tx, enrich) for tx in transactions]

    def _enrich(self, transaction: NormalizedTransaction) -> NormalizedTransaction:
        """Enrich transaction with additional information."""
        # Classify addresses
        transaction.from_address_type = self._classify_address(
            transaction.from_address, transaction.from_address_type
        )
        transaction.to_address_type = self._classify_address(
            transaction.to_address, transaction.to_address_type
        )

        # Determine transaction type if unknown
        if transaction.transaction_type == TransactionType.UNKNOWN:
            transaction.transaction_type = self._infer_tx_type(transaction)

        return transaction

    def _classify_address(
        self,
        address: str,
        current_type: AddressType,
    ) -> AddressType:
        """Classify address based on known lists."""
        address = address.lower()

        # Check known exchanges
        if address in self._known_exchanges:
            return AddressType.EXCHANGE

        # Check known mixers
        if address in self._known_mixers:
            return AddressType.MIXER

        # Keep current classification if already determined
        return current_type

    def _infer_tx_type(self, transaction: NormalizedTransaction) -> TransactionType:
        """Infer transaction type from context."""
        # Simple transfer (no input data)
        if not transaction.input_data or transaction.input_data == "0x":
            return TransactionType.TRANSFER

        # Token transfer (ERC20)
        if transaction.method_id == "0xa9059cbb":
            return TransactionType.TRANSFER

        # Contract interaction
        return TransactionType.CONTRACT_INTERACTION

    def _calculate_risk_score(self, transaction: NormalizedTransaction) -> float:
        """Calculate risk score for a transaction."""
        score = 0.0

        # Mixer interaction
        if (
            transaction.from_address_type == AddressType.MIXER
            or transaction.to_address_type == AddressType.MIXER
        ):
            score += 0.8

        # Large value transactions
        if transaction.value > 100:  # 100 ETH
            score += 0.2
        elif transaction.value > 10:
            score += 0.1

        # Failed transactions
        if not transaction.is_success:
            score += 0.1

        # Unknown recipient
        if transaction.to_address_type == AddressType.UNKNOWN:
            score += 0.1

        # Contract interaction (potentially complex/risky)
        if transaction.transaction_type == TransactionType.CONTRACT_INTERACTION:
            score += 0.1

        # Normalize to 0-1 range
        return min(score, 1.0)

    def generate_unique_id(self, transaction: NormalizedTransaction) -> str:
        """Generate a unique ID for a normalized transaction."""
        # Combine chain, hash, and timestamp for uniqueness
        unique_string = (
            f"{transaction.chain}:{transaction.tx_hash}:{transaction.block_number}"
        )
        return hashlib.sha256(unique_string.encode()).hexdigest()[:16]

    def merge_transactions(
        self,
        transactions: list[NormalizedTransaction],
    ) -> list[NormalizedTransaction]:
        """Merge duplicate transactions (e.g., from different sources)."""
        seen_hashes: dict[str, NormalizedTransaction] = {}

        for tx in transactions:
            key = f"{tx.chain}:{tx.tx_hash}"

            if key in seen_hashes:
                # Merge data, preferring non-None values
                existing = seen_hashes[key]
                seen_hashes[key] = self._merge_single(existing, tx)
            else:
                seen_hashes[key] = tx

        return list(seen_hashes.values())

    def _merge_single(
        self,
        tx1: NormalizedTransaction,
        tx2: NormalizedTransaction,
    ) -> NormalizedTransaction:
        """Merge two transactions, preferring tx1's values."""
        # This is a simplified merge - in production, implement more sophisticated logic
        merged = tx1.model_copy()

        # Merge risk scores (take highest)
        if tx2.risk_score and (
            not merged.risk_score or tx2.risk_score > merged.risk_score
        ):
            merged.risk_score = tx2.risk_score
            merged.is_suspicious = tx2.is_suspicious

        return merged

    def to_database_format(
        self,
        transaction: NormalizedTransaction,
    ) -> dict[str, Any]:
        """Convert transaction to database-compatible format."""
        return {
            "tx_hash": transaction.tx_hash,
            "chain": (
                transaction.chain.value
                if isinstance(transaction.chain, ChainType)
                else transaction.chain
            ),
            "block_number": transaction.block_number,
            "block_timestamp": transaction.block_timestamp.isoformat(),
            "from_address": transaction.from_address,
            "from_address_type": (
                transaction.from_address_type.value
                if isinstance(transaction.from_address_type, AddressType)
                else transaction.from_address_type
            ),
            "to_address": transaction.to_address,
            "to_address_type": (
                transaction.to_address_type.value
                if isinstance(transaction.to_address_type, AddressType)
                else transaction.to_address_type
            ),
            "value": transaction.value,
            "currency": transaction.currency,
            "value_usd": transaction.value_usd,
            "gas_price": transaction.gas_price,
            "gas_used": transaction.gas_used,
            "fee": transaction.fee,
            "transaction_type": (
                transaction.transaction_type.value
                if isinstance(transaction.transaction_type, TransactionType)
                else transaction.transaction_type
            ),
            "is_success": transaction.is_success,
            "error_message": transaction.error_message,
            "token_address": transaction.token_address,
            "token_symbol": transaction.token_symbol,
            "token_decimals": transaction.token_decimals,
            "method_id": transaction.method_id,
            "is_suspicious": transaction.is_suspicious,
            "risk_score": transaction.risk_score,
        }
