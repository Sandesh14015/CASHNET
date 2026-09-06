/**
 * Action Requests API Routes
 * 
 * Request workflow for authorized actions:
 * - Transaction record requests to banks/VASPs
 * - User information requests
 * - Account freezes
 * - Approval-led dispatch
 * - Response tracking
 * - Partner webhooks for async notifications
 */

import { Router, type IRouter, Request, Response } from "express";
import { logger } from "../lib/logger";

type AnyRecord = Record<string, any>;

// In-memory storage
const actionRequests = new Map<string, AnyRecord>();
const webhookSubscriptions = new Map<string, AnyRecord>();

const router: IRouter = Router();

// ============================================================================
// ACTION REQUEST ENDPOINTS
// ============================================================================

/**
 * POST /action-requests - Create action request
 */
router.post("/action-requests", (req: Request, res: Response) => {
  try {
    const {
      caseId,
      actionType,
      targetEntity,
      targetEntityType,
      requestDetails,
      justification,
      priority,
      deadline,
    } = req.body;

    if (!caseId || !actionType || !targetEntity) {
      return res.status(400).json({
        error: "Missing required fields: caseId, actionType, targetEntity",
      });
    }

    const requestId = `ARQ-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const actionRequest: AnyRecord = {
      id: requestId,
      caseId,
      actionType,
      targetEntity,
      targetEntityType: targetEntityType || "ENTITY",
      requestDetails: requestDetails || {},
      justification: justification || "",
      priority: priority || "MEDIUM",
      deadline: deadline ? new Date(deadline) : null,
      createdAt: new Date().toISOString(),
      createdBy: (req as any).user?.id || "SYSTEM",
      status: "DRAFT",
      approvals: [],
      responses: [],
    };

    actionRequests.set(requestId, actionRequest);

    return res.status(201).json({
      success: true,
      message: "Action request created",
      data: actionRequest,
    });
  } catch (error) {
    logger.error({ error }, "Failed to create action request");
    return res.status(500).json({ error: "Failed to create action request" });
  }
});

/**
 * POST /action-requests/:requestId/approve - Approve action request
 * 
 * State transition: DRAFT → APPROVED
 * This must be called before send() to authorize the request.
 */
router.post("/action-requests/:requestId/approve", (req: Request, res: Response) => {
  try {
    const requestId = String(req.params.requestId);
    const { approvalNotes } = req.body;

    const request = actionRequests.get(requestId);
    if (!request) {
      return res.status(404).json({ error: "Action request not found" });
    }

    const approval: AnyRecord = {
      approvalId: `APP-${Date.now()}`,
      approvedBy: (req as any).user?.id || "SYSTEM",
      approvedAt: new Date().toISOString(),
      notes: approvalNotes || "",
      status: "APPROVED",
    };

    request.approvals.push(approval);
    request.status = "APPROVED";
    request.approvedAt = new Date().toISOString();

    return res.json({
      success: true,
      message: "Action request approved",
      data: request,
    });
  } catch (error) {
    logger.error({ error }, "Failed to approve action request");
    return res.status(500).json({ error: "Failed to approve action request" });
  }
});

/**
 * POST /action-requests/:requestId/send - Send approved request to partner
 * 
 * State transition: APPROVED → SENT
 * This can only be called after approve() is called.
 * Required: request.status must be "APPROVED"
 */
router.post("/action-requests/:requestId/send", (req: Request, res: Response) => {
  try {
    const requestId = String(req.params.requestId);

    const request = actionRequests.get(requestId);
    if (!request) {
      return res.status(404).json({ error: "Action request not found" });
    }

    if (request.status !== "APPROVED") {
      return res.status(400).json({
        error: "Request must be approved before sending",
      });
    }

    request.status = "SENT";
    request.sentAt = new Date().toISOString();
    request.sentBy = (req as any).user?.id || "SYSTEM";

    // Trigger webhook notification to partner
    triggerPartnerWebhook("action_request_received", {
      requestId,
      actionType: request.actionType,
      targetEntity: request.targetEntity,
    });

    return res.json({
      success: true,
      message: "Action request sent to partner",
      data: request,
    });
  } catch (error) {
    logger.error({ error }, "Failed to send action request");
    return res.status(500).json({ error: "Failed to send action request" });
  }
});

/**
 * POST /action-requests/:requestId/response - Record partner response
 * 
 * State transition: SENT → RESPONDED
 * This can only be called after send() has been called.
 * Captures the partner's response to the action request.
 * 
 * State Machine Summary:
 * DRAFT (initial) → APPROVED (after approve) → SENT (after send) → RESPONDED (after response)
 */
router.post("/action-requests/:requestId/response", (req: Request, res: Response) => {
  try {
    const requestId = String(req.params.requestId);
    const { responseStatus, responseData, responseNotes } = req.body;

    const request = actionRequests.get(requestId);
    if (!request) {
      return res.status(404).json({ error: "Action request not found" });
    }

    if (request.status !== "SENT") {
      return res.status(400).json({
        error: "Request must be sent before recording response. Current status: " + request.status,
      });
    }

    const response: AnyRecord = {
      responseId: `RESP-${Date.now()}`,
      responseStatus,
      responseData: responseData || {},
      responseNotes: responseNotes || "",
      receivedAt: new Date().toISOString(),
      receivedFrom: (req as any).user?.id || "SYSTEM",
    };

    request.responses.push(response);
    request.status = "RESPONDED";
    request.respondedAt = new Date().toISOString();

    return res.status(201).json({
      success: true,
      message: "Response recorded",
      data: request,
    });
  } catch (error) {
    logger.error({ error }, "Failed to record response");
    return res.status(500).json({ error: "Failed to record response" });
  }
});

/**
 * GET /action-requests - List action requests
 */
router.get("/action-requests", (req: Request, res: Response) => {
  try {
    const { caseId, status, actionType } = req.query;

    let requests = Array.from(actionRequests.values());

    if (caseId) {
      requests = requests.filter((r) => r.caseId === caseId);
    }

    if (status) {
      requests = requests.filter((r) => r.status === status);
    }

    if (actionType) {
      requests = requests.filter((r) => r.actionType === actionType);
    }

    return res.json({
      success: true,
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to list action requests");
    return res.status(500).json({ error: "Failed to list action requests" });
  }
});

/**
 * GET /action-requests/:requestId - Get action request details
 */
router.get("/action-requests/:requestId", (req: Request, res: Response) => {
  try {
    const requestId = String(req.params.requestId);
    const request = actionRequests.get(requestId);

    if (!request) {
      return res.status(404).json({ error: "Action request not found" });
    }

    return res.json({ success: true, data: request });
  } catch (error) {
    logger.error({ error }, "Failed to retrieve action request");
    return res.status(500).json({ error: "Failed to retrieve action request" });
  }
});

// ============================================================================
// PARTNER WEBHOOK ENDPOINTS
// ============================================================================

/**
 * POST /webhooks/subscribe - Subscribe to events
 */
router.post("/webhooks/subscribe", (req: Request, res: Response) => {
  try {
    const { partnerName, webhookUrl, events, secret } = req.body;

    if (!partnerName || !webhookUrl || !events || !Array.isArray(events)) {
      return res.status(400).json({
        error: "Missing required fields: partnerName, webhookUrl, events (array)",
      });
    }

    const subscriptionId = `WEBHOOK-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const subscription: AnyRecord = {
      id: subscriptionId,
      partnerName,
      webhookUrl,
      events,
      secret: secret || generateSecret(),
      createdAt: new Date().toISOString(),
      createdBy: (req as any).user?.id || "SYSTEM",
      status: "ACTIVE",
      deliveryStats: {
        total: 0,
        successful: 0,
        failed: 0,
      },
    };

    webhookSubscriptions.set(subscriptionId, subscription);

    return res.status(201).json({
      success: true,
      message: "Webhook subscription created",
      data: subscription,
    });
  } catch (error) {
    logger.error({ error }, "Failed to create webhook subscription");
    return res.status(500).json({ error: "Failed to create webhook subscription" });
  }
});

