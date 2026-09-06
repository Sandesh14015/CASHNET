/**
 * Non-Functional Requirements (NFR) Monitoring
 * Tracks performance, availability, audit coverage, and evidence reproducibility
 */

import { EventEmitter } from 'events';

export interface PerformanceMetric {
  operationName: string;
  durationMs: number;
  timestamp: Date;
  p95?: number;
  p99?: number;
}

export interface AvailabilityMetric {
  timestamp: Date;
  isAvailable: boolean;
  responseTimeMs: number;
  downtime?: number;
}

export interface AuditMetric {
  timestamp: Date;
  eventType: string;
  userId: string;
  caseId?: string;
  action: string;
  result: 'success' | 'failure';
}

export interface EvidenceReproducibility {
  evidenceId: string;
  timestamp: Date;
  isReproducible: boolean;
  verificationHash: string;
}

export class NFRMonitor extends EventEmitter {
  private performanceMetrics: PerformanceMetric[] = [];
  private availabilityMetrics: AvailabilityMetric[] = [];
  private auditMetrics: AuditMetric[] = [];
  private evidenceReproducibility: EvidenceReproducibility[] = [];
  
  // Configuration targets
  private readonly p95ThresholdMs = 2000; // Address validation
  private readonly traceP95ThresholdMs = 300000; // 5 minutes
  private readonly availabilityTarget = 0.999; // 99.9%
  private readonly auditCoverageTarget = 1.0; // 100%
  private readonly maxComplaintsPerDay = 8000;
  
  constructor() {
    super();
  }

  /**
   * Record a performance metric
   */
  recordPerformance(operationName: string, durationMs: number): void {
    const metric: PerformanceMetric = {
      operationName,
      durationMs,
      timestamp: new Date(),
    };

    this.performanceMetrics.push(metric);
    this.emit('performance', metric);

    // Check if p95 threshold breached
    this.checkPerformanceThresholds(operationName);
  }

  /**
   * Record availability metric
   */
  recordAvailability(isAvailable: boolean, responseTimeMs: number): void {
    const metric: AvailabilityMetric = {
      timestamp: new Date(),
      isAvailable,
      responseTimeMs,
    };

    this.availabilityMetrics.push(metric);
    this.emit('availability', metric);

    // Check availability SLA
    this.checkAvailabilitySLA();
  }

  /**
   * Record an audit event
   */
  recordAuditEvent(
    eventType: string,
    userId: string,
    action: string,
    result: 'success' | 'failure',
    caseId?: string
  ): void {
    const metric: AuditMetric = {
      timestamp: new Date(),
      eventType,
      userId,
      caseId,
      action,
      result,
    };

    this.auditMetrics.push(metric);
    this.emit('audit', metric);

    // Check audit coverage
    this.checkAuditCoverage();
  }

