"""VASP Attribution Service.

Provides versioned known-address/cluster registry, ranked VASP candidates
with confidence scoring, and adjudication feedback loop.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from .base import ChainType


class EntityRiskCategory(StrEnum):
    """Entity risk categories."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class AttributionStatus(StrEnum):
    """Attribution status."""

    PENDING = "pending"
    CONFIRMED = "confirmed"
    DISPUTED = "disputed"
    REJECTED = "rejected"


class ConfidenceFactor(BaseModel):
    """Individual confidence factor."""

    factor_type: (
        str  # "address_match", "cluster_proximity", "behavioral", "label_match"
    )
    weight: float
    value: float  # 0.0 to 1.0
    description: str


class KnownAddress(BaseModel):
    """Known address entry in the registry."""

    address: str
    chain: ChainType
    entity_name: str
    entity_type: str  # "exchange", "mixer", "defi", "bridge", "other"
    jurisdiction: str | None = None
    risk_category: EntityRiskCategory = EntityRiskCategory.UNKNOWN
    confidence: float = 1.0  # How confident we are in this attribution
    source: str = "manual"  # "manual", "verified", "community", "ml"
    tags: list[str] = []
    first_seen: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_verified: datetime | None = None
    version: int = 1
    is_active: bool = True
    metadata: dict[str, Any] = {}


class AddressCluster(BaseModel):
    """Cluster of related addresses."""

    cluster_id: str
    name: str
    addresses: list[str]
    chain: ChainType
    entity_name: str | None = None
    entity_type: str | None = None
    risk_score: float = 0.0
    confidence: float = 0.0
    creation_method: str = "manual"  # "manual", "graph_analysis", "behavioral"
    version: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = {}


class VASPCandidate(BaseModel):
    """VASP attribution candidate."""

    candidate_id: str
    address: str
    chain: ChainType
    entity_name: str
    entity_type: str
    confidence: float
    confidence_factors: list[ConfidenceFactor] = []
    supporting_evidence: list[str] = []
    status: AttributionStatus = AttributionStatus.PENDING
    rank: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AdjudicationRecord(BaseModel):
    """Adjudication feedback record."""

    adjudication_id: str
    candidate_id: str
    address: str
    chain: ChainType
    decision: AttributionStatus
    decided_by: str  # user_id or "system"
    reason: str
    confidence_override: float | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = {}