/**
 * GET /webhooks/subscriptions - List webhook subscriptions
 */
router.get("/webhooks/subscriptions", (req: Request, res: Response) => {
  try {
    const subscriptions = Array.from(webhookSubscriptions.values());

    return res.json({
      success: true,
      data: subscriptions,
      count: subscriptions.length,
    });
  } catch (error) {
    logger.error({ error }, "Failed to list subscriptions");
    return res.status(500).json({ error: "Failed to list subscriptions" });
  }
});

/**
 * DELETE /webhooks/:subscriptionId - Remove webhook subscription
 */
router.delete("/webhooks/:subscriptionId", (req: Request, res: Response) => {
  try {
    const subscriptionId = String(req.params.subscriptionId);

    if (!webhookSubscriptions.has(subscriptionId)) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    webhookSubscriptions.delete(subscriptionId);

    return res.json({
      success: true,
      message: "Webhook subscription removed",
    });
  } catch (error) {
    logger.error({ error }, "Failed to remove subscription");
    return res.status(500).json({ error: "Failed to remove subscription" });
  }
});

/**
 * POST /webhooks/events - Log webhook event delivery
 */
router.post("/webhooks/events", (req: Request, res: Response) => {
  try {
    const { subscriptionId, eventType, status, timestamp } = req.body;

    if (!subscriptionId || !eventType || !status) {
      return res.status(400).json({
        error: "Missing required fields: subscriptionId, eventType, status",
      });
    }

    const subscription = webhookSubscriptions.get(subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    subscription.deliveryStats.total++;
    if (status === "SUCCESS") {
      subscription.deliveryStats.successful++;
    } else {
      subscription.deliveryStats.failed++;
    }

    return res.json({
      success: true,
      message: "Webhook event logged",
      data: {
        subscriptionId,
        eventType,
        status,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, "Failed to log webhook event");
    return res.status(500).json({ error: "Failed to log webhook event" });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Trigger webhook notification
 */
function triggerPartnerWebhook(eventType: string, payload: AnyRecord): void {
  const subscriptions = Array.from(webhookSubscriptions.values()).filter((s) =>
    s.events.includes(eventType)
  );

  for (const subscription of subscriptions) {
    // In production, would actually send HTTP POST to webhook URL
    logger.info(
      { webhookUrl: subscription.webhookUrl, eventType },
      "Triggering webhook notification"
    );

    // Simulate webhook delivery
    subscription.deliveryStats.total++;
    subscription.deliveryStats.successful++;
  }
}

/**
 * Generate secure webhook secret
 */
function generateSecret(): string {
  return `secret_${Math.random().toString(36).substring(2, 15)}_${Math.random()
    .toString(36)
    .substring(2, 15)}`;
}

export default router;
