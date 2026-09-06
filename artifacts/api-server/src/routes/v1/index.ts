import { Router, type IRouter } from "express";
import { config } from "../../config";
import { v1NotFoundHandler } from "../../errors/middleware";
import casesRouter from "./cases";
import investigationsRouter from "./investigations";
import evidenceRouter from "./evidence";
import auditRouter from "./audit";
import walletsRouter from "./wallets";
import transactionsRouter from "./transactions";

const router: IRouter = Router();

router.get("/health", (_req, res) => res.json({ status: "ok", dataMode: config.dataMode }));
router.get("/version", (_req, res) => res.json({ apiVersion: config.apiVersion, dataMode: config.dataMode }));

// These groups establish the public v1 boundary. Business logic is added in later phases.
router.use("/cases", casesRouter);
router.use("/wallets", walletsRouter);
router.use("/transactions", transactionsRouter);
router.use("/graph", Router());
router.use("/entities", Router());
router.use("/vasps", Router());
router.use("/investigations", investigationsRouter);
router.use("/evidence", evidenceRouter);
router.use(auditRouter);
router.use(v1NotFoundHandler);

export default router;
