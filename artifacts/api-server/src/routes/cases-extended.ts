/**
 * Extended Cases API Routes
 * 
 * Comprehensive case management endpoints:
 * - Address management (add, update, query)
 * - Case assignment to investigators
 * - Findings and analysis results
 * - Evidence packages
 * - Action requests
 * - Case tagging and clustering
 * - Alert management
 */

import { Router, type IRouter, Request, Response } from "express";
import { logger } from "../lib/logger";

type AnyRecord = Record<string, any>;

// In-memory storage (in production, would use database)
const caseAddresses = new Map<string, AnyRecord[]>();
const caseAssignments = new Map<string, AnyRecord>();
const caseFindings = new Map<string, AnyRecord[]>();
const evidencePackages = new Map<string, AnyRecord>();
const actionRequests = new Map<string, AnyRecord>();
const caseTags = new Map<string, string[]>();
const caseAlerts = new Map<string, AnyRecord[]>();
const entityRegistry = new Map<string, AnyRecord>();
const clusterRegistry = new Map<string, AnyRecord>();

// ============================================================================
// SEED DATA - Entities
// ============================================================================
entityRegistry.set("ENT-MULE-A", {
  id: "ENT-MULE-A",
  type: "PERSON",
  name: "Mule Account A",
  identifier: "XXXXXX4821",
  riskScore: 78,
  category: "MULE_ACCOUNT",
  indicators: ["HIGH_VELOCITY", "RAPID_TRANSFERS", "MULTIPLE_SENDERS"],
  firstSeen: new Date(2026, 7, 18, 10, 1).toISOString(),
  lastSeen: new Date(2026, 7, 18, 10, 5).toISOString(),
  jurisdiction: "India",
  relatedCases: ["CASE-CASHNET-001"],
  confidence: 0.91,
});

entityRegistry.set("ENT-VASP-ALPHA", {
  id: "ENT-VASP-ALPHA",
  type: "ORGANIZATION",
  name: "VASP Alpha",
  riskScore: 72,
  category: "VASP",
  indicators: ["CRYPTO_CONVERSION", "FIAT_DEPOSIT", "DIRECT_ATTRIBUTION"],
  firstSeen: new Date(2026, 7, 18, 10, 7).toISOString(),
  lastSeen: new Date(2026, 7, 18, 10, 11).toISOString(),
  jurisdiction: "Singapore",
  relatedCases: ["CASE-CASHNET-001"],
  confidence: 0.91,
});

entityRegistry.set("ENT-WALLET-A", {
  id: "ENT-WALLET-A",
  type: "CRYPTO_WALLET",
  name: "0x7A4C9D12…92F",
  riskScore: 88,
  category: "CRYPTO_WALLET",
  indicators: ["CROSS_CHAIN", "HIGH_VALUE", "FOREIGN_DESTINATION"],
  firstSeen: new Date(2026, 7, 18, 10, 11).toISOString(),
  lastSeen: new Date(2026, 7, 18, 10, 22).toISOString(),
  chain: "Ethereum",
  relatedCases: ["CASE-CASHNET-001"],
  confidence: 0.88,
});

entityRegistry.set("ENT-LAST-CREDITED", {
  id: "ENT-LAST-CREDITED",
  type: "BANK_ACCOUNT",
  name: "Account C",
  identifier: "XXXXXX1234",
  riskScore: 94,
  category: "CASH_OUT_LOCATION",
  indicators: ["PREDICTED_ATM", "FINAL_RECIPIENT", "CRITICAL_RISK"],
  firstSeen: new Date(2026, 7, 18, 10, 31).toISOString(),
  lastSeen: new Date(2026, 7, 18, 10, 42).toISOString(),
  bank: "Synthetic National Bank",
  branch: "Indiranagar Branch",
  relatedCases: ["CASE-CASHNET-001"],
  confidence: 0.84,
});

