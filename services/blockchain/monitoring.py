"""Chain health monitoring service.

Provides monitoring, alerting, and metrics for blockchain integrations.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, UTC
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from .base import ChainAdapter, ChainHealth, ChainType


class AlertSeverity(StrEnum):
    """Alert severity levels."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class ChainAlert(BaseModel):
    """Chain health alert."""

    chain: ChainType
    severity: AlertSeverity
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    details: dict[str, Any] = {}


class ChainMetrics(BaseModel):
    """Chain performance metrics."""

    chain: ChainType
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Block metrics
    current_block: int = 0
    blocks_per_minute: float = 0.0
    avg_block_time: float = 0.0

    # Sync metrics
    lag_seconds: int = 0
    lag_blocks: int = 0
    sync_status: str = "unknown"

    # Transaction metrics
    tx_per_minute: float = 0.0
    avg_tx_value: float = 0.0

    # Error metrics
    error_rate: float = 0.0
    last_error: str | None = None


class ChainMonitor:
    """Monitors chain health and generates alerts."""

    def __init__(self):
        self._adapters: dict[ChainType, ChainAdapter] = {}
        self._alerts: list[ChainAlert] = []
        self._metrics_history: dict[ChainType, list[ChainMetrics]] = {}
        self._alert_callbacks: list[Callable[[ChainAlert], None]] = []

        # Thresholds
        self._lag_warning_seconds = 300  # 5 minutes
        self._lag_critical_seconds = 3600  # 1 hour
        self._error_rate_warning = 0.1  # 10%
        self._error_rate_critical = 0.5  # 50%

    def register_adapter(self, chain: ChainType, adapter: ChainAdapter) -> None:
        """Register a chain adapter for monitoring."""
        self._adapters[chain] = adapter
        self._metrics_history[chain] = []
        print(f"Registered adapter for {chain.value}")

    def add_alert_callback(self, callback: Callable[[ChainAlert], None]) -> None:
        """Add a callback for alert notifications."""
        self._alert_callbacks.append(callback)

    async def check_chain_health(self, chain: ChainType) -> ChainHealth:
        """Check health of a specific chain."""
        adapter = self._adapters.get(chain)
        if not adapter:
            return ChainHealth(
                chain=chain,
                is_healthy=False,
                block_height=0,
                block_timestamp=datetime.now(UTC),
                sync_status="error",
                lag_seconds=-1,
                error_message=f"No adapter registered for {chain.value}",
            )

        try:
            health = await adapter.get_chain_health()

            # Record metrics
            metrics = ChainMetrics(
                chain=chain,
                current_block=health.block_height,
                lag_seconds=health.lag_seconds,
                sync_status=health.sync_status,
            )
            self._metrics_history[chain].append(metrics)

            # Check for alerts
            self._check_alerts(health)

            return health

        except Exception as e:
            alert = ChainAlert(
                chain=chain,
                severity=AlertSeverity.CRITICAL,
                message=f"Health check failed: {e!s}",
                details={"error": str(e)},
            )
            self._trigger_alert(alert)

            return ChainHealth(
                chain=chain,
                is_healthy=False,
                block_height=0,
                block_timestamp=datetime.now(UTC),
                sync_status="error",
                lag_seconds=-1,
                error_message=str(e),
            )

    async def check_all_chains(self) -> dict[ChainType, ChainHealth]:
        """Check health of all registered chains."""
        results = {}

        for chain in self._adapters:
            results[chain] = await self.check_chain_health(chain)

        return results

    def _check_alerts(self, health: ChainHealth) -> None:
        """Check health status and generate alerts if needed."""
        chain = health.chain

        # Check lag
        if health.lag_seconds > self._lag_critical_seconds:
            alert = ChainAlert(
                chain=chain,
                severity=AlertSeverity.CRITICAL,
                message=f"Chain {chain.value} is critically behind: {health.lag_seconds}s lag",
                details={
                    "lag_seconds": health.lag_seconds,
                    "block_height": health.block_height,
                    "block_timestamp": health.block_timestamp.isoformat(),
                },
            )
            self._trigger_alert(alert)

        elif health.lag_seconds > self._lag_warning_seconds:
            alert = ChainAlert(
                chain=chain,
                severity=AlertSeverity.WARNING,
                message=f"Chain {chain.value} is lagging: {health.lag_seconds}s",
                details={
                    "lag_seconds": health.lag_seconds,
                    "block_height": health.block_height,
                },
            )
            self._trigger_alert(alert)

        # Check sync status
        if health.sync_status == "error":
            alert = ChainAlert(
                chain=chain,
                severity=AlertSeverity.CRITICAL,
                message=f"Chain {chain.value} sync error: {health.error_message}",
                details={"error": health.error_message},
            )
            self._trigger_alert(alert)

    def _trigger_alert(self, alert: ChainAlert) -> None:
        """Trigger an alert and notify callbacks."""
        self._alerts.append(alert)

        # Call registered callbacks
        for callback in self._alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                print(f"Alert callback error: {e}")

        # Log alert
        print(f"[{alert.severity.value.upper()}] {alert.chain.value}: {alert.message}")

    def get_metrics_history(
        self,
        chain: ChainType,
        limit: int = 100,
    ) -> list[ChainMetrics]:
        """Get metrics history for a chain."""
        history = self._metrics_history.get(chain, [])
        return history[-limit:]

    def get_recent_alerts(
        self,
        chain: ChainType | None = None,
        severity: AlertSeverity | None = None,
        limit: int = 50,
    ) -> list[ChainAlert]:
        """Get recent alerts with optional filters."""
        alerts = self._alerts

        if chain:
            alerts = [a for a in alerts if a.chain == chain]

        if severity:
            alerts = [a for a in alerts if a.severity == severity]

        # Sort by timestamp descending
        alerts.sort(key=lambda a: a.timestamp, reverse=True)

        return alerts[:limit]

    def get_dashboard_data(self) -> dict[str, Any]:
        """Get dashboard data for all chains."""
        dashboard = {
            "chains": {},
            "alerts_summary": {
                "total": len(self._alerts),
                "critical": len(
                    [a for a in self._alerts if a.severity == AlertSeverity.CRITICAL]
                ),
                "warning": len(
                    [a for a in self._alerts if a.severity == AlertSeverity.WARNING]
                ),
                "info": len(
                    [a for a in self._alerts if a.severity == AlertSeverity.INFO]
                ),
            },
            "timestamp": datetime.now(UTC).isoformat(),
        }

        for chain, history in self._metrics_history.items():
            if history:
                latest = history[-1]
                dashboard["chains"][chain.value] = {
                    "current_block": latest.current_block,
                    "lag_seconds": latest.lag_seconds,
                    "sync_status": latest.sync_status,
                    "is_healthy": latest.sync_status == "synced",
                    "metrics_count": len(history),
                }

        return dashboard

    async def start_monitoring(self, interval_seconds: int = 60) -> None:
        """Start continuous monitoring."""
        print(f"Starting chain monitoring (interval: {interval_seconds}s)")

        while True:
            try:
                await self.check_all_chains()
            except Exception as e:
                print(f"Monitoring error: {e}")

            await asyncio.sleep(interval_seconds)


