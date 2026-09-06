import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getDatabase } from "@workspace/db";
import { config } from "../config";
import { renderMetrics } from "../observability/metrics";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  const checks: Record<string, string> = { process: "ok" };
  if (process.env.DATABASE_URL) {
    try {
      await getDatabase().db.execute("select 1");
      checks.database = "ok";
    } catch {
      checks.database = "unavailable";
      res.status(503).json({ status: "not_ready", checks });
      return;
    }
  } else {
    checks.database = "not_configured";
    if (config.environment === "production") {
      res.status(503).json({ status: "not_ready", checks });
      return;
    }
  }
  res.json({ status: "ok", checks });
});

router.get("/metrics", (_req, res) => {
  res.type("text/plain; version=0.0.4").send(renderMetrics());
});

export default router;