// ============================================================================
// SEED DATA - Alerts
// ============================================================================
caseAlerts.set("CASE-CASHNET-001", [
  {
    id: "ALERT-001-HOTSPOT",
    caseId: "CASE-CASHNET-001",
    severity: "CRITICAL",
    title: "Predicted cash-out cluster detected",
    description: "Bengaluru · Indiranagar · 82% probability",
    category: "PREDICTIVE_ANALYSIS",
    timestamp: new Date(2026, 7, 18, 10, 44).toISOString(),
    status: "ACTIVE",
    location: "Bengaluru, Indiranagar",
    coordinates: { lat: 12.9719, lng: 77.6412 },
    confidence: 0.82,
    actionRequired: true,
  },
  {
    id: "ALERT-001-CONVERSION",
    caseId: "CASE-CASHNET-001",
    severity: "HIGH",
    title: "FIAT → CRYPTO conversion detected",
    description: "VASP Alpha · 10:11 UTC · ₹1,86,500 → 2,234 USDT",
    category: "CONVERSION_DETECTION",
    timestamp: new Date(2026, 7, 18, 10, 11).toISOString(),
    status: "ACKNOWLEDGED",
    conversionType: "FIAT_TO_CRYPTO",
    amount: 186500,
    convertedAmount: 2234,
    confidence: 0.91,
    actionRequired: false,
  },
  {
    id: "ALERT-001-VELOCITY",
    caseId: "CASE-CASHNET-001",
    severity: "HIGH",
    title: "High transaction velocity detected",
    description: "12 transactions within 42 minutes on primary account",
    category: "VELOCITY_ANALYSIS",
    timestamp: new Date(2026, 7, 18, 10, 5).toISOString(),
    status: "ACKNOWLEDGED",
    transactionCount: 12,
    timeWindowMinutes: 42,
    confidence: 0.89,
    actionRequired: false,
  },
]);

caseAlerts.set("CASE-CASHNET-002", [
  {
    id: "ALERT-002-CROSS-BORDER",
    caseId: "CASE-CASHNET-002",
    severity: "HIGH",
    title: "Cross-border movement detected",
    description: "Funds moving from India to Singapore via crypto",
    category: "CROSS_BORDER_DETECTION",
    timestamp: new Date(2026, 7, 18, 10, 22).toISOString(),
    status: "ACTIVE",
    sourceCountry: "India",
    destinationCountry: "Singapore",
    amount: 1980,
    confidence: 0.78,
    actionRequired: true,
  },
]);

const router: IRouter = Router();

// ============================================================================
// ADDRESS MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /cases/:caseId/addresses - Add address to case
 */
router.post("/cases/:caseId/addresses", (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const { address, chain, addressType, notes, riskScore, indicators } = req.body;

    if (!address || !chain) {
      return res.status(400).json({
        error: "Missing required fields: address, chain",
      });
    }

    const addressRecord: AnyRecord = {
      id: `ADDR-${caseId}-${Date.now()}`,
      caseId,
      address,
      chain,
      addressType: addressType || "UNKNOWN",
      notes: notes || "",
      riskScore: riskScore || 0,
      indicators: indicators || [],
      addedAt: new Date().toISOString(),
      addedBy: (req as any).user?.id || "SYSTEM",
    };

    if (!caseAddresses.has(caseId)) {
      caseAddresses.set(caseId, []);
    }
    caseAddresses.get(caseId)!.push(addressRecord);

    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      data: addressRecord,
    });
  } catch (error) {
    logger.error({ error }, "Failed to add address");
    return res.status(500).json({ error: "Failed to add address" });
  }
});

/**
 * GET /cases/:caseId/addresses - Get all addresses for case
 */
router.get("/cases/:caseId/addresses", (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const { chain, riskMinimum } = req.query;

    let addresses = caseAddresses.get(caseId) || [];

    // Filter by chain if provided
    if (chain) {
      addresses = addresses.filter((a) => a.chain === chain);
    }

    // Filter by risk minimum if provided
    if (riskMinimum) {
      const minRisk = parseInt(riskMinimum as string);
      addresses = addresses.filter((a) => a.riskScore >= minRisk);
    }

    return res.json({
      success: true,
      data: addresses,
      count: addresses.length,
      caseId,
    });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve addresses");
    return res.status(500).json({ error: "Failed to retrieve addresses" });
  }
});

