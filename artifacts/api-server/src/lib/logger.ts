import pino from "pino";
import { config } from "../config";

const isProduction = config.environment === "production";

export const logger = pino({
  level: config.logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "req.headers['x-api-key']",
    "req.headers['x-cashnet-dev-actor']",
    "req.body.apiKey",
    "req.body.api_key",
    "req.body.token",
    "req.body.secret",
    "req.body.privateKey",
    "req.body.private_key",
    "req.body.seedPhrase",
    "req.body.seed_phrase",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
