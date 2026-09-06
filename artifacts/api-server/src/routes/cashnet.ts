import { Router, type IRouter } from "express";
import { AddComplaintBody, CreateCaseBody, CreateInterventionBody } from "@workspace/api-zod";
import { syntheticCaseService } from "../services/investigation/synthetic-case-service";

const router: IRouter = Router();

router.get("/dashboard", (_req, res) => res.json(syntheticCaseService.dashboard()));
router.get("/cases", (_req, res) => res.json(syntheticCaseService.listCases()));
router.post("/cases", (req, res) => {
  const parsed = CreateCaseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid case input" }); return; }
  res.status(201).json(syntheticCaseService.createCase(parsed.data));
});
router.get("/cases/:caseId", (req, res) => res.json(syntheticCaseService.detail(req.params.caseId)));
router.post("/cases/:caseId/analyze", (req, res) => res.json(syntheticCaseService.detail(req.params.caseId)));
router.post("/cases/:caseId/complaint", (req, res) => {
  const parsed = AddComplaintBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid report input" }); return; }
  res.json(syntheticCaseService.detail(req.params.caseId));
});
router.get("/fund-flow/:caseId", (req, res) => res.json(syntheticCaseService.detail(req.params.caseId).fundFlow));
router.get("/wallets", (_req, res) => res.json(syntheticCaseService.wallets()));
router.get("/predictions/:caseId", (req, res) => res.json(syntheticCaseService.detail(req.params.caseId).predictions));
router.get("/interventions/:caseId", (req, res) => res.json(syntheticCaseService.detail(req.params.caseId).intervention));
router.post("/interventions/:caseId", (req, res) => {
  const parsed = CreateInterventionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid intervention input" }); return; }
  res.status(201).json(syntheticCaseService.createIntervention(req.params.caseId, parsed.data.requestType));
});
router.post("/interventions/:caseId/approve", (req, res) => res.json(syntheticCaseService.approveIntervention(req.params.caseId)));
router.get("/reports/:caseId", (req, res) => res.json(syntheticCaseService.report(req.params.caseId)));

export default router;
