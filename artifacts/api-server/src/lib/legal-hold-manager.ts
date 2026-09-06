/**
 * Legal Hold & Data Retention Manager
 * 
 * Manages:
 * - Legal hold placement and release
 * - Data retention scheduling
 * - Automated deletion policies
 * - Audit trail for compliance
 * - GDPR/CCPA subject access requests (SAR)
 * 
 * This module ensures data governance compliance and regulatory adherence.
 */

import { logger } from "./logger";

// Legal hold status
export enum LegalHoldStatus {
  ACTIVE = "ACTIVE",
  RELEASED = "RELEASED",
  EXPIRED = "EXPIRED",
  PENDING_REVIEW = "PENDING_REVIEW",
}

// Data classification levels
export enum DataClassification {
  PUBLIC = "PUBLIC",
  INTERNAL = "INTERNAL",
  CONFIDENTIAL = "CONFIDENTIAL",
  RESTRICTED = "RESTRICTED",
}

// Retention policy duration (in days)
export const RETENTION_PERIODS: Record<string, number> = {
  CLOSED_CASES: 7 * 365, // 7 years
  INVESTIGATION_RECORDS: 10 * 365, // 10 years
  AUDIT_LOGS: 5 * 365, // 5 years
  SYSTEM_LOGS: 90, // 90 days
  BACKUP_DATA: 365, // 1 year
  PII_CLOSED_CASES: 90, // 90 days after closure
  TEMPORARY_DATA: 30, // 30 days
};

// Deletion reason enum
export enum DeletionReason {
  RETENTION_EXPIRED = "RETENTION_EXPIRED",
  USER_REQUESTED = "USER_REQUESTED",
  LEGAL_REQUIREMENT = "LEGAL_REQUIREMENT",
  PRIVACY_REQUEST = "PRIVACY_REQUEST",
  SYSTEM_CLEANUP = "SYSTEM_CLEANUP",
  GDPR_RIGHT_TO_BE_FORGOTTEN = "GDPR_RIGHT_TO_BE_FORGOTTEN",
  CCPA_DELETION_REQUEST = "CCPA_DELETION_REQUEST",
}

// Legal hold record
export interface LegalHoldRecord {
  id: string;
  caseId: string;
  status: LegalHoldStatus;
  placedBy: string;
  placedAt: Date;
  releasedBy?: string;
  releasedAt?: Date;
  reason: string;
  expiresAt?: Date;
  notes: string;
  scope: "CASE_ONLY" | "CASE_AND_RELATED" | "ENTIRE_SUBJECT";
  notifiedParties: string[];
}

// Data retention policy
export interface RetentionPolicy {
  id: string;
  dataType: string;
  classification: DataClassification;
  retentionDays: number;
  autoDelete: boolean;
  deleteReason: DeletionReason;
  requiresApproval: boolean;
  description: string;
  createdAt: Date;
  createdBy: string;
}

// Audit event for retention/deletion
export interface RetentionAuditEvent {
  id: string;
  timestamp: Date;
  action: "HOLD_PLACED" | "HOLD_RELEASED" | "LEGAL_HOLD_PLACED" | "LEGAL_HOLD_RELEASED" | "DELETION_SCHEDULED" | "DELETION_EXECUTED" | "SAR_RECEIVED" | "SAR_PROCESSED";
  actor: string;
  targetId: string;
  targetType: string;
  reason: DeletionReason | string;
  details: Record<string, any>;
  approvedBy?: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  notes: string;
}

// Subject access request
export interface SubjectAccessRequest {
  id: string;
  requestType: "GDPR_SAR" | "CCPA_SAR" | "LOCAL_SAR";
  requestorId: string;
  requestorEmail: string;
  subjectId?: string;
  dataCategories: string[];
  receivedAt: Date;
  dueAt: Date;
  completedAt?: Date;
  status: "RECEIVED" | "IN_PROGRESS" | "COMPLETED" | "DENIED" | "EXPIRED";
  responseFormat: "PDF" | "JSON" | "CSV";
  approvedBy?: string;
  notes: string;
}

// In-memory store (in production, would use a database)
const legalHolds = new Map<string, LegalHoldRecord>();
const retentionPolicies = new Map<string, RetentionPolicy>();
const auditEvents: RetentionAuditEvent[] = [];
const sarRequests = new Map<string, SubjectAccessRequest>();

/**
 * Legal Hold Manager
 */
