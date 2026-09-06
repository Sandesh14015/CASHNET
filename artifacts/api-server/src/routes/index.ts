import { Router, type IRouter } from "express";
import integrationsRouter from "./integrations";
import healthRouter from "./health";
import cashnetRouter from "./cashnet";
import geospatialRouter from "./geospatial";
import legalHoldRouter from "./legal-hold";
import casesExtendedRouter from "./cases-extended";
import evidencePackagesRouter from "./evidence-packages";
import actionRequestsRouter from "./action-requests";
import modelsRouter from "./models";

const router: IRouter = Router();

router.use("/integrations", integrationsRouter);
router.use(healthRouter);
router.use(cashnetRouter);
router.use(geospatialRouter);
router.use(legalHoldRouter);
router.use(casesExtendedRouter);
router.use(evidencePackagesRouter);
router.use(actionRequestsRouter);
router.use("/models", modelsRouter);

export default router;
