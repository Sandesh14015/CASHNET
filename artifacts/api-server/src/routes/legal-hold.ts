/**
 * Legal Hold & Data Retention API Routes
 * 
 * Endpoints for:
 * - Managing legal holds on cases
 * - Data retention policies
 * - Scheduled deletions
 * - Subject access requests
 * - Audit trail queries
 */

import { Router, type IRouter, Request, Response } from "express";
import {
  LegalHoldManager,
  RetentionPolicyManager,
  DataDeletionManager,
  SARManager,
  DeletionReason,
  DataClassification,
  LegalHoldStatus,
} from "../lib/legal-hold-manager";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ============================================================================
// LEGAL HOLD ENDPOINTS
// ============================================================================

/**
 * POST /legal-holds - Place a legal hold on a case
 */
router.post("/legal-holds", (req: Request, res: Response) => {
  try {
    const { caseId, reason, scope, expiresAt, notes, notifyParties } = req.body;

    if (!caseId || !reason) {
      return res.status(400).json({ error: "Missing required fields: caseId, reason" });
    }

    const actor = (req as any).user?.id || "SYSTEM";

    const hold = LegalHoldManager.placeLegalHold(caseId, reason, actor, {
      scope: scope || "CASE_ONLY",
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      notes,
      notifyParties,
    });

    return res.status(201).json({
      success: true,
      message: "Legal hold placed successfully",
      data: hold,
    });
  } catch (error) {
    logger.error({ error }, "Failed to place legal hold");
    return res.status(500).json({ error: "Failed to place legal hold" });
  }
});

/**
 * GET /legal-holds/:holdId - Get legal hold details
 */
router.get("/legal-holds/:holdId", (req: Request, res: Response) => {
  try {
    const holdId = String(req.params.holdId);
    const hold = LegalHoldManager.getLegalHold(holdId);

    if (!hold) {
      return res.status(404).json({ error: "Legal hold not found" });
    }

    return res.json({ success: true, data: hold });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve legal hold");
    return res.status(500).json({ error: "Failed to retrieve legal hold" });
  }
});

/**
 * GET /legal-holds/case/:caseId - Get all legal holds for a case
 */
router.get("/legal-holds/case/:caseId", (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const holds = LegalHoldManager.getActiveLegalHolds(caseId);
    const isUnderHold = holds.length > 0;

    return res.json({
      success: true,
      data: {
        caseId,
        isUnderLegalHold: isUnderHold,
        holds,
        count: holds.length,
      },
    });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve legal holds for case");
    return res.status(500).json({ error: "Failed to retrieve legal holds" });
  }
});

/**
 * POST /legal-holds/:holdId/release - Release a legal hold
 */
router.post("/legal-holds/:holdId/release", (req: Request, res: Response) => {
  try {
    const holdId = String(req.params.holdId);
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Missing required field: reason" });
    }

    const actor = (req as any).user?.id || "SYSTEM";

    const hold = LegalHoldManager.releaseLegalHold(holdId, actor, reason);

    if (!hold) {
      return res.status(404).json({ error: "Legal hold not found" });
    }

    return res.json({
      success: true,
      message: "Legal hold released successfully",
      data: hold,
    });
  } catch (error) {
    logger.error({ error }, "Failed to release legal hold");
    return res.status(500).json({ error: "Failed to release legal hold" });
  }
});

/**
 * GET /legal-holds - List all legal holds
 */