class MetricsCollector:
    """Collects and stores metrics for Prometheus."""

    def __init__(self):
        self._counters: dict[str, int] = {}
        self._gauges: dict[str, float] = {}
        self._histograms: dict[str, list[float]] = {}

    def increment_counter(self, name: str, value: int = 1) -> None:
        """Increment a counter."""
        self._counters[name] = self._counters.get(name, 0) + value

    def set_gauge(self, name: str, value: float) -> None:
        """Set a gauge value."""
        self._gauges[name] = value

    def observe_histogram(self, name: str, value: float) -> None:
        """Record a histogram observation."""
        if name not in self._histograms:
            self._histograms[name] = []
        self._histograms[name].append(value)

    def get_metrics(self) -> str:
        """Export metrics in Prometheus format."""
        lines = []

        # Counters
        for name, value in self._counters.items():
            lines.append(f"# HELP {name} Counter metric")
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {value}")

        # Gauges
        for name, value in self._gauges.items():
            lines.append(f"# HELP {name} Gauge metric")
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name} {value}")

        # Histograms
        for name, values in self._histograms.items():
            lines.append(f"# HELP {name} Histogram metric")
            lines.append(f"# TYPE {name} histogram")

            if values:
                sorted_values = sorted(values)
                lines.append(f"{name}_count {len(values)}")
                lines.append(f"{name}_sum {sum(values)}")
                lines.append(
                    f'{name}_bucket{{le="0.1"}} {len([v for v in sorted_values if v <= 0.1])}'
                )
                lines.append(
                    f'{name}_bucket{{le="0.5"}} {len([v for v in sorted_values if v <= 0.5])}'
                )
                lines.append(
                    f'{name}_bucket{{le="1"}} {len([v for v in sorted_values if v <= 1])}'
                )
                lines.append(
                    f'{name}_bucket{{le="5"}} {len([v for v in sorted_values if v <= 5])}'
                )
                lines.append(
                    f'{name}_bucket{{le="10"}} {len([v for v in sorted_values if v <= 10])}'
                )
                lines.append(f'{name}_bucket{{le="+Inf"}} {len(values)}')

        return "\n".join(lines)