class VersionedRegistry:
    """Versioned known-address/cluster registry."""

    def __init__(self):
        self._addresses: dict[str, dict[int, KnownAddress]] = (
            {}
        )  # address -> {version: entry}
        self._clusters: dict[str, dict[int, AddressCluster]] = (
            {}
        )  # cluster_id -> {version: entry}
        self._address_index: dict[str, str] = {}  # address -> latest cluster_id
        self._chain_index: dict[ChainType, set[str]] = {}  # chain -> set of addresses
        self._entity_index: dict[str, set[str]] = {}  # entity_name -> set of addresses

    def add_address(self, entry: KnownAddress) -> KnownAddress:
        """Add or update a known address."""
        key = f"{entry.chain.value}:{entry.address.lower()}"

        if key in self._addresses:
            # Version increment
            versions = self._addresses[key]
            latest_version = max(versions.keys())
            entry.version = latest_version + 1
            versions[entry.version] = entry
        else:
            self._addresses[key] = {1: entry}
            entry.version = 1

        # Update indexes
        chain = entry.chain
        if chain not in self._chain_index:
            self._chain_index[chain] = set()
        self._chain_index[chain].add(entry.address.lower())

        if entry.entity_name not in self._entity_index:
            self._entity_index[entry.entity_name] = set()
        self._entity_index[entry.entity_name].add(entry.address.lower())

        return entry

    def get_address(
        self,
        address: str,
        chain: ChainType,
        version: int | None = None,
    ) -> KnownAddress | None:
        """Get a known address entry."""
        key = f"{chain.value}:{address.lower()}"
        versions = self._addresses.get(key)

        if not versions:
            return None

        if version is not None:
            return versions.get(version)

        # Return latest version
        latest_version = max(versions.keys())
        return versions[latest_version]

    def get_address_history(self, address: str, chain: ChainType) -> list[KnownAddress]:
        """Get all versions of an address entry."""
        key = f"{chain.value}:{address.lower()}"
        versions = self._addresses.get(key, {})
        return sorted(versions.values(), key=lambda e: e.version)

    def deactivate_address(self, address: str, chain: ChainType) -> bool:
        """Deactivate a known address."""
        key = f"{chain.value}:{address.lower()}"
        versions = self._addresses.get(key)

        if not versions:
            return False

        latest_version = max(versions.keys())
        entry = versions[latest_version]
        entry.is_active = False
        entry.version += 1
        versions[entry.version] = entry

        return True

    def add_cluster(self, cluster: AddressCluster) -> AddressCluster:
        """Add or update an address cluster."""
        if cluster.cluster_id in self._clusters:
            versions = self._clusters[cluster.cluster_id]
            latest_version = max(versions.keys())
            cluster.version = latest_version + 1
            versions[cluster.version] = cluster
        else:
            self._clusters[cluster.cluster_id] = {1: cluster}
            cluster.version = 1

        # Update address index
        for addr in cluster.addresses:
            self._address_index[addr.lower()] = cluster.cluster_id

        return cluster

    def get_cluster(
        self, cluster_id: str, version: int | None = None
    ) -> AddressCluster | None:
        """Get a cluster."""
        versions = self._clusters.get(cluster_id)

        if not versions:
            return None

        if version is not None:
            return versions.get(version)

        latest_version = max(versions.keys())
        return versions[latest_version]

    def get_cluster_for_address(self, address: str) -> AddressCluster | None:
        """Get the cluster containing an address."""
        cluster_id = self._address_index.get(address.lower())
        if cluster_id:
            return self.get_cluster(cluster_id)
        return None

    def search_by_entity(self, entity_name: str) -> list[KnownAddress]:
        """Search addresses by entity name."""
        addresses = self._entity_index.get(entity_name, set())
        results = []

        for addr in addresses:
            # Find the entry across all chains
            for key, versions in self._addresses.items():
                if key.endswith(f":{addr}"):
                    latest = max(versions.keys())
                    entry = versions[latest]
                    if entry.is_active and entry.entity_name == entity_name:
                        results.append(entry)

        return results

    def get_all_active(self, chain: ChainType | None = None) -> list[KnownAddress]:
        """Get all active known addresses."""
        results = []

        for _key, versions in self._addresses.items():
            latest = max(versions.keys())
            entry = versions[latest]

            if not entry.is_active:
                continue

            if chain and entry.chain != chain:
                continue

            results.append(entry)

        return results

    def get_statistics(self) -> dict[str, Any]:
        """Get registry statistics."""
        total_addresses = len(self._addresses)
        active_addresses = sum(
            1
            for versions in self._addresses.values()
            if versions[max(versions.keys())].is_active
        )
        total_clusters = len(self._clusters)

        # By chain
        by_chain = {}
        for chain, addrs in self._chain_index.items():
            by_chain[chain.value] = len(addrs)

        # By entity type
        by_entity_type = {}
        for versions in self._addresses.values():
            latest = max(versions.keys())
            entry = versions[latest]
            if entry.is_active:
                by_entity_type[entry.entity_type] = (
                    by_entity_type.get(entry.entity_type, 0) + 1
                )

        return {
            "total_addresses": total_addresses,
            "active_addresses": active_addresses,
            "total_clusters": total_clusters,
            "by_chain": by_chain,
            "by_entity_type": by_entity_type,
        }


