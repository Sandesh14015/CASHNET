import { Router, type IRouter } from "express";

const router: IRouter = Router();
const getContext = async () => (await import("../../services/persistent-context")).getPersistentContext();
router.get("/cases/:id/audit", async (req, res) => {
  const context = await getContext();
  const actor = await context.authenticate.authenticate(req);
  await context.authorization.requireCaseAccess(actor, req.params.id, "AUDIT_READ", String(req.id));
  res.json(await context.audit.listByCase(req.params.id));
});
export default router;
