"""Data Freshness Monitoring Service.

Monitors blockchain data freshness, detects staleness, and provides
alerts for operations dashboard.
"""

from __future__ import annotations

from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from ..blockchain.base import ChainType
import contextlib


class FreshnessStatus(StrEnum):
    """Data freshness status."""

    FRESH = "fresh"
    ACCEPTABLE = "acceptable"
    STALE = "stale"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class DataSourceType(StrEnum):
    """Data source types."""

    BLOCKCHAIN_NODE = "blockchain_node"
    EXPLORER_API = "explorer_api"
    GRAPH_DATABASE = "graph_database"
    CACHE = "cache"
    INDEX = "index"


class FreshnessMetric(BaseModel):
    """Freshness metric for a data source."""

    source_id: str
    source_type: DataSourceType
    chain: ChainType

    # Timestamps
    last_updated: datetime
    last_successful_sync: datetime | None = None
    next_expected_sync: datetime | None = None

    # Status
    status: FreshnessStatus = FreshnessStatus.UNKNOWN

    # Lag metrics
    lag_seconds: int = 0
    lag_blocks: int = 0
    current_block: int | None = None
    synced_block: int | None = None

    # Thresholds (in seconds)
    fresh_threshold: int = 300  # 5 minutes
    acceptable_threshold: int = 3600  # 1 hour
    stale_threshold: int = 86400  # 24 hours

    # Metadata
    metadata: dict[str, Any] = {}


class FreshnessAlert(BaseModel):
    """Freshness alert."""

    alert_id: str
    source_id: str
    chain: ChainType
    status: FreshnessStatus
    message: str
    lag_seconds: int
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    acknowledged: bool = False
    metadata: dict[str, Any] = {}