export class LegalHoldManager {
  /**
   * Place a legal hold on a case
   */
  static placeLegalHold(
    caseId: string,
    reason: string,
    placedBy: string,
    options: {
      expiresAt?: Date;
      scope?: "CASE_ONLY" | "CASE_AND_RELATED" | "ENTIRE_SUBJECT";
      notes?: string;
      notifyParties?: string[];
    } = {}
  ): LegalHoldRecord {
    const holdId = `HOLD-${caseId}-${Date.now()}`;
    const hold: LegalHoldRecord = {
      id: holdId,
      caseId,
      status: LegalHoldStatus.ACTIVE,
      placedBy,
      placedAt: new Date(),
      reason,
      expiresAt: options.expiresAt,
      scope: options.scope || "CASE_ONLY",
      notes: options.notes || "",
      notifiedParties: options.notifyParties || [],
    };

    legalHolds.set(holdId, hold);

    // Record audit event
    this.recordAuditEvent({
      action: "LEGAL_HOLD_PLACED",
      actor: placedBy,
      targetId: caseId,
      targetType: "CASE",
      reason: reason,
      details: { scope: hold.scope, expiresAt: hold.expiresAt },
      notes: options.notes || "",
    });

    logger.info(
      { caseId, holdId, placedBy },
      "Legal hold placed on case"
    );

    return hold;
  }

  /**
   * Release a legal hold
   */
  static releaseLegalHold(
    holdId: string,
    releasedBy: string,
    reason: string
  ): LegalHoldRecord | null {
    const hold = legalHolds.get(holdId);
    if (!hold) {
      logger.warn({ holdId }, "Legal hold not found");
      return null;
    }

    hold.status = LegalHoldStatus.RELEASED;
    hold.releasedBy = releasedBy;
    hold.releasedAt = new Date();

    // Record audit event
    this.recordAuditEvent({
      action: "LEGAL_HOLD_RELEASED",
      actor: releasedBy,
      targetId: hold.caseId,
      targetType: "CASE",
      reason: reason,
      details: { holdId },
      notes: reason,
    });

    logger.info(
      { caseId: hold.caseId, holdId, releasedBy },
      "Legal hold released"
    );

    return hold;
  }

  /**
   * Get active legal holds for a case
   */
  static getActiveLegalHolds(caseId: string): LegalHoldRecord[] {
    const holds: LegalHoldRecord[] = [];
    for (const hold of legalHolds.values()) {
      if (hold.caseId === caseId && hold.status === LegalHoldStatus.ACTIVE) {
        holds.push(hold);
      }
    }
    return holds;
  }

  /**
   * Check if a case is under legal hold
   */
  static isUnderLegalHold(caseId: string): boolean {
    return this.getActiveLegalHolds(caseId).length > 0;
  }

  /**
   * Get legal hold details
   */
  static getLegalHold(holdId: string): LegalHoldRecord | null {
    return legalHolds.get(holdId) || null;
  }

  /**
   * List all legal holds
   */
  static listAllLegalHolds(filter?: {
    status?: LegalHoldStatus;
    caseId?: string;
  }): LegalHoldRecord[] {
    let holds = Array.from(legalHolds.values());

    if (filter?.status) {
      holds = holds.filter((h) => h.status === filter.status);
    }

    if (filter?.caseId) {
      holds = holds.filter((h) => h.caseId === filter.caseId);
    }

    return holds;
  }

  /**
   * Record an audit event
   */
  private static recordAuditEvent(event: Omit<RetentionAuditEvent, "id" | "timestamp" | "status">): void {
    const auditEvent: RetentionAuditEvent = {
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      status: "COMPLETED",
      ...event,
    };

    auditEvents.push(auditEvent);
  }

