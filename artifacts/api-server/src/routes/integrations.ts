import { Router, type Request, type Response } from "express";
import { integrationManager } from "../services/integration-manager";
import { logger } from "../lib/logger";

const router = Router();

// GET /integrations - List all integrations and their health
router.get("/", async (req: Request, res: Response) => {
  try {
    const health = await integrationManager.healthCheck();
    return res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger.error({ error }, "Failed to get integration health");
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve integration status",
    });
  }
});

// POST /integrations/:systemName/cases - Submit case to external system
router.post("/:systemName/cases", async (req: Request, res: Response) => {
  try {
    const systemName = req.params.systemName;
    const caseData = req.body;

    if (!caseData.caseId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: caseId",
      });
    }

    const result = await integrationManager.submitCase(systemName, caseData);

    if (result.status === "error") {
      return res.status(503).json({
        success: false,
        error: result.error,
      });
    }

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error({ error }, "Failed to submit case to integration");
    return res.status(500).json({
      success: false,
      error: "Failed to submit case",
    });
  }
});

// GET /integrations/:systemName/cases/:externalId - Get case status from external system
router.get("/:systemName/cases/:externalId", async (req: Request, res: Response) => {
  try {
    const systemName = req.params.systemName;
    const externalId = req.params.externalId;

    const result = await integrationManager.getCaseStatus(systemName, externalId);

    if (result.status === "error") {
      return res.status(503).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error({ error }, "Failed to get case status from integration");
    return res.status(500).json({
      success: false,
      error: "Failed to retrieve case status",
    });
  }
});

export default router;
