import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import app from "./app";
import { rateLimitMiddleware } from "./middleware/security";
import { createConfig } from "./config";
import { apiErrorHandler, operationalErrorDetails } from "./errors/middleware";
import v1Router from "./routes/v1";
import { SyntheticBlockchainProvider } from "./services/blockchain/provider";
import { syntheticCaseService } from "./services/investigation/synthetic-case-service";
import { BlockchainTransactionSchema, WalletSchema } from "./schemas/models";

async function request(path: string) {
  const testApp = express();
  testApp.use("/api/v1", v1Router);
  testApp.use(apiErrorHandler);
  const server = createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestApp(path: string, init?: RequestInit) {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("production security middleware is executed by real HTTP requests", async () => {
  const response = await requestApp("/api/healthz", { headers: { Origin: "https://untrusted.example", "X-Request-ID": "audit-request-1" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "audit-request-1");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const oversized = await requestApp("/api/healthz", { method: "POST", headers: { "Content-Type": "text/plain", "Content-Length": "1048577" }, body: "x".repeat(1_048_577) });
  assert.equal(oversized.status, 413);
});

test("rate limiting middleware rejects excessive real HTTP requests", async () => {
  const limited = express();
  limited.use(rateLimitMiddleware({ windowMs: 60_000, maxRequests: 1 }));
  limited.get("/", (_req, res) => res.json({ ok: true }));
  const server = createServer(limited);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/`, { headers: { "X-Forwarded-For": "198.51.100.1" } })).status, 200);
    const blocked = await fetch(`http://127.0.0.1:${address.port}/`, { headers: { "X-Forwarded-For": "198.51.100.2" } });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get("retry-after"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("production readiness fails closed when a persistent database is not configured", async () => {
  const healthRoute = await readFile(new URL("../src/routes/health.ts", import.meta.url), "utf8");
  assert.match(healthRoute, /config\.environment === "production"/);
  assert.match(healthRoute, /res\.status\(503\)\.json\(\{ status: "not_ready", checks \}\)/);
});

test("configuration defaults to explicit synthetic mode without exposing provider secrets", () => {
  const config = createConfig({ CASHNET_DATA_MODE: "synthetic", ETHERSCAN_API_KEY: "secret" });
  assert.equal(config.dataMode, "synthetic");
  assert.equal(config.providers.etherscan.configured, true);
  assert.equal("apiKey" in config.providers.etherscan, false);
  assert.throws(() => createConfig({ CASHNET_DATA_MODE: "invalid" }), /Invalid enum value/);
});

test("normalized wallet and transaction schemas preserve provenance and raw references", () => {
  const provenance = { sourceType: "SYNTHETIC" as const, provider: "fixture", sourceReference: "fixture://1", retrievedAt: "2026-08-18T10:00:00.000Z", method: "fixture", rawReference: "fixture://raw/1" };
  const wallet = WalletSchema.parse({ id: "wallet-1", caseId: "case-1", createdAt: "2026-08-18T10:00:00.000Z", address: "wallet-address", chain: "BITCOIN", provenance });
  const transaction = BlockchainTransactionSchema.parse({ id: "tx-1", caseId: "case-1", createdAt: "2026-08-18T10:00:00.000Z", chain: "BITCOIN", transactionHash: "txid", inputs: [{ index: 0, previousTransactionHash: "previous", previousOutputIndex: 1 }], outputs: [{ index: 0, value: "1000", spendingTransactionHash: "spending" }], provenance });
  assert.equal(wallet.provenance.sourceType, "SYNTHETIC");
  assert.equal(transaction.inputs[0].previousOutputIndex, 1);
  assert.equal(transaction.provenance.rawReference, "fixture://raw/1");
});

test("synthetic provider is a server-side provider contract implementation", async () => {
  const provider = new SyntheticBlockchainProvider();
  assert.equal(await provider.validateAddress("seed-address", "ETHEREUM"), true);
  const wallet = await provider.getWalletProfile("seed-address", "ETHEREUM");
  assert.equal(wallet?.provenance.sourceType, "SYNTHETIC");
  assert.deepEqual(await provider.getTransactions("seed-address", "ETHEREUM"), []);
});

test("v1 health and error responses are consistent while synthetic fixtures remain available", async () => {
  const health = await request("/api/v1/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", dataMode: "synthetic" });

  const missing = await request("/api/v1/not-a-route");
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: { code: "NOT_FOUND", message: "No API v1 route matches GET /not-a-route" } });

  assert.equal(syntheticCaseService.listCases().length, 4);
  assert.equal(syntheticCaseService.wallets()[0].sourceType, "SYNTHETIC");
});

test("unexpected PostgreSQL diagnostics remain server-observable but redact connection secrets", () => {
  const pgError = Object.assign(new Error("column \"status\" does not exist; password=do-not-log"), {
    code: "42703",
    table: "users",
    column: "status",
  });
  assert.deepEqual(operationalErrorDetails(pgError), {
    type: "Error",
    message: "column \"status\" does not exist; password= [REDACTED]",
    databaseCode: "42703",
    table: "users",
    column: "status",
  });
});

test("Phase 1 migration contains the required indexed normalized records", async () => {
  const migration = await readFile(new URL("../../../database/migrations/20260827_phase1_foundation.sql", import.meta.url), "utf8");
  for (const requiredTable of ["investigations", "wallets", "blockchain_transactions", "entities", "evidence", "vasp_candidates"]) assert.match(migration, new RegExp(`create table if not exists ${requiredTable}`));
  for (const requiredIndex of ["investigations_case_id_idx", "wallets_chain_address_idx", "transactions_chain_hash_idx", "transactions_block_number_idx", "labels_chain_address_idx"]) assert.match(migration, new RegExp(requiredIndex));
});
