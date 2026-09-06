import { z } from "zod";

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  PORT: z.string().regex(/^\d+$/).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  CASHNET_DATA_MODE: z.enum(["synthetic", "authorized"]).optional(),
  API_VERSION: z.literal("v1").optional(),
  ETHERSCAN_API_KEY: z.string().min(1).optional(),
  ETHERSCAN_CHAIN_ID: z.string().regex(/^\d+$/).optional(),
  BITCOIN_ESPLORA_BASE_URL: z.string().url().optional(),
  TRONGRID_API_KEY: z.string().min(1).optional(),
  TRONGRID_BASE_URL: z.string().url().optional(),
  POLYGON_BLOCKSCOUT_BASE_URL: z.string().url().optional(),
  POLYGON_BLOCKSCOUT_API_KEY: z.string().min(1).optional(),
  SOLANA_RPC_URL: z.string().url().optional(),
  SOLANA_API_KEY: z.string().min(1).optional(),
  BNB_NODEREAL_BASE_URL: z.string().url().optional(),
  BNB_NODEREAL_API_KEY: z.string().min(1).optional(),
  CASHNET_PROVIDER_TIMEOUT_MS: z.string().regex(/^\d+$/).optional(),
  CASHNET_PROVIDER_MAX_RETRIES: z.string().regex(/^\d+$/).optional(),
  CASHNET_DEV_AUTH_ENABLED: z.enum(["true", "false"]).optional(),
  CASHNET_LABEL_DATASET_PATH: z.string().min(1).optional(),
  CASHNET_LABEL_DATASET_APPROVED: z.enum(["true", "false"]).optional(),
  CASHNET_LABEL_DATASET_NAME: z.string().min(1).optional(),
  CASHNET_LABEL_DATASET_VERSION: z.string().min(1).optional(),
  CASHNET_LABEL_DATASET_LICENSE: z.string().min(1).optional(),
  CASHNET_CORS_ALLOWED_ORIGINS: z.string().optional(),
  CASHNET_RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).optional(),
});

export type CashnetConfig = {
  environment: "development" | "test" | "production";
  port?: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  dataMode: "synthetic" | "authorized";
  apiVersion: "v1";
  developmentAuthEnabled: boolean;
  providers: {
    etherscan: { configured: boolean; chainId: string };
    bitcoinEsplora: { baseUrl?: string };
    trongrid: { configured: boolean; baseUrl: string };
    noderealBnb: { baseUrl: string; apiKey?: string; configured: boolean };
    polygon: { baseUrl?: string; apiKey?: string; configured: boolean };
    solana: { rpcUrl?: string; apiKey?: string; configured: boolean };
  };
  providerRequest: { timeoutMs: number; maxRetries: number };
  intelligence: { approvedDataset?: { path: string; name: string; version: string; license: string } };
  security: { allowedOrigins: string[]; rateLimitMaxRequests: number };
};

export function createConfig(environment: NodeJS.ProcessEnv = process.env): CashnetConfig {
  const parsed = EnvironmentSchema.parse(environment);
  const runtimeEnvironment = parsed.NODE_ENV ?? "development";
  const approvedDataset = parsed.CASHNET_LABEL_DATASET_APPROVED === "true" && parsed.CASHNET_LABEL_DATASET_PATH && parsed.CASHNET_LABEL_DATASET_NAME && parsed.CASHNET_LABEL_DATASET_VERSION && parsed.CASHNET_LABEL_DATASET_LICENSE
    ? { path: parsed.CASHNET_LABEL_DATASET_PATH, name: parsed.CASHNET_LABEL_DATASET_NAME, version: parsed.CASHNET_LABEL_DATASET_VERSION, license: parsed.CASHNET_LABEL_DATASET_LICENSE }
    : undefined;
  return {
    environment: runtimeEnvironment,
    port: parsed.PORT ? Number(parsed.PORT) : undefined,
    logLevel: parsed.LOG_LEVEL ?? "info",
    dataMode: parsed.CASHNET_DATA_MODE ?? "synthetic",
    apiVersion: parsed.API_VERSION ?? "v1",
    developmentAuthEnabled: runtimeEnvironment !== "production" && parsed.CASHNET_DEV_AUTH_ENABLED === "true",
    providers: {
      etherscan: { configured: Boolean(parsed.ETHERSCAN_API_KEY), chainId: parsed.ETHERSCAN_CHAIN_ID ?? "1" },
      bitcoinEsplora: { baseUrl: parsed.BITCOIN_ESPLORA_BASE_URL },
      trongrid: { configured: Boolean(parsed.TRONGRID_API_KEY), baseUrl: parsed.TRONGRID_BASE_URL ?? "https://api.trongrid.io" },
      noderealBnb: { configured: Boolean(parsed.BNB_NODEREAL_API_KEY), apiKey: parsed.BNB_NODEREAL_API_KEY, baseUrl: parsed.BNB_NODEREAL_BASE_URL ?? "https://bsc-mainnet.nodereal.io/v1" },
      polygon: { baseUrl: parsed.POLYGON_BLOCKSCOUT_BASE_URL, apiKey: parsed.POLYGON_BLOCKSCOUT_API_KEY, configured: true },
      solana: { rpcUrl: parsed.SOLANA_RPC_URL, apiKey: parsed.SOLANA_API_KEY, configured: Boolean(parsed.SOLANA_RPC_URL) },
    },
    providerRequest: { timeoutMs: Number(parsed.CASHNET_PROVIDER_TIMEOUT_MS ?? "10000"), maxRetries: Number(parsed.CASHNET_PROVIDER_MAX_RETRIES ?? "2") },
    intelligence: { approvedDataset },
    security: { allowedOrigins: (parsed.CASHNET_CORS_ALLOWED_ORIGINS ?? (runtimeEnvironment === "production" ? "" : "http://localhost:5173")).split(",").map((value) => value.trim()).filter(Boolean), rateLimitMaxRequests: Number(parsed.CASHNET_RATE_LIMIT_MAX_REQUESTS ?? "120") },
  };
}

export const config = createConfig();