/**
 * DELETE /cases/:caseId/addresses/:addressId - Remove address from case
 */
router.delete("/cases/:caseId/addresses/:addressId", (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const addressId = String(req.params.addressId);
    const addresses = caseAddresses.get(caseId) || [];
    const index = addresses.findIndex((a) => a.id === addressId);

    if (index === -1) {
      return res.status(404).json({ error: "Address not found" });
    }

    const removed = addresses.splice(index, 1)[0];

    return res.json({
      success: true,
      message: "Address removed successfully",
      data: removed,
    });
  } catch (error) {
    logger.error({ error }, "Failed to remove address");
    return res.status(500).json({ error: "Failed to remove address" });
  }
});

// ============================================================================
// CASE ASSIGNMENT ENDPOINTS
// ============================================================================

/**
 * POST /cases/:caseId/assign - Assign case to investigator
 */
router.post("/cases/:caseId/assign", (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const { investigatorId, investigatorName, investigatorEmail, priority, notes } = req.body;

    if (!investigatorId) {
      return res.status(400).json({ error: "Missing required field: investigatorId" });
    }

    const assignment: AnyRecord = {
      id: `ASSIGN-${caseId}-${Date.now()}`,
      caseId,
      investigatorId,
      investigatorName: investigatorName || "Unknown",
      investigatorEmail: investigatorEmail || "",
      priority: priority || "MEDIUM",
      assignedAt: new Date().toISOString(),
      assignedBy: (req as any).user?.id || "SYSTEM",
      notes: notes || "",
      status: "ACTIVE",
    };

    caseAssignments.set(caseId, assignment);

    return res.status(201).json({
      success: true,
      message: "Case assigned successfully",
      data: assignment,
    });
  } catch (error) {
    logger.error({ error }, "Failed to assign case");
    return res.status(500).json({ error: "Failed to assign case" });
  }
});

/**
 * GET /cases/:caseId/assign - Get case assignment
 */
router.get("/cases/:caseId/assign", (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const assignment = caseAssignments.get(caseId);

    if (!assignment) {
      return res.json({
        success: true,
        data: null,
        message: "Case not assigned",
      });
    }

    return res.json({ success: true, data: assignment });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve assignment");
    return res.status(500).json({ error: "Failed to retrieve assignment" });
  }
});

/**
 * POST /cases/:caseId/reassign - Reassign case to different investigator
 */
router.post("/cases/:caseId/reassign", (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const { newInvestigatorId, newInvestigatorName, newInvestigatorEmail, reason } = req.body;

    if (!newInvestigatorId) {
      return res.status(400).json({ error: "Missing required field: newInvestigatorId" });
    }

    const oldAssignment = caseAssignments.get(caseId);
    const assignment: AnyRecord = {
      id: `ASSIGN-${caseId}-${Date.now()}`,
      caseId,
      investigatorId: newInvestigatorId,
      investigatorName: newInvestigatorName || "Unknown",
      investigatorEmail: newInvestigatorEmail || "",
      priority: oldAssignment?.priority || "MEDIUM",
      assignedAt: new Date().toISOString(),
      assignedBy: (req as any).user?.id || "SYSTEM",
      previousInvestigator: oldAssignment?.investigatorId,
      reassignmentReason: reason || "",
      status: "ACTIVE",
    };

    caseAssignments.set(caseId, assignment);

    return res.json({
      success: true,
      message: "Case reassigned successfully",
      data: assignment,
    });
  } catch (error) {
    logger.error({ error }, "Failed to reassign case");
    return res.status(500).json({ error: "Failed to reassign case" });
  }
});

// ============================================================================
// FINDINGS ENDPOINTS
// ============================================================================

/**
 * POST /cases/:caseId/findings - Add analysis finding to case
 */