  /**
   * Get audit trail
   */
  static getAuditTrail(filters?: {
    targetId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }): RetentionAuditEvent[] {
    let events = auditEvents;

    if (filters?.targetId) {
      events = events.filter((e) => e.targetId === filters.targetId);
    }

    if (filters?.action) {
      events = events.filter((e) => e.action === filters.action);
    }

    if (filters?.startDate) {
      events = events.filter((e) => e.timestamp >= filters.startDate!);
    }

    if (filters?.endDate) {
      events = events.filter((e) => e.timestamp <= filters.endDate!);
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

/**
 * Retention Policy Manager
 */
export class RetentionPolicyManager {
  /**
   * Create a retention policy
   */
  static createPolicy(
    dataType: string,
    retentionDays: number,
    options: {
      classification?: DataClassification;
      autoDelete?: boolean;
      deleteReason?: DeletionReason;
      requiresApproval?: boolean;
      description?: string;
      createdBy?: string;
    } = {}
  ): RetentionPolicy {
    const policyId = `POLICY-${dataType}-${Date.now()}`;
    const policy: RetentionPolicy = {
      id: policyId,
      dataType,
      retentionDays,
      classification: options.classification || DataClassification.INTERNAL,
      autoDelete: options.autoDelete ?? true,
      deleteReason: options.deleteReason || DeletionReason.RETENTION_EXPIRED,
      requiresApproval: options.requiresApproval ?? false,
      description: options.description || "",
      createdAt: new Date(),
      createdBy: options.createdBy || "SYSTEM",
    };

    retentionPolicies.set(policyId, policy);
    logger.info({ policyId, dataType, retentionDays }, "Retention policy created");

    return policy;
  }

  /**
   * Get retention policy for data type
   */
  static getPolicy(dataType: string): RetentionPolicy | null {
    for (const policy of retentionPolicies.values()) {
      if (policy.dataType === dataType) {
        return policy;
      }
    }
    return null;
  }

  /**
   * Calculate retention expiration date
   */
  static calculateExpirationDate(
    dataType: string,
    createdAt: Date
  ): Date | null {
    const policy = this.getPolicy(dataType);
    if (!policy) {
      return null;
    }

    const expirationDate = new Date(createdAt);
    expirationDate.setDate(expirationDate.getDate() + policy.retentionDays);
    return expirationDate;
  }

  /**
   * Check if data has expired
   */
  static isExpired(dataType: string, createdAt: Date): boolean {
    const expirationDate = this.calculateExpirationDate(dataType, createdAt);
    if (!expirationDate) {
      return false;
    }
    return new Date() > expirationDate;
  }

  /**
   * Get time until expiration (in days)
   */
  static getTimeUntilExpiration(dataType: string, createdAt: Date): number | null {
    const expirationDate = this.calculateExpirationDate(dataType, createdAt);
    if (!expirationDate) {
      return null;
    }

    const now = new Date();
    const daysUntilExpiration = Math.ceil(
      (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    return Math.max(0, daysUntilExpiration);
  }

  /**
   * Get all policies
   */
  static listAllPolicies(): RetentionPolicy[] {
    return Array.from(retentionPolicies.values());
  }
}

/**
 * Data Deletion Manager
 */
export class DataDeletionManager {
  /**
   * Schedule data deletion
   */
  static scheduleDeletion(
    targetId: string,
    targetType: string,
    reason: DeletionReason,
    actor: string,
    options: {
      executeAt?: Date;
      requiresApproval?: boolean;
      notes?: string;
    } = {}
  ): RetentionAuditEvent {
    const scheduledDeleteDate = options.executeAt || new Date();

    const auditEvent: RetentionAuditEvent = {
      id: `DEL-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      action: "DELETION_SCHEDULED",
      actor,
      targetId,
      targetType,
      reason,
      details: { scheduledFor: scheduledDeleteDate.toISOString() },
      status: options.requiresApproval ? "PENDING" : "COMPLETED",
      notes: options.notes || "",
    };

    // Convert timestamp to ISO string for proper JSON serialization
    const eventForStorage = {
      ...auditEvent,
      timestamp: auditEvent.timestamp.toISOString() as any,
    };

    auditEvents.push(eventForStorage);

    logger.info(
      { targetId, targetType, reason, actor },
      "Data deletion scheduled"
    );

    return auditEvent;
  }

  /**
   * Execute deletion (with approval)
   */
  static executeDeletion(
    targetId: string,
    targetType: string,
    approvedBy: string,
    reason: DeletionReason,
    executedBy: string,
    options: { notes?: string } = {}
  ): RetentionAuditEvent {
    const auditEvent: RetentionAuditEvent = {
      id: `DEL-EXEC-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
      action: "DELETION_EXECUTED",
      actor: executedBy,
      targetId,
      targetType,
      reason,
      approvedBy,
      details: {
        executedAt: new Date().toISOString(),
        verificationHash: this.generateDeletionHash(targetId),
      },
      status: "COMPLETED",
      notes: options.notes || "",
    };

    // Convert timestamp to ISO string for proper JSON serialization
    const eventForStorage = {
      ...auditEvent,
      timestamp: auditEvent.timestamp.toISOString() as any,
    };

    auditEvents.push(eventForStorage);

    logger.info(
      { targetId, targetType, reason, approvedBy, executedBy },
      "Data deletion executed"
    );

    return auditEvent;
  }

  /**
   * Generate cryptographic hash for deletion verification
   */
  private static generateDeletionHash(targetId: string): string {
    // In production, use crypto.createHash('sha256')
    // For now, use simple hash
    let hash = 0;
    for (let i = 0; i < targetId.length; i++) {
      const char = targetId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Get pending deletions (those requiring approval)
   */
  static getPendingDeletions(): RetentionAuditEvent[] {
    return auditEvents.filter(
      (e) =>
        e.action === "DELETION_SCHEDULED" && e.status === "PENDING"
    );
  }

  /**
   * Get deletion history for a target
   */
  static getDeletionHistory(targetId: string): RetentionAuditEvent[] {
    return auditEvents.filter(
      (e) =>
        (e.action === "DELETION_SCHEDULED" || e.action === "DELETION_EXECUTED") &&
        e.targetId === targetId
    );
  }
}

/**
 * Subject Access Request (SAR) Manager
 */
export class SARManager {
  /**
   * Create a subject access request (GDPR/CCPA)
   */
  static createSAR(
    requestType: "GDPR_SAR" | "CCPA_SAR" | "LOCAL_SAR",
    requestorId: string,
    requestorEmail: string,
    options: {
      subjectId?: string;
      dataCategories?: string[];
      responseFormat?: "PDF" | "JSON" | "CSV";
      notes?: string;
    } = {}
  ): SubjectAccessRequest {
    const sarId = `SAR-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Calculate due date based on request type
    const dueAt = new Date();
    if (requestType === "GDPR_SAR") {
      dueAt.setDate(dueAt.getDate() + 30); // 30 days for GDPR
    } else if (requestType === "CCPA_SAR") {
      dueAt.setDate(dueAt.getDate() + 45); // 45 days for CCPA
    } else {
      dueAt.setDate(dueAt.getDate() + 14); // 14 days for local requests
    }

    const sar: SubjectAccessRequest = {
      id: sarId,
      requestType,
      requestorId,
      requestorEmail,
      subjectId: options.subjectId,
      dataCategories: options.dataCategories || [],
      receivedAt: new Date(),
      dueAt,
      status: "RECEIVED",
      responseFormat: options.responseFormat || "PDF",
      notes: options.notes || "",
    };

    sarRequests.set(sarId, sar);

    // Record audit event
    const auditEvent: RetentionAuditEvent = {
      id: `AUDIT-SAR-${sarId}`,
      timestamp: new Date(),
      action: "SAR_RECEIVED",
      actor: "SYSTEM",
      targetId: sarId,
      targetType: "SAR",
      reason: `Subject Access Request: ${requestType}`,
      details: { requestorEmail, subjectId: options.subjectId },
      status: "COMPLETED",
      notes: options.notes || "",
    };

    auditEvents.push(auditEvent);

    logger.info(
      { sarId, requestType, requestorEmail },
      "Subject access request received"
    );

    return sar;
  }

  /**
   * Get SAR details
   */
  static getSAR(sarId: string): SubjectAccessRequest | null {
    return sarRequests.get(sarId) || null;
  }

  /**
   * Process/complete SAR
   */
  static processSAR(
    sarId: string,
    approvedBy: string,
    dataPackagePath?: string
  ): SubjectAccessRequest | null {
    const sar = sarRequests.get(sarId);
    if (!sar) {
      return null;
    }

    sar.status = "COMPLETED";
    sar.completedAt = new Date();
    sar.approvedBy = approvedBy;

    // Record audit event
    const auditEvent: RetentionAuditEvent = {
      id: `AUDIT-SAR-PROCESS-${sarId}`,
      timestamp: new Date(),
      action: "SAR_PROCESSED",
      actor: approvedBy,
      targetId: sarId,
      targetType: "SAR",
      reason: "Subject Access Request processed",
      details: { dataPackagePath },
      status: "COMPLETED",
      notes: "",
    };

    auditEvents.push(auditEvent);

    logger.info(
      { sarId, approvedBy },
      "Subject access request processed"
    );

    return sar;
  }

  /**
   * Get pending SARs
   */
  static getPendingSARs(): SubjectAccessRequest[] {
    const sars: SubjectAccessRequest[] = [];
    for (const sar of sarRequests.values()) {
      if (sar.status === "RECEIVED" || sar.status === "IN_PROGRESS") {
        sars.push(sar);
      }
    }
    return sars;
  }

  /**
   * Get overdue SARs
   */
  static getOverdueSARs(): SubjectAccessRequest[] {
    const now = new Date();
    const sars: SubjectAccessRequest[] = [];
    for (const sar of sarRequests.values()) {
      if (sar.status !== "COMPLETED" && sar.dueAt < now) {
        sars.push(sar);
      }
    }
    return sars;
  }

  /**
   * List all SARs
   */
  static listAllSARs(filter?: { status?: string; requestType?: string }): SubjectAccessRequest[] {
    let sars = Array.from(sarRequests.values());

    if (filter?.status) {
      sars = sars.filter((s) => s.status === filter.status);
    }

    if (filter?.requestType) {
      sars = sars.filter((s) => s.requestType === filter.requestType);
    }

    return sars;
  }
}

export default {
  LegalHoldManager,
  RetentionPolicyManager,
  DataDeletionManager,
  SARManager,
};
