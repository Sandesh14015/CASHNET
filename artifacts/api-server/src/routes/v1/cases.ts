import { Router, type IRouter } from "express";
import { z } from "zod";

const createCaseSchema = z.object({ caseNumber: z.string().min(1).max(100), title: z.string().min(1).max(500), description: z.string().min(1).max(10000), fraudType: z.string().min(1).max(200), reportedAmount: z.string().regex(/^\d+(\.\d+)?$/), priority: z.string().min(1).max(40).optional() }).strict();
const updateCaseSchema = z.object({ title: z.string().min(1).max(500).optional(), description: z.string().min(1).max(10000).optional(), priority: z.string().min(1).max(40).optional(), status: z.enum(["OPEN", "IN_PROGRESS", "ON_HOLD", "CLOSED", "ARCHIVED"]).optional(), assignedTo: z.string().uuid().nullable().optional(), investigationAuthorizationStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional() }).strict();
const idParam = z.object({ id: z.string().uuid() });
const router: IRouter = Router();
const getContext = async () => (await import("../../services/persistent-context")).getPersistentContext();

router.post("/", async (req, res) => { const context = await getContext(); const actor = await context.authenticate.authenticate(req); const record = await context.cases.create(actor, createCaseSchema.parse(req.body), String(req.id)); res.status(201).json(record); });
router.get("/", async (req, res) => { const context = await getContext(); const actor = await context.authenticate.authenticate(req); res.json(await context.cases.list(actor, String(req.id))); });
router.get("/:id", async (req, res) => { const context = await getContext(); const actor = await context.authenticate.authenticate(req); const { id } = idParam.parse(req.params); res.json(await context.cases.get(actor, id, String(req.id))); });
router.patch("/:id", async (req, res) => { const context = await getContext(); const actor = await context.authenticate.authenticate(req); const { id } = idParam.parse(req.params); res.json(await context.cases.update(actor, id, updateCaseSchema.parse(req.body), String(req.id))); });

export default router;