router.get("/legal-holds", (req: Request, res: Response) => {
  try {
    const { status, caseId } = req.query;

    const holds = LegalHoldManager.listAllLegalHolds({
      status: status as any,
      caseId: caseId as string,
    });

    return res.json({
      success: true,
      data: holds,
      count: holds.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to list legal holds");
    return res.status(500).json({ error: "Failed to list legal holds" });
  }
});

// ============================================================================
// RETENTION POLICY ENDPOINTS
// ============================================================================

/**
 * POST /retention-policies - Create a retention policy
 */
router.post("/retention-policies", (req: Request, res: Response) => {
  try {
    const {
      dataType,
      retentionDays,
      classification,
      autoDelete,
      deleteReason,
      description,
    } = req.body;

    if (!dataType || !retentionDays) {
      return res.status(400).json({
        error: "Missing required fields: dataType, retentionDays",
      });
    }

    const actor = (req as any).user?.id || "SYSTEM";

    const policy = RetentionPolicyManager.createPolicy(dataType, retentionDays, {
      classification: classification || DataClassification.INTERNAL,
      autoDelete: autoDelete ?? true,
      deleteReason: deleteReason || DeletionReason.RETENTION_EXPIRED,
      description,
      createdBy: actor,
    });

    return res.status(201).json({
      success: true,
      message: "Retention policy created successfully",
      data: policy,
    });
  } catch (error) {
    logger.error({ error }, "Failed to create retention policy");
    return res.status(500).json({ error: "Failed to create retention policy" });
  }
});

/**
 * GET /retention-policies/:dataType - Get retention policy for data type
 */
router.get("/retention-policies/:dataType", (req: Request, res: Response) => {
  try {
    const dataType = String(req.params.dataType);
    const policy = RetentionPolicyManager.getPolicy(dataType);

    if (!policy) {
      return res.status(404).json({
        error: `No retention policy found for data type: ${dataType}`,
      });
    }

    return res.json({ success: true, data: policy });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve retention policy");
    return res.status(500).json({ error: "Failed to retrieve retention policy" });
  }
});

/**
 * GET /retention-policies - List all retention policies
 */
router.get("/retention-policies", (_req: Request, res: Response) => {
  try {
    const policies = RetentionPolicyManager.listAllPolicies();

    return res.json({
      success: true,
      data: policies,
      count: policies.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to list retention policies");
    return res.status(500).json({ error: "Failed to list retention policies" });
  }
});

/**
 * POST /retention-check - Check if data is expired
 */
router.post("/retention-check", (req: Request, res: Response) => {
  try {
    const { dataType, createdAt } = req.body;

    if (!dataType || !createdAt) {
      return res.status(400).json({
        error: "Missing required fields: dataType, createdAt",
      });
    }

    const isExpired = RetentionPolicyManager.isExpired(dataType, new Date(createdAt));
    const timeUntilExpiration = RetentionPolicyManager.getTimeUntilExpiration(
      dataType,
      new Date(createdAt)
    );

    return res.json({
      success: true,
      data: {
        dataType,
        createdAt,
        isExpired,
        timeUntilExpirationDays: timeUntilExpiration,
      },
    });
  } catch (error) {
    logger.error({ error }, "Failed to check retention");
    return res.status(500).json({ error: "Failed to check retention" });
  }
});

// ============================================================================
// DATA DELETION ENDPOINTS
// ============================================================================

/**
 * POST /deletions/schedule - Schedule a data deletion
 */
router.post("/deletions/schedule", (req: Request, res: Response) => {
  try {
    const { targetId, targetType, reason, executeAt, requiresApproval, notes } = req.body;

    if (!targetId || !targetType || !reason) {
      return res.status(400).json({
        error: "Missing required fields: targetId, targetType, reason",
      });
    }

    const actor = (req as any).user?.id || "SYSTEM";

    const event = DataDeletionManager.scheduleDeletion(
      targetId,
      targetType,
      reason,
      actor,
      {
        executeAt: executeAt ? new Date(executeAt) : undefined,
        requiresApproval: requiresApproval ?? true,
        notes,
      }
    );

    return res.status(201).json({
      success: true,
      message: "Deletion scheduled successfully",
      data: event,
    });
  } catch (error) {
    logger.error({ error }, "Failed to schedule deletion");
    return res.status(500).json({ error: "Failed to schedule deletion" });
  }
});

/**
 * POST /deletions/execute - Execute a scheduled deletion
 */
router.post("/deletions/execute", (req: Request, res: Response) => {
  try {
    const { targetId, targetType, reason, approvedBy } = req.body;

    if (!targetId || !targetType || !reason || !approvedBy) {
      return res.status(400).json({
        error: "Missing required fields: targetId, targetType, reason, approvedBy",
      });
    }

    const actor = (req as any).user?.id || "SYSTEM";

    const event = DataDeletionManager.executeDeletion(
      targetId,
      targetType,
      approvedBy,
      reason,
      actor
    );

    return res.json({
      success: true,
      message: "Data deletion executed successfully",
      data: event,
    });
  } catch (error) {
    logger.error({ error }, "Failed to execute deletion");
    return res.status(500).json({ error: "Failed to execute deletion" });
  }
});

/**
 * GET /deletions/pending - Get pending deletions
 */
router.get("/deletions/pending", (_req: Request, res: Response) => {
  try {
    const pendingDeletions = DataDeletionManager.getPendingDeletions();

    return res.json({
      success: true,
      data: pendingDeletions,
      count: pendingDeletions.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve pending deletions");
    return res.status(500).json({ error: "Failed to retrieve pending deletions" });
  }
});

/**
 * GET /deletions/:targetId - Get deletion history
 */
router.get("/deletions/:targetId", (req: Request, res: Response) => {
  try {
    const targetId = String(req.params.targetId);
    const history = DataDeletionManager.getDeletionHistory(targetId);

    return res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve deletion history");
    return res.status(500).json({ error: "Failed to retrieve deletion history" });
  }
});

// ============================================================================
// SUBJECT ACCESS REQUEST (SAR) ENDPOINTS
// ============================================================================

/**
 * POST /subject-access-requests - Create a SAR
 */
router.post("/subject-access-requests", (req: Request, res: Response) => {
  try {
    const {
      requestType,
      requestorId,
      requestorEmail,
      subjectId,
      dataCategories,
      responseFormat,
      notes,
    } = req.body;

    if (!requestType || !requestorId || !requestorEmail) {
      return res.status(400).json({
        error: "Missing required fields: requestType, requestorId, requestorEmail",
      });
    }

    const sar = SARManager.createSAR(requestType, requestorId, requestorEmail, {
      subjectId,
      dataCategories,
      responseFormat: responseFormat || "PDF",
      notes,
    });

    return res.status(201).json({
      success: true,
      message: "Subject access request received",
      data: sar,
    });
  } catch (error) {
    logger.error({ error }, "Failed to create SAR");
    return res.status(500).json({ error: "Failed to create subject access request" });
  }
});

/**
 * GET /subject-access-requests/pending - Get pending SARs
 * MUST come BEFORE the parameterised :sarId route
 */
router.get("/subject-access-requests/pending", (_req: Request, res: Response) => {
  try {
    const pendingSARs = SARManager.getPendingSARs();

    return res.json({
      success: true,
      data: pendingSARs,
      count: pendingSARs.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve pending SARs");
    return res.status(500).json({ error: "Failed to retrieve pending subject access requests" });
  }
});

/**
 * GET /subject-access-requests/overdue - Get overdue SARs
 * MUST come BEFORE the parameterised :sarId route
 */
router.get("/subject-access-requests/overdue", (_req: Request, res: Response) => {
  try {
    const overdueSARs = SARManager.getOverdueSARs();

    return res.json({
      success: true,
      data: overdueSARs,
      count: overdueSARs.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve overdue SARs");
    return res.status(500).json({ error: "Failed to retrieve overdue subject access requests" });
  }
});

/**
 * GET /subject-access-requests - List SARs
 */
router.get("/subject-access-requests", (req: Request, res: Response) => {
  try {
    const { status, requestType } = req.query;

    const sars = SARManager.listAllSARs({
      status: status as string,
      requestType: requestType as string,
    });

    return res.json({
      success: true,
      data: sars,
      count: sars.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to list SARs");
    return res.status(500).json({ error: "Failed to list subject access requests" });
  }
});

/**
 * GET /subject-access-requests/:sarId - Get SAR details
 * MUST come AFTER all static routes
 */
router.get("/subject-access-requests/:sarId", (req: Request, res: Response) => {
  try {
    const sarId = String(req.params.sarId);
    const sar = SARManager.getSAR(sarId);

    if (!sar) {
      return res.status(404).json({ error: "Subject access request not found" });
    }

    return res.json({ success: true, data: sar });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve SAR");
    return res.status(500).json({ error: "Failed to retrieve subject access request" });
  }
});

/**
 * POST /subject-access-requests/:sarId/process - Process a SAR
 */
router.post("/subject-access-requests/:sarId/process", (req: Request, res: Response) => {
  try {
    const sarId = String(req.params.sarId);
    const { dataPackagePath } = req.body;

    const actor = (req as any).user?.id || "SYSTEM";

    const sar = SARManager.processSAR(sarId, actor, dataPackagePath);

    if (!sar) {
      return res.status(404).json({ error: "Subject access request not found" });
    }

    return res.json({
      success: true,
      message: "Subject access request processed",
      data: sar,
    });
  } catch (error) {
    logger.error({ error }, "Failed to process SAR");
    return res.status(500).json({ error: "Failed to process subject access request" });
  }
});

// ============================================================================
// AUDIT TRAIL ENDPOINTS
// ============================================================================

/**
 * GET /audit-trail - Get audit trail
 */
router.get("/audit-trail", (req: Request, res: Response) => {
  try {
    const { targetId, action, startDate, endDate } = req.query;

    const auditTrail = LegalHoldManager.getAuditTrail({
      targetId: targetId as string,
      action: action as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    return res.json({
      success: true,
      data: auditTrail,
      count: auditTrail.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve audit trail");
    return res.status(500).json({ error: "Failed to retrieve audit trail" });
  }
});

export default router;