class ConfidenceScorer:
    """Calculates confidence scores for VASP attributions."""

    def __init__(self):
        # Default factor weights
        self._factor_weights: dict[str, float] = {
            "address_match": 0.35,  # Direct address match in registry
            "cluster_proximity": 0.25,  # Close to known entity in graph
            "behavioral": 0.20,  # Transaction pattern matches entity
            "label_match": 0.15,  # On-chain label matches
            "temporal": 0.05,  # Timing patterns
        }

        # Confidence thresholds
        self._high_confidence_threshold = 0.8
        self._medium_confidence_threshold = 0.5
        self._low_confidence_threshold = 0.3

    def calculate_confidence(
        self,
        address: str,
        chain: ChainType,
        registry: VersionedRegistry,
        cluster_proximity: float = 0.0,
        behavioral_score: float = 0.0,
        label_score: float = 0.0,
        temporal_score: float = 0.0,
    ) -> tuple[float, list[ConfidenceFactor]]:
        """Calculate confidence score for an address attribution."""
        factors: list[ConfidenceFactor] = []

        # Factor 1: Direct address match
        known = registry.get_address(address, chain)
        address_match_score = 0.0
        if known:
            address_match_score = known.confidence
            factors.append(
                ConfidenceFactor(
                    factor_type="address_match",
                    weight=self._factor_weights["address_match"],
                    value=address_match_score,
                    description=f"Direct match in registry: {known.entity_name}",
                )
            )
        else:
            factors.append(
                ConfidenceFactor(
                    factor_type="address_match",
                    weight=self._factor_weights["address_match"],
                    value=0.0,
                    description="No direct match in registry",
                )
            )

        # Factor 2: Cluster proximity
        factors.append(
            ConfidenceFactor(
                factor_type="cluster_proximity",
                weight=self._factor_weights["cluster_proximity"],
                value=cluster_proximity,
                description=f"Graph proximity score: {cluster_proximity:.2f}",
            )
        )

        # Factor 3: Behavioral similarity
        factors.append(
            ConfidenceFactor(
                factor_type="behavioral",
                weight=self._factor_weights["behavioral"],
                value=behavioral_score,
                description=f"Behavioral pattern score: {behavioral_score:.2f}",
            )
        )

        # Factor 4: Label match
        factors.append(
            ConfidenceFactor(
                factor_type="label_match",
                weight=self._factor_weights["label_match"],
                value=label_score,
                description=f"On-chain label score: {label_score:.2f}",
            )
        )

        # Factor 5: Temporal patterns
        factors.append(
            ConfidenceFactor(
                factor_type="temporal",
                weight=self._factor_weights["temporal"],
                value=temporal_score,
                description=f"Temporal pattern score: {temporal_score:.2f}",
            )
        )

        # Calculate weighted confidence
        confidence = sum(f.weight * f.value for f in factors)

        # Normalize to 0-1
        confidence = min(max(confidence, 0.0), 1.0)

        return confidence, factors

    def rank_candidates(
        self,
        candidates: list[VASPCandidate],
    ) -> list[VASPCandidate]:
        """Rank VASP candidates by confidence."""
        # Sort by confidence (highest first)
        ranked = sorted(candidates, key=lambda c: c.confidence, reverse=True)

        # Assign ranks
        for i, candidate in enumerate(ranked, 1):
            candidate.rank = i

        return ranked

    def get_confidence_label(self, confidence: float) -> str:
        """Get human-readable confidence label."""
        if confidence >= self._high_confidence_threshold:
            return "HIGH"
        elif confidence >= self._medium_confidence_threshold:
            return "MEDIUM"
        elif confidence >= self._low_confidence_threshold:
            return "LOW"
        else:
            return "VERY_LOW"


class AdjudicationEngine:
    """Manages adjudication feedback loop for attributions."""

    def __init__(self):
        self._records: dict[str, AdjudicationRecord] = {}
        self._candidate_index: dict[str, list[str]] = (
            {}
        )  # candidate_id -> [adjudication_ids]
        self._address_index: dict[str, list[str]] = {}  # address -> [adjudication_ids]

        # Learning weights (adjusted based on feedback)
        self._feedback_weights: dict[str, float] = {
            "address_match": 1.0,
            "cluster_proximity": 1.0,
            "behavioral": 1.0,
            "label_match": 1.0,
            "temporal": 1.0,
        }

        # Statistics
        self._total_adjudications = 0
        self._confirmed_count = 0
        self._rejected_count = 0

    def record_adjudication(
        self,
        candidate: VASPCandidate,
        decision: AttributionStatus,
        decided_by: str,
        reason: str,
        confidence_override: float | None = None,
    ) -> AdjudicationRecord:
        """Record an adjudication decision."""
        import uuid

        record = AdjudicationRecord(
            adjudication_id=str(uuid.uuid4()),
            candidate_id=candidate.candidate_id,
            address=candidate.address,
            chain=candidate.chain,
            decision=decision,
            decided_by=decided_by,
            reason=reason,
            confidence_override=confidence_override,
        )

        # Store record
        self._records[record.adjudication_id] = record

        # Update indexes
        if candidate.candidate_id not in self._candidate_index:
            self._candidate_index[candidate.candidate_id] = []
        self._candidate_index[candidate.candidate_id].append(record.adjudication_id)

        addr_key = f"{candidate.chain.value}:{candidate.address.lower()}"
        if addr_key not in self._address_index:
            self._address_index[addr_key] = []
        self._address_index[addr_key].append(record.adjudication_id)

        # Update statistics
        self._total_adjudications += 1
        if decision == AttributionStatus.CONFIRMED:
            self._confirmed_count += 1
            # Boost weights for confirmed factors
            self._update_weights(candidate, boost=True)
        elif decision == AttributionStatus.REJECTED:
            self._rejected_count += 1
            # Reduce weights for rejected factors
            self._update_weights(candidate, boost=False)

        # Update candidate status
        candidate.status = decision
        candidate.updated_at = datetime.now(UTC)

        if confidence_override is not None:
            candidate.confidence = confidence_override

        return record

    def get_adjudication(self, adjudication_id: str) -> AdjudicationRecord | None:
        """Get an adjudication record."""
        return self._records.get(adjudication_id)

    def get_adjudications_for_candidate(
        self, candidate_id: str
    ) -> list[AdjudicationRecord]:
        """Get all adjudications for a candidate."""
        ids = self._candidate_index.get(candidate_id, [])
        return [self._records[cid] for cid in ids if cid in self._records]

    def get_adjudications_for_address(
        self, address: str, chain: ChainType
    ) -> list[AdjudicationRecord]:
        """Get all adjudications for an address."""
        addr_key = f"{chain.value}:{address.lower()}"
        ids = self._address_index.get(addr_key, [])
        return [self._records[cid] for cid in ids if cid in self._records]

    def get_feedback_weights(self) -> dict[str, float]:
        """Get current feedback-adjusted weights."""
        return self._feedback_weights.copy()

    def get_statistics(self) -> dict[str, Any]:
        """Get adjudication statistics."""
        confirmation_rate = (
            self._confirmed_count / self._total_adjudications
            if self._total_adjudications > 0
            else 0.0
        )

        return {
            "total_adjudications": self._total_adjudications,
            "confirmed_count": self._confirmed_count,
            "rejected_count": self._rejected_count,
            "confirmation_rate": round(confirmation_rate, 4),
            "feedback_weights": self._feedback_weights,
        }

    def _update_weights(self, candidate: VASPCandidate, boost: bool) -> None:
        """Update feedback weights based on adjudication."""
        adjustment = 0.1 if boost else -0.1

        for factor in candidate.confidence_factors:
            current_weight = self._feedback_weights.get(factor.factor_type, 1.0)
            new_weight = max(0.1, min(2.0, current_weight + adjustment))
            self._feedback_weights[factor.factor_type] = new_weight