class FreshnessMonitor:
    """Monitors data freshness across blockchain data sources."""

    def __init__(self):
        self._metrics: dict[str, FreshnessMetric] = {}
        self._alerts: list[FreshnessAlert] = []
        self._alert_callbacks: list[Any] = []

        # Default thresholds per chain
        self._chain_thresholds: dict[ChainType, dict[str, int]] = {
            ChainType.ETHEREUM: {
                "fresh": 300,  # 5 min (12s block time)
                "acceptable": 1800,  # 30 min
                "stale": 3600,  # 1 hour
            },
            ChainType.BITCOIN: {
                "fresh": 600,  # 10 min (10 min block time)
                "acceptable": 3600,  # 1 hour
                "stale": 7200,  # 2 hours
            },
            ChainType.TRON: {
                "fresh": 180,  # 3 min (3s block time)
                "acceptable": 900,  # 15 min
                "stale": 1800,  # 30 min
            },
            ChainType.BNB: {
                "fresh": 180,  # 3 min (3s block time)
                "acceptable": 900,  # 15 min
                "stale": 1800,  # 30 min
            },
            ChainType.SOLANA: {
                "fresh": 60,  # 1 min (400ms slot time)
                "acceptable": 300,  # 5 min
                "stale": 600,  # 10 min
            },
            ChainType.POLYGON: {
                "fresh": 180,  # 3 min (2s block time)
                "acceptable": 900,  # 15 min
                "stale": 1800,  # 30 min
            },
        }

    def register_source(
        self,
        source_id: str,
        source_type: DataSourceType,
        chain: ChainType,
        custom_thresholds: dict[str, int] | None = None,
    ) -> FreshnessMetric:
        """Register a data source for monitoring."""
        thresholds = self._chain_thresholds.get(chain, {})
        if custom_thresholds:
            thresholds.update(custom_thresholds)

        metric = FreshnessMetric(
            source_id=source_id,
            source_type=source_type,
            chain=chain,
            last_updated=datetime.now(UTC),
            fresh_threshold=thresholds.get("fresh", 300),
            acceptable_threshold=thresholds.get("acceptable", 3600),
            stale_threshold=thresholds.get("stale", 86400),
        )

        self._metrics[source_id] = metric
        return metric

    def update_source(
        self,
        source_id: str,
        current_block: int,
        synced_block: int | None = None,
    ) -> FreshnessMetric:
        """Update data source with latest block info."""
        metric = self._metrics.get(source_id)
        if not metric:
            raise ValueError(f"Source not found: {source_id}")

        now = datetime.now(UTC)
        metric.last_updated = now
        metric.last_successful_sync = now
        metric.current_block = current_block
        metric.synced_block = synced_block or current_block

        # Calculate lag
        metric.lag_blocks = max(0, current_block - metric.synced_block)

        # Estimate lag in seconds (simplified)
        if metric.chain == ChainType.ETHEREUM:
            metric.lag_seconds = metric.lag_blocks * 12
        elif metric.chain == ChainType.BITCOIN:
            metric.lag_seconds = metric.lag_blocks * 600
        elif metric.chain in [ChainType.TRON, ChainType.BNB]:
            metric.lag_seconds = metric.lag_blocks * 3
        elif metric.chain == ChainType.SOLANA:
            metric.lag_seconds = metric.lag_blocks * 1
        elif metric.chain == ChainType.POLYGON:
            metric.lag_seconds = metric.lag_blocks * 2
        else:
            metric.lag_seconds = metric.lag_blocks * 12  # Default

        # Determine status
        metric.status = self._determine_status(metric)

        # Check for alerts
        self._check_alerts(metric)

        return metric

    def update_source_timestamp(
        self,
        source_id: str,
        last_updated: datetime,
    ) -> FreshnessMetric:
        """Update data source with timestamp."""
        metric = self._metrics.get(source_id)
        if not metric:
            raise ValueError(f"Source not found: {source_id}")

        metric.last_updated = last_updated
        metric.last_successful_sync = last_updated

        # Calculate time-based lag
        now = datetime.now(UTC)
        metric.lag_seconds = int((now - last_updated).total_seconds())

        # Determine status based on time lag
        if metric.lag_seconds <= metric.fresh_threshold:
            metric.status = FreshnessStatus.FRESH
        elif metric.lag_seconds <= metric.acceptable_threshold:
            metric.status = FreshnessStatus.ACCEPTABLE
        elif metric.lag_seconds <= metric.stale_threshold:
            metric.status = FreshnessStatus.STALE
        else:
            metric.status = FreshnessStatus.CRITICAL

        # Check for alerts
        self._check_alerts(metric)

        return metric

    def get_source(self, source_id: str) -> FreshnessMetric | None:
        """Get freshness metric for a source."""
        return self._metrics.get(source_id)

    def get_chain_overview(self, chain: ChainType) -> dict[str, Any]:
        """Get freshness overview for a chain."""
        chain_metrics = [m for m in self._metrics.values() if m.chain == chain]

        if not chain_metrics:
            return {
                "chain": chain.value,
                "sources": 0,
                "overall_status": FreshnessStatus.UNKNOWN.value,
            }

        # Determine overall status (worst status wins)
        status_order = {
            FreshnessStatus.FRESH: 0,
            FreshnessStatus.ACCEPTABLE: 1,
            FreshnessStatus.STALE: 2,
            FreshnessStatus.CRITICAL: 3,
            FreshnessStatus.UNKNOWN: 4,
        }

        worst_status = max(chain_metrics, key=lambda m: status_order.get(m.status, 4))

        return {
            "chain": chain.value,
            "sources": len(chain_metrics),
            "overall_status": worst_status.status.value,
            "max_lag_seconds": max(m.lag_seconds for m in chain_metrics),
            "avg_lag_seconds": sum(m.lag_seconds for m in chain_metrics)
            // len(chain_metrics),
            "sources_by_status": {
                status.value: len([m for m in chain_metrics if m.status == status])
                for status in FreshnessStatus
            },
        }

    def get_global_overview(self) -> dict[str, Any]:
        """Get global freshness overview across all chains."""
        if not self._metrics:
            return {"total_sources": 0, "chains": {}}

        # Group by chain
        chains = {}
        for metric in self._metrics.values():
            chain = metric.chain.value
            if chain not in chains:
                chains[chain] = []
            chains[chain].append(metric)

        # Calculate overall status
        all_statuses = [m.status for m in self._metrics.values()]
        critical_count = all_statuses.count(FreshnessStatus.CRITICAL)
        stale_count = all_statuses.count(FreshnessStatus.STALE)

        if critical_count > 0:
            overall = FreshnessStatus.CRITICAL
        elif stale_count > 0:
            overall = FreshnessStatus.STALE
        elif FreshnessStatus.ACCEPTABLE in all_statuses:
            overall = FreshnessStatus.ACCEPTABLE
        else:
            overall = FreshnessStatus.FRESH

        return {
            "total_sources": len(self._metrics),
            "overall_status": overall.value,
            "chains": {
                chain: self.get_chain_overview(ChainType(chain)) for chain in chains
            },
            "alerts_count": len([a for a in self._alerts if not a.acknowledged]),
            "timestamp": datetime.now(UTC).isoformat(),
        }

    def get_alerts(
        self,
        chain: ChainType | None = None,
        status: FreshnessStatus | None = None,
        unacknowledged_only: bool = False,
        limit: int = 50,
    ) -> list[FreshnessAlert]:
        """Get freshness alerts."""
        alerts = self._alerts

        if chain:
            alerts = [a for a in alerts if a.chain == chain]

        if status:
            alerts = [a for a in alerts if a.status == status]

        if unacknowledged_only:
            alerts = [a for a in alerts if not a.acknowledged]

        # Sort by timestamp descending
        alerts.sort(key=lambda a: a.timestamp, reverse=True)

        return alerts[:limit]

    def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge an alert."""
        for alert in self._alerts:
            if alert.alert_id == alert_id:
                alert.acknowledged = True
                return True
        return False

    def get_statistics(self) -> dict[str, Any]:
        """Get freshness monitoring statistics."""
        metrics = list(self._metrics.values())

        if not metrics:
            return {"total_sources": 0}

        # Count by status
        by_status = {}
        for m in metrics:
            status = m.status.value
            by_status[status] = by_status.get(status, 0) + 1

        # Count by chain
        by_chain = {}
        for m in metrics:
            chain = m.chain.value
            by_chain[chain] = by_chain.get(chain, 0) + 1

        # Lag statistics
        lag_values = [m.lag_seconds for m in metrics]

        return {
            "total_sources": len(metrics),
            "by_status": by_status,
            "by_chain": by_chain,
            "max_lag_seconds": max(lag_values),
            "avg_lag_seconds": sum(lag_values) // len(lag_values),
            "total_alerts": len(self._alerts),
            "unacknowledged_alerts": len(
                [a for a in self._alerts if not a.acknowledged]
            ),
        }

    def _determine_status(self, metric: FreshnessMetric) -> FreshnessStatus:
        """Determine freshness status based on lag."""
        if metric.lag_seconds <= metric.fresh_threshold:
            return FreshnessStatus.FRESH
        elif metric.lag_seconds <= metric.acceptable_threshold:
            return FreshnessStatus.ACCEPTABLE
        elif metric.lag_seconds <= metric.stale_threshold:
            return FreshnessStatus.STALE
        else:
            return FreshnessStatus.CRITICAL

    def _check_alerts(self, metric: FreshnessMetric) -> None:
        """Check if alerts need to be generated."""
        import uuid

        # Only alert on status changes to STALE or CRITICAL
        if metric.status in [FreshnessStatus.STALE, FreshnessStatus.CRITICAL]:
            # Check if we already have an active alert for this source
            existing_alert = next(
                (
                    a
                    for a in self._alerts
                    if a.source_id == metric.source_id and not a.acknowledged
                ),
                None,
            )

            if not existing_alert:
                alert = FreshnessAlert(
                    alert_id=str(uuid.uuid4()),
                    source_id=metric.source_id,
                    chain=metric.chain,
                    status=metric.status,
                    message=f"Data source {metric.source_id} is {metric.status.value}: {metric.lag_seconds}s lag",
                    lag_seconds=metric.lag_seconds,
                )

                self._alerts.append(alert)

                # Trigger callbacks
                for callback in self._alert_callbacks:
                    with contextlib.suppress(Exception):
                        callback(alert)
