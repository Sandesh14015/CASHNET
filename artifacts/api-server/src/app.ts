import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import v1Router from "./routes/v1";
import { apiErrorHandler } from "./errors/middleware";
import { logger } from "./lib/logger";
import { corsMiddleware, rateLimitMiddleware, requestIdMiddleware, requestSizeLimitMiddleware, secureHeadersMiddleware } from "./middleware/security";
import { metricsMiddleware } from "./observability/metrics";
import { config } from "./config";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(requestIdMiddleware());
app.use(secureHeadersMiddleware());
app.use(corsMiddleware({ allowedOrigins: config.security.allowedOrigins, allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-Cashnet-Dev-Actor"] }));
app.use(rateLimitMiddleware({ windowMs: 60_000, maxRequests: config.security.rateLimitMaxRequests }));
app.use(requestSizeLimitMiddleware());
app.use(metricsMiddleware());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api/v1", v1Router);
app.use(apiErrorHandler);

export default app;