router.post("/cases/:caseId/findings", (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const {
      findingType,
      title,
      description,
      confidence,
      evidenceIds,
      relatedEntities,
      recommendations,
      severity,
    } = req.body;

    if (!findingType || !title) {
      return res.status(400).json({
        error: "Missing required fields: findingType, title",
      });
    }

    const finding: AnyRecord = {
      id: `FIND-${caseId}-${Date.now()}`,
      caseId,
      findingType,
      title,
      description: description || "",
      confidence: confidence || 0.5,
      severity: severity || "MEDIUM",
      evidenceIds: evidenceIds || [],
      relatedEntities: relatedEntities || [],
      recommendations: recommendations || [],
      createdAt: new Date().toISOString(),
      createdBy: (req as any).user?.id || "SYSTEM",
      status: "OPEN",
    };

    if (!caseFindings.has(caseId)) {
      caseFindings.set(caseId, []);
    }
    caseFindings.get(caseId)!.push(finding);

    return res.status(201).json({
      success: true,
      message: "Finding added successfully",
      data: finding,
    });
  } catch (error) {
    logger.error({ error }, "Failed to add finding");
    return res.status(500).json({ error: "Failed to add finding" });
  }
});

/**
 * GET /cases/:caseId/findings - Get findings for case
 */
router.get("/cases/:caseId/findings", (req: Request, res: Response) => {
  try {
    const caseId = String(req.params.caseId);
    const { findingType, severity } = req.query;

    let findings = caseFindings.get(caseId) || [];

    if (findingType) {
      findings = findings.filter((f) => f.findingType === findingType);
    }

    if (severity) {
      findings = findings.filter((f) => f.severity === severity);
    }

    return res.json({
      success: true,
      data: findings,
      count: findings.length,
      caseId,
    });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve findings");
    return res.status(500).json({ error: "Failed to retrieve findings" });
  }
});

/**
 * POST /findings/:findingId/adjudications - Add investigator adjudication
 */
router.post("/findings/:findingId/adjudications", (req: Request, res: Response) => {
  try {
    const findingId = String(req.params.findingId);
    const { adjudicationStatus, confidence, notes, reviewer } = req.body;

    if (!adjudicationStatus) {
      return res.status(400).json({ error: "Missing required field: adjudicationStatus" });
    }

    const adjudication: AnyRecord = {
      id: `ADJ-${findingId}-${Date.now()}`,
      findingId,
      adjudicationStatus,
      confidence: confidence || 0.5,
      notes: notes || "",
      reviewer: reviewer || (req as any).user?.id || "SYSTEM",
      adjudicatedAt: new Date().toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: "Adjudication recorded successfully",
      data: adjudication,
    });
  } catch (error) {
    logger.error({ error }, "Failed to record adjudication");
    return res.status(500).json({ error: "Failed to record adjudication" });
  }
});

// ============================================================================
// ANALYSIS ENDPOINTS
// ============================================================================

/**
 * POST /analyses - Start new analysis on addresses
 */
router.post("/analyses", (req: Request, res: Response) => {
  try {
    const { caseId, addresses, analysisType, parameters } = req.body;

    if (!caseId || !addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({
        error: "Missing required fields: caseId, addresses (non-empty array)",
      });
    }

    const analysis: AnyRecord = {
      id: `ANALYSIS-${Date.now()}`,
      caseId,
      addresses,
      analysisType: analysisType || "STANDARD_TRACE",
      parameters: parameters || {},
      startedAt: new Date().toISOString(),
      startedBy: (req as any).user?.id || "SYSTEM",
      status: "IN_PROGRESS",
      progress: 0,
    };

    // Simulate analysis completion
    setTimeout(() => {
      analysis.status = "COMPLETED";
      analysis.progress = 100;
      analysis.completedAt = new Date().toISOString();
    }, 2000);

    return res.status(201).json({
      success: true,
      message: "Analysis started",
      data: analysis,
    });
  } catch (error) {
    logger.error({ error }, "Failed to start analysis");
    return res.status(500).json({ error: "Failed to start analysis" });
  }
});

// ============================================================================
// TAG ENDPOINTS
// ============================================================================

/**
 * POST /tags - Add tag to case
 */
