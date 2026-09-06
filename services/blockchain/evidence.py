"""Evidence Package Service.

Provides immutable evidence snapshots, verification, and report export.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from .base import ChainType, NormalizedTransaction


class PackageType(StrEnum):
    """Evidence package types."""

    TRANSACTION_TRACE = "transaction_trace"
    VASP_ATTESTATION = "vasp_attestation"
    BLOCKCHAIN_SNAPSHOT = "blockchain_snapshot"
    COMPLAINT_PACKAGE = "complaint_package"
    CROSS_CHAIN_TRACE = "cross_chain_trace"
    OTHER = "other"


class ItemType(StrEnum):
    """Evidence item types."""

    TRANSACTION = "transaction"
    SCREENSHOT = "screenshot"
    DOCUMENT = "document"
    ATTESTATION = "attestation"
    BLOCK_DATA = "block_data"
    ADDRESS_INFO = "address_info"
    GRAPH_EXPORT = "graph_export"
    OTHER = "other"


class VerificationStatus(StrEnum):
    """Evidence verification status."""

    UNVERIFIED = "unverified"
    VERIFIED = "verified"
    TAMPERED = "tampered"
    EXPIRED = "expired"


class EvidenceItem(BaseModel):
    """Individual evidence item."""

    item_id: str
    item_type: ItemType
    content: dict[str, Any]
    content_hash: str  # SHA-256 of content
    storage_key: str | None = None  # S3/object storage path
    description: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = {}


class EvidencePackage(BaseModel):
    """Immutable evidence package."""

    package_id: str
    case_id: str
    package_type: PackageType

    # Content
    items: list[EvidenceItem] = []
    content_hash: str = ""  # SHA-256 of entire package
    content_type: str = "application/json"

    # Finding reference
    finding_id: str | None = None

    # Integrity
    is_sealed: bool = False  # Once sealed, cannot be modified
    sealed_at: datetime | None = None

    # Verification
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    verified_at: datetime | None = None
    verified_by: str | None = None

    # Chain of custody
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Metadata
    title: str | None = None
    description: str | None = None
    tags: list[str] = []
    metadata: dict[str, Any] = {}


class ReportFormat(StrEnum):
    """Report export formats."""

    JSON = "json"
    PDF = "pdf"
    HTML = "html"
    CSV = "csv"


class EvidenceService:
    """Main Evidence Package Service."""

    def __init__(self):
        self._packages: dict[str, EvidencePackage] = {}
        self._case_index: dict[str, list[str]] = {}  # case_id -> [package_ids]
        self._finding_index: dict[str, list[str]] = {}  # finding_id -> [package_ids]
        self._hash_chain: list[str] = []  # Chain of package hashes for integrity

    def create_package(
        self,
        case_id: str,
        package_type: PackageType,
        created_by: str,
        title: str | None = None,
        description: str | None = None,
        finding_id: str | None = None,
    ) -> EvidencePackage:
        """Create a new evidence package."""
        import uuid

        package = EvidencePackage(
            package_id=str(uuid.uuid4()),
            case_id=case_id,
            package_type=package_type,
            created_by=created_by,
            title=title,
            description=description,
            finding_id=finding_id,
        )

        # Store package
        self._packages[package.package_id] = package

        # Update indexes
        if case_id not in self._case_index:
            self._case_index[case_id] = []
        self._case_index[case_id].append(package.package_id)

        if finding_id:
            if finding_id not in self._finding_index:
                self._finding_index[finding_id] = []
            self._finding_index[finding_id].append(package.package_id)

        return package

    def add_item(
        self,
        package_id: str,
        item_type: ItemType,
        content: dict[str, Any],
        description: str | None = None,
        storage_key: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> EvidenceItem:
        """Add an item to a package."""
        import uuid

        package = self._packages.get(package_id)
        if not package:
            raise ValueError(f"Package not found: {package_id}")

        if package.is_sealed:
            raise ValueError("Cannot add items to a sealed package")

        # Calculate content hash
        content_str = json.dumps(content, sort_keys=True, default=str)
        content_hash = hashlib.sha256(content_str.encode()).hexdigest()

        item = EvidenceItem(
            item_id=str(uuid.uuid4()),
            item_type=item_type,
            content=content,
            content_hash=content_hash,
            storage_key=storage_key,
            description=description,
            metadata=metadata or {},
        )

        package.items.append(item)
        package.updated_at = datetime.now(UTC)

        # Recalculate package hash
        package.content_hash = self._calculate_package_hash(package)

        return item

    def add_transaction_evidence(
        self,
        package_id: str,
        transaction: NormalizedTransaction,
        description: str | None = None,
    ) -> EvidenceItem:
        """Add a transaction as evidence."""
        content = {
            "tx_hash": transaction.tx_hash,
            "chain": (
                transaction.chain.value
                if isinstance(transaction.chain, ChainType)
                else transaction.chain
            ),
            "block_number": transaction.block_number,
            "block_timestamp": transaction.block_timestamp.isoformat(),
            "from_address": transaction.from_address,
            "to_address": transaction.to_address,
            "value": transaction.value,
            "currency": transaction.currency,
            "transaction_type": (
                transaction.transaction_type.value
                if hasattr(transaction.transaction_type, "value")
                else transaction.transaction_type
            ),
            "is_success": transaction.is_success,
            "risk_score": transaction.risk_score,
            "is_suspicious": transaction.is_suspicious,
        }

        return self.add_item(
            package_id,
            ItemType.TRANSACTION,
            content,
            description or f"Transaction {transaction.tx_hash}",
        )

    def add_block_data(
        self,
        package_id: str,
        block_data: dict[str, Any],
        chain: ChainType,
        description: str | None = None,
    ) -> EvidenceItem:
        """Add block data as evidence."""
        content = {
            "chain": chain.value,
            "block_number": block_data.get("number"),
            "block_hash": block_data.get("hash"),
            "timestamp": block_data.get("timestamp"),
            "transactions": block_data.get("transactions", 0),
            "gas_used": block_data.get("gas_used"),
            "gas_limit": block_data.get("gas_limit"),
        }

        return self.add_item(
            package_id,
            ItemType.BLOCK_DATA,
            content,
            description or f"Block {block_data.get('number')} on {chain.value}",
        )

    def seal_package(self, package_id: str) -> EvidencePackage:
        """Seal a package (makes it immutable)."""
        package = self._packages.get(package_id)
        if not package:
            raise ValueError(f"Package not found: {package_id}")

        if package.is_sealed:
            raise ValueError("Package is already sealed")

        # Calculate final hash
        package.content_hash = self._calculate_package_hash(package)

        # Seal
        package.is_sealed = True
        package.sealed_at = datetime.now(UTC)
        package.updated_at = datetime.now(UTC)

        # Add to hash chain
        self._hash_chain.append(package.content_hash)

        return package

    def verify_package(self, package_id: str) -> dict[str, Any]:
        """Verify package integrity."""
        package = self._packages.get(package_id)
        if not package:
            raise ValueError(f"Package not found: {package_id}")

        verification_result = {
            "package_id": package_id,
            "is_sealed": package.is_sealed,
            "item_count": len(package.items),
            "items_verified": 0,
            "items_failed": 0,
            "package_hash_valid": False,
            "overall_status": VerificationStatus.UNVERIFIED,
        }

        # Verify each item
        for item in package.items:
            content_str = json.dumps(item.content, sort_keys=True, default=str)
            computed_hash = hashlib.sha256(content_str.encode()).hexdigest()

            if computed_hash == item.content_hash:
                verification_result["items_verified"] += 1
            else:
                verification_result["items_failed"] += 1

        # Verify package hash
        computed_package_hash = self._calculate_package_hash(package)
        verification_result["package_hash_valid"] = (
            computed_package_hash == package.content_hash
        )

        # Determine overall status
        if (
            verification_result["items_failed"] == 0
            and verification_result["package_hash_valid"]
            and package.is_sealed
        ):
            verification_result["overall_status"] = VerificationStatus.VERIFIED
            package.verification_status = VerificationStatus.VERIFIED
            package.verified_at = datetime.now(UTC)
        elif (
            verification_result["items_failed"] > 0
            or not verification_result["package_hash_valid"]
        ):
            verification_result["overall_status"] = VerificationStatus.TAMPERED
            package.verification_status = VerificationStatus.TAMPERED
        else:
            verification_result["overall_status"] = VerificationStatus.UNVERIFIED

        return verification_result

    def get_package(self, package_id: str) -> EvidencePackage | None:
        """Get a package by ID."""
        return self._packages.get(package_id)

    def get_packages_for_case(self, case_id: str) -> list[EvidencePackage]:
        """Get all packages for a case."""
        package_ids = self._case_index.get(case_id, [])
        return [self._packages[pid] for pid in package_ids if pid in self._packages]

    def get_packages_for_finding(self, finding_id: str) -> list[EvidencePackage]:
        """Get all packages for a finding."""
        package_ids = self._finding_index.get(finding_id, [])
        return [self._packages[pid] for pid in package_ids if pid in self._packages]

    def export_package(
        self,
        package_id: str,
        export_format: ReportFormat = ReportFormat.JSON,
    ) -> dict[str, Any]:
        """Export a package in the specified format."""
        package = self._packages.get(package_id)
        if not package:
            raise ValueError(f"Package not found: {package_id}")

        if export_format == ReportFormat.JSON:
            return self._export_json(package)
        elif export_format == ReportFormat.HTML:
            return self._export_html(package)
        elif export_format == ReportFormat.CSV:
            return self._export_csv(package)
        else:
            return self._export_json(package)

    def get_statistics(self) -> dict[str, Any]:
        """Get evidence service statistics."""
        packages = list(self._packages.values())

        if not packages:
            return {"total_packages": 0}

        # Count by type
        by_type = {}
        for pkg in packages:
            pkg_type = pkg.package_type.value
            by_type[pkg_type] = by_type.get(pkg_type, 0) + 1

        # Count by status
        by_status = {}
        for pkg in packages:
            status = pkg.verification_status.value
            by_status[status] = by_status.get(status, 0) + 1

        # Count sealed vs unsealed
        sealed_count = sum(1 for pkg in packages if pkg.is_sealed)

        # Total items
        total_items = sum(len(pkg.items) for pkg in packages)

        return {
            "total_packages": len(packages),
            "sealed_count": sealed_count,
            "unsealed_count": len(packages) - sealed_count,
            "total_items": total_items,
            "by_type": by_type,
            "by_status": by_status,
            "hash_chain_length": len(self._hash_chain),
        }

    def _calculate_package_hash(self, package: EvidencePackage) -> str:
        """Calculate SHA-256 hash of package content."""
        # Create a deterministic representation
        content = {
            "package_id": package.package_id,
            "case_id": package.case_id,
            "package_type": package.package_type.value,
            "items": [
                {
                    "item_id": item.item_id,
                    "item_type": item.item_type.value,
                    "content_hash": item.content_hash,
                }
                for item in package.items
            ],
            "created_by": package.created_by,
            "created_at": package.created_at.isoformat(),
        }

        content_str = json.dumps(content, sort_keys=True)
        return hashlib.sha256(content_str.encode()).hexdigest()

    def _export_json(self, package: EvidencePackage) -> dict[str, Any]:
        """Export package as JSON."""
        return {
            "format": "json",
            "package_id": package.package_id,
            "case_id": package.case_id,
            "package_type": package.package_type.value,
            "title": package.title,
            "description": package.description,
            "finding_id": package.finding_id,
            "content_hash": package.content_hash,
            "is_sealed": package.is_sealed,
            "sealed_at": package.sealed_at.isoformat() if package.sealed_at else None,
            "verification_status": package.verification_status.value,
            "created_by": package.created_by,
            "created_at": package.created_at.isoformat(),
            "items": [
                {
                    "item_id": item.item_id,
                    "item_type": item.item_type.value,
                    "content": item.content,
                    "content_hash": item.content_hash,
                    "description": item.description,
                    "created_at": item.created_at.isoformat(),
                }
                for item in package.items
            ],
            "tags": package.tags,
            "metadata": package.metadata,
        }

    def _export_html(self, package: EvidencePackage) -> dict[str, Any]:
        """Export package as HTML."""
        html_content = f"""<!DOCTYPE html>