class VASPAttributionService:
    """Main VASP Attribution Service combining all components."""

    def __init__(self):
        self.registry = VersionedRegistry()
        self.scorer = ConfidenceScorer()
        self.adjudication = AdjudicationEngine()
        self._candidates: dict[str, VASPCandidate] = {}
        self._address_candidates: dict[str, list[str]] = {}  # addr -> [candidate_ids]

    def register_known_address(self, entry: KnownAddress) -> KnownAddress:
        """Register a known address in the registry."""
        return self.registry.add_address(entry)

    def attribute_address(
        self,
        address: str,
        chain: ChainType,
        cluster_proximity: float = 0.0,
        behavioral_score: float = 0.0,
        label_score: float = 0.0,
        temporal_score: float = 0.0,
    ) -> VASPCandidate:
        """Create an attribution candidate for an address."""
        import uuid

        # Calculate confidence
        confidence, factors = self.scorer.calculate_confidence(
            address,
            chain,
            self.registry,
            cluster_proximity,
            behavioral_score,
            label_score,
            temporal_score,
        )

        # Determine entity from registry
        known = self.registry.get_address(address, chain)
        entity_name = known.entity_name if known else "Unknown"
        entity_type = known.entity_type if known else "unknown"

        # Create candidate
        candidate = VASPCandidate(
            candidate_id=str(uuid.uuid4()),
            address=address.lower(),
            chain=chain,
            entity_name=entity_name,
            entity_type=entity_type,
            confidence=confidence,
            confidence_factors=factors,
        )

        # Store candidate
        self._candidates[candidate.candidate_id] = candidate

        addr_key = f"{chain.value}:{address.lower()}"
        if addr_key not in self._address_candidates:
            self._address_candidates[addr_key] = []
        self._address_candidates[addr_key].append(candidate.candidate_id)

        return candidate

    def get_top_candidates(
        self,
        address: str,
        chain: ChainType,
        limit: int = 5,
    ) -> list[VASPCandidate]:
        """Get top-ranked VASP candidates for an address."""
        addr_key = f"{chain.value}:{address.lower()}"
        candidate_ids = self._address_candidates.get(addr_key, [])

        candidates = [
            self._candidates[cid] for cid in candidate_ids if cid in self._candidates
        ]

        # Rank and return top N
        ranked = self.scorer.rank_candidates(candidates)
        return ranked[:limit]

    def adjudicate(
        self,
        candidate_id: str,
        decision: AttributionStatus,
        decided_by: str,
        reason: str,
        confidence_override: float | None = None,
    ) -> AdjudicationRecord:
        """Adjudicate an attribution candidate."""
        candidate = self._candidates.get(candidate_id)
        if not candidate:
            raise ValueError(f"Candidate not found: {candidate_id}")

        return self.adjudication.record_adjudication(
            candidate,
            decision,
            decided_by,
            reason,
            confidence_override,
        )

    def get_statistics(self) -> dict[str, Any]:
        """Get comprehensive attribution statistics."""
        return {
            "registry": self.registry.get_statistics(),
            "adjudication": self.adjudication.get_statistics(),
            "total_candidates": len(self._candidates),
            "feedback_weights": self.adjudication.get_feedback_weights(),
        }