router.post("/tags", (req: Request, res: Response) => {
  try {
    const { caseId, tag, category } = req.body;

    if (!caseId || !tag) {
      return res.status(400).json({ error: "Missing required fields: caseId, tag" });
    }

    if (!caseTags.has(caseId)) {
      caseTags.set(caseId, []);
    }

    const tags = caseTags.get(caseId)!;
    if (!tags.includes(tag)) {
      tags.push(tag);
    }

    return res.status(201).json({
      success: true,
      message: "Tag added successfully",
      data: {
        caseId,
        tag,
        category: category || "GENERAL",
        addedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, "Failed to add tag");
    return res.status(500).json({ error: "Failed to add tag" });
  }
});

// ============================================================================
// CLUSTER ENDPOINTS
// ============================================================================

/**
 * POST /clusters - Create or update cluster
 */
router.post("/clusters", (req: Request, res: Response) => {
  try {
    const { name, addresses, clusterType, confidence } = req.body;

    if (!name || !addresses || !Array.isArray(addresses)) {
      return res.status(400).json({
        error: "Missing required fields: name, addresses (array)",
      });
    }

    const clusterId = `CLUSTER-${Date.now()}`;
    const cluster: AnyRecord = {
      id: clusterId,
      name,
      addresses,
      clusterType: clusterType || "UNKNOWN",
      confidence: confidence || 0.5,
      size: addresses.length,
      createdAt: new Date().toISOString(),
      createdBy: (req as any).user?.id || "SYSTEM",
    };

    clusterRegistry.set(clusterId, cluster);

    return res.status(201).json({
      success: true,
      message: "Cluster created successfully",
      data: cluster,
    });
  } catch (error) {
    logger.error({ error }, "Failed to create cluster");
    return res.status(500).json({ error: "Failed to create cluster" });
  }
});

// ============================================================================
// ENTITY ENDPOINTS
// ============================================================================

/**
 * GET /entities/:entityId - Get entity details
 */
router.get("/entities/:entityId", (req: Request, res: Response) => {
  try {
    const entityId = String(req.params.entityId);
    const entity = entityRegistry.get(entityId);

    if (!entity) {
      return res.status(404).json({ error: "Entity not found" });
    }

    return res.json({ success: true, data: entity });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve entity");
    return res.status(500).json({ error: "Failed to retrieve entity" });
  }
});

/**
 * GET /entities - Search entities
 */
router.get("/entities", (req: Request, res: Response) => {
  try {
    const { type, risk } = req.query;

    let entities = Array.from(entityRegistry.values());

    if (type) {
      entities = entities.filter((e) => e.type === type);
    }

    if (risk) {
      const minRisk = parseInt(risk as string);
      entities = entities.filter((e) => e.riskScore >= minRisk);
    }

    return res.json({
      success: true,
      data: entities,
      count: entities.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to search entities");
    return res.status(500).json({ error: "Failed to search entities" });
  }
});

// ============================================================================
// ALERT ENDPOINTS
// ============================================================================

/**
 * POST /alerts/:alertId/acknowledge - Acknowledge alert
 */
router.post("/alerts/:alertId/acknowledge", (req: Request, res: Response) => {
  try {
    const alertId = String(req.params.alertId);
    const { notes } = req.body;

    const acknowledgment: AnyRecord = {
      id: `ACK-${alertId}-${Date.now()}`,
      alertId,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: (req as any).user?.id || "SYSTEM",
      notes: notes || "",
      status: "ACKNOWLEDGED",
    };

    return res.status(201).json({
      success: true,
      message: "Alert acknowledged",
      data: acknowledgment,
    });
  } catch (error) {
    logger.error({ error }, "Failed to acknowledge alert");
    return res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

/**
 * GET /alerts - List alerts
 */
router.get("/alerts", (req: Request, res: Response) => {
  try {
    const { caseId, severity } = req.query;

    let alerts: AnyRecord[] = [];
    if (caseId) {
      alerts = caseAlerts.get(caseId as string) || [];
    } else {
      for (const alertList of caseAlerts.values()) {
        alerts.push(...alertList);
      }
    }

    if (severity) {
      alerts = alerts.filter((a) => a.severity === severity);
    }

    return res.json({
      success: true,
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve alerts");
    return res.status(500).json({ error: "Failed to retrieve alerts" });
  }
});

export default router;