<html>
<head>
    <title>Evidence Package: {package.package_id}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        .header {{ background: #f5f5f5; padding: 20px; border-radius: 5px; }}
        .item {{ border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }}
        .hash {{ font-family: monospace; font-size: 12px; color: #666; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background: #f5f5f5; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Evidence Package</h1>
        <p><strong>Package ID:</strong> {package.package_id}</p>
        <p><strong>Case ID:</strong> {package.case_id}</p>
        <p><strong>Type:</strong> {package.package_type.value}</p>
        <p><strong>Status:</strong> {package.verification_status.value}</p>
        <p><strong>Sealed:</strong> {"Yes" if package.is_sealed else "No"}</p>
    </div>

    <h2>Items ({len(package.items)})</h2>
"""

        for item in package.items:
            html_content += f"""
    <div class="item">
        <h3>{item.item_type.value}: {item.description or "No description"}</h3>
        <p class="hash">Hash: {item.content_hash}</p>
        <pre>{json.dumps(item.content, indent=2)}</pre>
    </div>
"""

        html_content += f"""
    <div class="header">
        <h2>Integrity</h2>
        <p class="hash">Package Hash: {package.content_hash}</p>
        <p>Created: {package.created_at.isoformat()}</p>
        <p>Created By: {package.created_by}</p>
    </div>
</body>
</html>"""

        return {
            "format": "html",
            "content": html_content,
            "package_id": package.package_id,
        }

    def _export_csv(self, package: EvidencePackage) -> dict[str, Any]:
        """Export package as CSV."""
        csv_rows = ["item_id,item_type,description,content_hash,created_at"]

        for item in package.items:
            csv_rows.append(
                f"{item.item_id},{item.item_type.value},"
                f'"{item.description or ""}",{item.content_hash},'
                f"{item.created_at.isoformat()}"
            )

        return {
            "format": "csv",
            "content": "\n".join(csv_rows),
            "package_id": package.package_id,
        }
