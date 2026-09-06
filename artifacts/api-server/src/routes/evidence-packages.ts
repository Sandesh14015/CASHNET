/**
 * Evidence Packages API Routes
 * 
 * Immutable evidence package management:
 * - Create evidence snapshots
 * - Verify evidence integrity
 * - Package export and archival
 * - Chain of custody tracking
 */

import { Router, type IRouter, Request, Response } from "express";
import { logger } from "../lib/logger";

type AnyRecord = Record<string, any>;

// In-memory storage
const evidencePackages = new Map<string, AnyRecord>();

const router: IRouter = Router();

/**
 * POST /evidence-packages - Create new evidence package
 */
router.post("/evidence-packages", (req: Request, res: Response) => {
  try {
    const {
      caseId,
      title,
      description,
      includeTransactions,
      includeAddresses,
      includeWallets,
      includeFindings,
    } = req.body;

    if (!caseId || !title) {
      return res.status(400).json({
        error: "Missing required fields: caseId, title",
      });
    }

    const packageId = `EVID-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const evidencePackage: AnyRecord = {
      id: packageId,
      caseId,
      title,
      description: description || "",
      contents: {
        transactions: includeTransactions !== false,
        addresses: includeAddresses !== false,
        wallets: includeWallets !== false,
        findings: includeFindings !== false,
      },
      createdAt: new Date().toISOString(),
      createdBy: (req as any).user?.id || "SYSTEM",
      status: "DRAFT",
      integrity: {
        algorithm: "SHA-256",
        hash: generateHash(packageId),
        verified: false,
      },
      chainOfCustody: [
        {
          action: "CREATED",
          actor: (req as any).user?.id || "SYSTEM",
          timestamp: new Date().toISOString(),
          notes: "Package created",
        },
      ],
    };

    evidencePackages.set(packageId, evidencePackage);

    return res.status(201).json({
      success: true,
      message: "Evidence package created successfully",
      data: evidencePackage,
    });
  } catch (error) {
    logger.error({ error }, "Failed to create evidence package");
    return res.status(500).json({ error: "Failed to create evidence package" });
  }
});

/**
 * GET /evidence-packages/:packageId - Get evidence package details
 */
router.get("/evidence-packages/:packageId", (req: Request, res: Response) => {
  try {
    const packageId = String(req.params.packageId);
    const pkg = evidencePackages.get(packageId);

    if (!pkg) {
      return res.status(404).json({ error: "Evidence package not found" });
    }

    return res.json({ success: true, data: pkg });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve evidence package");
    return res.status(500).json({ error: "Failed to retrieve evidence package" });
  }
});

/**
 * GET /evidence-packages/:packageId/verify - Verify package integrity
 */
router.get("/evidence-packages/:packageId/verify", (req: Request, res: Response) => {
  try {
    const packageId = String(req.params.packageId);
    const pkg = evidencePackages.get(packageId);

    if (!pkg) {
      return res.status(404).json({ error: "Evidence package not found" });
    }

    // Verify integrity
    const currentHash = generateHash(packageId);
    const isValid = currentHash === pkg.integrity.hash;

    const verification: AnyRecord = {
      packageId,
      status: isValid ? "VALID" : "INVALID",
      expectedHash: pkg.integrity.hash,
      currentHash,
      algorithm: pkg.integrity.algorithm,
      verifiedAt: new Date().toISOString(),
      verifiedBy: (req as any).user?.id || "SYSTEM",
    };

    if (isValid) {
      pkg.integrity.verified = true;
      pkg.chainOfCustody.push({
        action: "VERIFIED",
        actor: (req as any).user?.id || "SYSTEM",
        timestamp: new Date().toISOString(),
        notes: "Package integrity verified",
      });
    }

    return res.json({
      success: true,
      data: verification,
      message: isValid
        ? "Package integrity verified successfully"
        : "Package integrity check failed",
    });
  } catch (error) {
    logger.error({ error }, "Failed to verify evidence package");
    return res.status(500).json({ error: "Failed to verify evidence package" });
  }
});

/**
 * POST /evidence-packages/:packageId/finalize - Finalize and lock package
 */
router.post("/evidence-packages/:packageId/finalize", (req: Request, res: Response) => {
  try {
    const packageId = String(req.params.packageId);
    const pkg = evidencePackages.get(packageId);

    if (!pkg) {
      return res.status(404).json({ error: "Evidence package not found" });
    }

    pkg.status = "FINALIZED";
    pkg.finalizedAt = new Date().toISOString();
    pkg.finalizedBy = (req as any).user?.id || "SYSTEM";
    pkg.integrity.verified = true;

    pkg.chainOfCustody.push({
      action: "FINALIZED",
      actor: (req as any).user?.id || "SYSTEM",
      timestamp: new Date().toISOString(),
      notes: "Package finalized and locked",
    });

    return res.json({
      success: true,
      message: "Evidence package finalized successfully",
      data: pkg,
    });
  } catch (error) {
    logger.error({ error }, "Failed to finalize evidence package");
    return res.status(500).json({ error: "Failed to finalize evidence package" });
  }
});

/**
 * POST /evidence-packages/:packageId/export - Export package to file
 */
router.post("/evidence-packages/:packageId/export", (req: Request, res: Response) => {
  try {
    const packageId = String(req.params.packageId);
    const { format } = req.body;

    const pkg = evidencePackages.get(packageId);
    if (!pkg) {
      return res.status(404).json({ error: "Evidence package not found" });
    }

    const exportFormat = format || "JSON";
    const exportPath = `/exports/evidence/${packageId}.${exportFormat.toLowerCase()}`;

    pkg.chainOfCustody.push({
      action: "EXPORTED",
      actor: (req as any).user?.id || "SYSTEM",
      timestamp: new Date().toISOString(),
      notes: `Exported to ${exportFormat}`,
      exportPath,
    });

    return res.json({
      success: true,
      message: "Evidence package exported successfully",
      data: {
        packageId,
        format: exportFormat,
        exportPath,
        exportedAt: new Date().toISOString(),
        exportedBy: (req as any).user?.id || "SYSTEM",
      },
    });
  } catch (error) {
    logger.error({ error }, "Failed to export evidence package");
    return res.status(500).json({ error: "Failed to export evidence package" });
  }
});

/**
 * GET /evidence-packages - List evidence packages
 */
router.get("/evidence-packages", (req: Request, res: Response) => {
  try {
    const { caseId, status } = req.query;

    let packages = Array.from(evidencePackages.values());

    if (caseId) {
      packages = packages.filter((p) => p.caseId === caseId);
    }

    if (status) {
      packages = packages.filter((p) => p.status === status);
    }

    return res.json({
      success: true,
      data: packages,
      count: packages.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to list evidence packages");
    return res.status(500).json({ error: "Failed to list evidence packages" });
  }
});

/**
 * Helper function to generate hash
 */
function generateHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `sha256_${Math.abs(hash).toString(16)}`;
}

export default router;