  /**
   * Record evidence reproducibility verification
   */
  recordEvidenceReproducibility(
    evidenceId: string,
    isReproducible: boolean,
    verificationHash: string
  ): void {
    const metric: EvidenceReproducibility = {
      evidenceId,
      timestamp: new Date(),
      isReproducible,
      verificationHash,
    };

    this.evidenceReproducibility.push(metric);
    this.emit('reproducibility', metric);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(operationName?: string): {
    avgDuration: number;
    p50: number;
    p95: number;
    p99: number;
    maxDuration: number;
    minDuration: number;
    count: number;
  } | null {
    const metrics = operationName
      ? this.performanceMetrics.filter(m => m.operationName === operationName)
      : this.performanceMetrics;

    if (metrics.length === 0) return null;

    const durations = metrics.map(m => m.durationMs).sort((a, b) => a - b);

    return {
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: this.percentile(durations, 50),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      count: metrics.length,
    };
  }

  /**
   * Get availability statistics
   */
  getAvailabilityStats(timeWindowMs?: number): {
    uptime: number;
    downtime: number;
    availability: number;
    meetsTarget: boolean;
  } {
    const now = new Date();
    let metrics = this.availabilityMetrics;

    if (timeWindowMs) {
      const cutoff = new Date(now.getTime() - timeWindowMs);
      metrics = metrics.filter(m => m.timestamp >= cutoff);
    }

    if (metrics.length === 0) {
      return {
        uptime: 0,
        downtime: 0,
        availability: 1.0,
        meetsTarget: true,
      };
    }

    const upCount = metrics.filter(m => m.isAvailable).length;
    const availability = upCount / metrics.length;

    return {
      uptime: upCount,
      downtime: metrics.length - upCount,
      availability,
      meetsTarget: availability >= this.availabilityTarget,
    };
  }

  /**
   * Get audit coverage statistics
   */
  getAuditCoverageStats(): {
    totalEvents: number;
    successEvents: number;
    failureEvents: number;
    coverage: number;
    meetsTarget: boolean;
  } {
    const total = this.auditMetrics.length;
    const successEvents = this.auditMetrics.filter(m => m.result === 'success').length;
    const failureEvents = total - successEvents;

    return {
      totalEvents: total,
      successEvents,
      failureEvents,
      coverage: total > 0 ? (successEvents / total) : 0,
      meetsTarget: total > 0,
    };
  }

  /**
   * Get evidence reproducibility statistics
   */
  getReproducibilityStats(): {
    totalEvidence: number;
    reproducible: number;
    irreproducible: number;
    reproducibilityRate: number;
    meetsTarget: boolean;
  } {
    const total = this.evidenceReproducibility.length;
    const reproducible = this.evidenceReproducibility.filter(m => m.isReproducible).length;

    return {
      totalEvidence: total,
      reproducible,
      irreproducible: total - reproducible,
      reproducibilityRate: total > 0 ? (reproducible / total) : 1.0,
      meetsTarget: reproducible === total || total === 0,
    };
  }

  /**
   * Get NFR compliance report
   */
  getNFRComplianceReport(): {
    timestamp: Date;
    performance: Record<string, any>;
    availability: Record<string, any>;
    auditCoverage: Record<string, any>;
    reproducibility: Record<string, any>;
    overallCompliance: number;
    compliant: boolean;
  } {
    const performanceStats = this.getPerformanceStats();
    const availabilityStats = this.getAvailabilityStats();
    const auditStats = this.getAuditCoverageStats();
    const reproducibilityStats = this.getReproducibilityStats();

    const complianceFlags = [
      performanceStats?.p95 !== undefined ? performanceStats.p95 <= this.p95ThresholdMs : true,
      availabilityStats.meetsTarget,
      auditStats.coverage >= this.auditCoverageTarget,
      reproducibilityStats.meetsTarget,
    ];

    const overallCompliance = (complianceFlags.filter(f => f).length / complianceFlags.length) * 100;

    return {
      timestamp: new Date(),
      performance: performanceStats || {},
      availability: availabilityStats,
      auditCoverage: auditStats,
      reproducibility: reproducibilityStats,
      overallCompliance: Math.round(overallCompliance),
      compliant: overallCompliance === 100,
    };
  }

  /**
   * Reset metrics (for testing or daily resets)
   */
  resetMetrics(type?: 'performance' | 'availability' | 'audit' | 'reproducibility'): void {
    if (!type || type === 'performance') this.performanceMetrics = [];
    if (!type || type === 'availability') this.availabilityMetrics = [];
    if (!type || type === 'audit') this.auditMetrics = [];
    if (!type || type === 'reproducibility') this.evidenceReproducibility = [];
  }

  /**
   * Private helper methods
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private checkPerformanceThresholds(operationName: string): void {
    const stats = this.getPerformanceStats(operationName);
    if (!stats) return;

    const isAddressValidation = operationName.includes('address');
    const threshold = isAddressValidation ? this.p95ThresholdMs : this.traceP95ThresholdMs;

    if (stats.p95 > threshold) {
      this.emit('performance_threshold_breached', {
        operationName,
        p95: stats.p95,
        threshold,
        timestamp: new Date(),
      });
    }
  }

  private checkAvailabilitySLA(): void {
    const stats = this.getAvailabilityStats(3600000); // Last hour
    if (!stats.meetsTarget && this.availabilityMetrics.length > 10) {
      this.emit('availability_sla_breached', {
        availability: stats.availability,
        target: this.availabilityTarget,
        timestamp: new Date(),
      });
    }
  }

  private checkAuditCoverage(): void {
    const stats = this.getAuditCoverageStats();
    if (stats.coverage < this.auditCoverageTarget) {
      this.emit('audit_coverage_low', {
        coverage: stats.coverage,
        target: this.auditCoverageTarget,
        timestamp: new Date(),
      });
    }
  }
}

// Singleton instance
export const nfrMonitor = new NFRMonitor();
