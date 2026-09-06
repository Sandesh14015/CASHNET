import { Router, type IRouter } from "express";
import { z } from "zod";
import { ValidationFailureError } from "../../errors/app-error";
const params = z.object({ chain: z.enum(["BITCOIN", "ETHEREUM", "TRON", "BNB_CHAIN", "POLYGON", "SOLANA", "OTHER"]), address: z.string().min(3).max(256) }).strict();
const scope = z.object({ investigation_id: z.string().uuid() }).strict();
const router: IRouter = Router();
const getContext = async () => (await import("../../services/persistent-context")).getPersistentContext();
router.get("/:chain/:address", async (req, res) => { const context = await getContext(); const actor = await context.authenticate.authenticate(req); const input = params.parse(req.params); const query = scope.parse(req.query); const investigation = await context.investigations.get(actor, query.investigation_id, String(req.id)); if (investigation.chain !== input.chain) throw new ValidationFailureError("Lookup chain must match the authorized investigation chain."); await context.authorization.requirePermission(actor, "INVESTIGATION_READ", String(req.id)); const result = await context.blockchain.wallet(actor, input.chain, input.address); await context.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "SCOPED_PROVIDER_WALLET_LOOKUP", resourceType: "investigation", resourceId: investigation.id, requestId: String(req.id), result: "SUCCESS", metadata: { chain: input.chain, provider: result.provider } }); res.json(result); });
export default router;
