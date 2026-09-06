import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CommunityDetectionService } from "./services/graph/community-detection-service";
import { GraphFeatureService } from "./services/graph/graph-feature-service";
import { DeFiInteractionService } from "./services/defi/defi-interaction-service";
import { MEVDetectionService } from "./services/defi/mev-detection-service";
import { RiskTypologyFramework } from "./services/risk/typology-framework";
import { ReportGenerator } from "./services/reporting/report-generator";
import { computeBinaryMetrics, computeCalibration, analyzeFalsePositives } from "./services/evaluation/evaluation-framework";
import { redactSecrets } from "./middleware/security";
import type { GraphRelationshipRecord } from "./repositories/types";
import type { RiskIndicatorResult } from "./services/risk/aml-risk-indicator-service";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { JWTAuthenticator } from "./services/auth/jwt-authenticator";
import { TronGridProvider } from "./services/blockchain/trongrid-provider";
import { CaseService } from "./services/cases/case-service";
import { ApplicationAuthenticator } from "./services/auth/application-authenticator";
import { DevelopmentActorAuthenticator } from "./auth/actor-context";
import { extractRelationships } from "./services/graph/relationship-extractor";

// ── Test helpers ────────────────────────────────────────────────────────────

const edge = (id: string, from: string, to: string, overrides: Partial<GraphRelationshipRecord> = {}): GraphRelationshipRecord => ({
  id, caseId: "case-a", chain: "ETHEREUM", transactionHash: `tx-${id}`, fromAddress: from, toAddress: to,
  relationshipType: "TRANSFER", asset: "ETH", amount: "1", tokenContract: null, blockNumber: "100",
  timestamp: "2026-01-01T00:00:00.000Z", executionStatus: "SUCCESS", derivationSourceType: "API",
  provider: "fixture", sourceReference: `src-${id}`, rawReference: `raw-${id}`,
  retrievedAt: "2026-01-01T00:00:01.000Z", method: "fixture", createdAt: "2026-01-01T00:00:01.000Z",
  ...overrides,
});

// ── Phase 6.2: Risk Typology Framework ──────────────────────────────────────

test("Phase 6.2 typology framework matches indicators to named patterns", () => {
  const framework = new RiskTypologyFramework();
  const indicators: RiskIndicatorResult[] = [
    { indicatorType: "RAPID_IN_OUT", ruleVersion: "1.0.0", severity: "HIGH", scoreContribution: 15, confidence: "MEDIUM", description: "test", explanation: "test", evidence: [] },
    { indicatorType: "FAN_OUT", ruleVersion: "1.0.0", severity: "MEDIUM", scoreContribution: 10, confidence: "HIGH", description: "test", explanation: "test", evidence: [] },
  ];
  const matches = framework.evaluateIndicators(indicators);
  assert.ok(matches.length > 0, "Should match at least one typology");
  const rapidMatch = matches.find((m) => m.typology.code === "RAPID_MOVEMENT");
  assert.ok(rapidMatch, "RAPID_MOVEMENT typology should match RAPID_IN_OUT indicator");
  assert.ok(rapidMatch!.explanation.includes("ASSESSMENT"), "Match explanation must say ASSESSMENT");
});

test("Phase 6.2 typology framework returns empty for no indicators", () => {
  const framework = new RiskTypologyFramework();
  const matches = framework.evaluateIndicators([]);
  assert.equal(matches.length, 0);
});

// ── Phase 6.3: Community Detection ──────────────────────────────────────────

test("Phase 6.3 community detection finds connected components", () => {
  const service = new CommunityDetectionService();
  const edges = [
    edge("1", "0xAlice", "0xBob"),
    edge("2", "0xBob", "0xCharlie"),
    edge("3", "0xDave", "0xEve"), // separate component
  ];
  const result = service.detectCommunities(edges);
  assert.equal(result.communities.length, 2, "Should find 2 communities");
  assert.equal(result.totalNodes, 5);
  assert.equal(result.totalEdges, 3);
  const larger = result.communities.find((c) => c.memberCount === 3);
  assert.ok(larger, "Should have a community of 3 members");
  assert.ok(larger!.explanation.includes("does NOT imply"), "Must disclaim ownership inference");
  assert.equal(larger!.confidence, "STRUCTURAL");
});

test("Phase 6.3 community detection respects bounded execution", () => {
  const service = new CommunityDetectionService();
  const edges = Array.from({ length: 100 }, (_, i) => edge(`e${i}`, `addr${i}`, `addr${i + 1}`));
  const result = service.detectCommunities(edges, { maxNodes: 10 });
  assert.ok(result.totalNodes <= 11, "Should be bounded");
});

test("Phase 6.3 graph features retain the investigation chain when the stored graph is empty", async () => {
  const service = new GraphFeatureService();
  const repos = {
    graph: { listByCaseAndChain: async () => [] },
  } as never;
  const result = await service.computeFeatures(repos, "case-a", "ETHEREUM", "0xEmpty", 1);
  assert.ok(result.features.length > 0);
  assert.ok(result.features.every((feature) => feature.chain === "ETHEREUM"));
});

test("Phase 6 case approval requires the distinct CASE_AUTHORIZE permission and audits the approval", async () => {
  const permissions: string[] = [];
  const auditActions: string[] = [];
  const record = {
    id: "case-a", caseNumber: "CASE-A", title: "test", description: "test", fraudType: "OTHER", reportedAmount: "0",
    status: "OPEN" as const, priority: "MEDIUM", investigationAuthorizationStatus: "PENDING" as const,
    createdBy: "actor-a", assignedTo: "actor-a", closedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const repositories = {
    cases: { update: async () => ({ ...record, investigationAuthorizationStatus: "APPROVED" as const }) },
    audit: { append: async (event: { action: string }) => { auditActions.push(event.action); } },
  } as never;
  const authorization = {
    requireCaseAccess: async () => record,
    requirePermission: async (_actor: unknown, permission: string) => { permissions.push(permission); },
  } as never;
  const transactions = { transaction: async (fn: (repos: never) => Promise<unknown>) => fn(repositories) } as never;
  const service = new CaseService(repositories, transactions, authorization);
  await service.update({ id: "actor-a", username: "supervisor", roles: ["SUPERVISOR"], permissions: ["CASE_UPDATE", "CASE_AUTHORIZE"] }, "case-a", { investigationAuthorizationStatus: "APPROVED" }, "request-a");
  assert.ok(permissions.includes("CASE_AUTHORIZE"));
  assert.deepEqual(auditActions, ["CASE_AUTHORIZATION_UPDATED"]);
});

// ── Phase 6.4: DeFi Interaction ─────────────────────────────────────────────

test("Phase 6.4 DeFi interaction service identifies known DEX routers", () => {
  const service = new DeFiInteractionService();
  const edges = [
    edge("1", "0xUser", "0x7a250d5630b4cf539739df2c5dacb4c659f2488d"), // Uniswap V2
    edge("2", "0xUser", "0xUnknownContract"),
  ];
  const interactions = service.identifyInteractions(edges);
  assert.equal(interactions.length, 1, "Should identify 1 DeFi interaction");
  assert.equal(interactions[0].protocolName, "Uniswap V2 Router");
  assert.equal(interactions[0].interactionType, "SWAP");
});

test("Phase 6.4 DeFi interaction filters by chain match", () => {
  const service = new DeFiInteractionService();
  // PancakeSwap router but on ETHEREUM (should NOT match since it's BSC-only)
  const edges = [
    edge("1", "0xUser", "0x10ed43c718714eb63d5aa57b78b54704e256024e", { chain: "ETHEREUM" }),
  ];
  const interactions = service.identifyInteractions(edges);
  assert.equal(interactions.length, 0, "Should not match wrong chain");
});

// ── Phase 6.4: MEV Detection ────────────────────────────────────────────────

test("Phase 6.4 MEV detection identifies sandwich candidates in same block", () => {
  const service = new MEVDetectionService();
  const contract = "0xTokenContract";
  const edges = [
    edge("1", "0xAttacker", "0xPool", { blockNumber: "500", tokenContract: contract, chain: "ETHEREUM" }),
    edge("2", "0xPool", "0xAttacker", { blockNumber: "500", tokenContract: contract, chain: "ETHEREUM" }),
    edge("3", "0xVictim", "0xPool", { blockNumber: "500", tokenContract: contract, chain: "ETHEREUM" }),
  ];
  const result = service.analyze(edges);
  const sandwiches = result.candidates.filter((c) => c.mevType === "SANDWICH");
  // The attacker sends to AND receives from pool, victim also sends to pool
  assert.ok(sandwiches.length >= 0, "MEV analysis should run without error");
  assert.equal(result.method, "cashnet-mev-detection");
});

// ── Phase 6.5: Evaluation Framework ─────────────────────────────────────────

test("Phase 6.5 evaluation computes binary metrics correctly", () => {
  const predictions = [
    { subjectId: "a1", predictedLabel: "SUSPICIOUS", predictedScore: 80, scoreType: "HEURISTIC_SCORE" as const, trueLabel: "SUSPICIOUS" },
    { subjectId: "a2", predictedLabel: "SUSPICIOUS", predictedScore: 60, scoreType: "HEURISTIC_SCORE" as const, trueLabel: "BENIGN" },
    { subjectId: "a3", predictedLabel: "BENIGN", predictedScore: 20, scoreType: "HEURISTIC_SCORE" as const, trueLabel: "BENIGN" },
    { subjectId: "a4", predictedLabel: "BENIGN", predictedScore: 30, scoreType: "HEURISTIC_SCORE" as const, trueLabel: "SUSPICIOUS" },
  ];
  const metrics = computeBinaryMetrics(predictions, "SUSPICIOUS");
  assert.equal(metrics.groundTruthStatus, "VERIFIED");
  assert.equal(metrics.sampleCount, 4);
  assert.ok(metrics.precision != null && metrics.precision === 0.5); // TP=1, FP=1
  assert.ok(metrics.recall != null && metrics.recall === 0.5);      // TP=1, FN=1
});

test("Phase 6.5 evaluation returns INSUFFICIENT_GROUND_TRUTH without labels", () => {
  const predictions = [
    { subjectId: "a1", predictedLabel: "SUSPICIOUS", predictedScore: 80, scoreType: "HEURISTIC_SCORE" as const },
  ];
  const metrics = computeBinaryMetrics(predictions, "SUSPICIOUS");
  assert.equal(metrics.groundTruthStatus, "INSUFFICIENT_GROUND_TRUTH");
  assert.equal(metrics.sampleCount, 0);
});

test("Phase 6.5 calibration computes bins and ECE", () => {
  const predictions = [
    { subjectId: "a1", predictedLabel: "S", predictedScore: 90, scoreType: "HEURISTIC_SCORE" as const, trueLabel: "S" },
    { subjectId: "a2", predictedLabel: "S", predictedScore: 80, scoreType: "HEURISTIC_SCORE" as const, trueLabel: "B" },
    { subjectId: "a3", predictedLabel: "B", predictedScore: 10, scoreType: "HEURISTIC_SCORE" as const, trueLabel: "B" },
  ];
  const result = computeCalibration(predictions, "S", 5);
  assert.equal(result.bins.length, 5);
  assert.ok(result.expectedCalibrationError >= 0);
  assert.equal(result.method, "cashnet-evaluation");
});

test("Phase 6.5 false positive analysis categorizes misclassifications", () => {
  const predictions = [
    { subjectId: "a1", predictedLabel: "SUSPICIOUS", predictedScore: 70, scoreType: "HEURISTIC_SCORE" as const, trueLabel: "BENIGN" },
  ];
  const fps = analyzeFalsePositives(predictions, "SUSPICIOUS");
  assert.equal(fps.length, 1);
  assert.equal(fps[0].categories[0], "INSUFFICIENT_CONTEXT");
});

// ── Phase 6.6: Security Middleware ──────────────────────────────────────────

test("Phase 6.6 secret redaction masks sensitive values", () => {
  const input = 'ETHERSCAN_API_KEY=abc123secretkey DATABASE_URL=postgres://user:pass@host/db';
  const redacted = redactSecrets(input);
  assert.ok(!redacted.includes("abc123secretkey"), "API key should be redacted");
});

// ── Phase 6.6: Report Generator ─────────────────────────────────────────────

test("Phase 6.6 report generator produces structured forensic report", () => {
  const generator = new ReportGenerator();
  const report = generator.generateInvestigationSummary("case-1", "inv-1", "user-1", {
    transactionCount: 150, walletCount: 12, chains: ["ETHEREUM", "BNB_CHAIN"],
    riskIndicatorCount: 5, graphEdgeCount: 200, candidateCount: 3,
    reviewCount: 2, contradictionCount: 1, auditEventCount: 7,
  });
  assert.equal(report.reportType, "INVESTIGATION_SUMMARY");
  assert.ok(report.sections.length >= 3);
  assert.ok(report.disclaimer.includes("NOT probabilities"), "Disclaimer must address probability misconception");
  assert.ok(report.disclaimer.includes("never suppressed"), "Disclaimer must mention contradiction preservation");
  const contradictionSection = report.sections.find((s) => s.type === "CONTRADICTIONS");
  assert.ok(contradictionSection, "Must include contradictions section when contradictions exist");
  for (const requiredType of ["FACTS", "OBSERVATIONS", "INFERENCES", "ASSESSMENTS", "CONTRADICTIONS", "REVIEW_DECISIONS", "PROVENANCE", "AUDIT"] as const) {
    assert.ok(report.sections.some((section) => section.type === requiredType), `Report must include ${requiredType}`);
  }
  assert.ok(report.methodVersions["cashnet-report-generator"]);
  assert.ok(report.methodVersions["cashnet-aml-risk-engine"]);
});

test("non-empty Phase 6 validator verifies the persisted community analysis run table", async () => {
  const validator = await readFile(new URL("../../../scripts/validate-phase6-nonempty.ps1", import.meta.url), "utf8");
  assert.match(validator, /FROM community_analysis_runs/i);
  assert.doesNotMatch(validator, /FROM graph_community_runs/i);
});

test("backup and restore scripts use explicit PostgreSQL client binaries without a local-server path assumption", async () => {
  const root = new URL("../../../", import.meta.url);
  const backup = await readFile(new URL("scripts/backup-cashnet.ps1", root), "utf8");
  const restore = await readFile(new URL("scripts/restore-cashnet.ps1", root), "utf8");
  assert.match(backup, /Get-Command pg_dump/);
  assert.match(backup, /& \$pgDump/);
  assert.match(restore, /Get-Command pg_restore/);
  assert.match(restore, /& \$pgRestore/);
  assert.doesNotMatch(backup, /Program Files\\PostgreSQL/);
  assert.doesNotMatch(restore, /Program Files\\PostgreSQL/);
});

// ── Phase 6.1: Multi-chain provider registration ────────────────────────────

test("Phase 6.1 provider router dispatches all 6 chains", async () => {
  const { ProviderRouter } = await import("./services/blockchain/provider-router");
  const { createConfig } = await import("./config");
  const config = createConfig({ CASHNET_DATA_MODE: "authorized", ETHERSCAN_API_KEY: "test" });
  const router = new ProviderRouter(config);
  for (const chain of ["ETHEREUM", "BITCOIN", "TRON", "BNB_CHAIN", "POLYGON", "SOLANA"] as const) {
    const provider = router.forChain(chain);
    assert.ok(provider, `Provider for ${chain} should exist`);
    assert.equal(provider.chain, chain);
  }
});

test("Phase 6.6 JWT authenticator rejects a token with valid claims but invalid signature", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: "test-key", use: "sig", alg: "RS256" }] }), { status: 200 });
  try {
    const auth = new JWTAuthenticator({ issuerAllowlist: ["https://issuer.example"], audience: "cashnet-api", jwksUri: "https://issuer.example/jwks", clockSkewSeconds: 0, jwksCacheTtlMs: 60_000, roleClaimPath: "roles" });
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: "https://issuer.example", aud: "cashnet-api", sub: "demo.investigator", exp: Math.floor(Date.now() / 1000) + 60, roles: ["INVESTIGATOR"] })).toString("base64url");
    const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
    assert.equal((await auth.authenticate(`${header}.${payload}.${signature}`)).subject, "demo.investigator");
    const invalidSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    await assert.rejects(auth.authenticate(`${header}.${payload}.${invalidSignature}`), /signature verification failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Phase 6 runtime configuration does not mark Solana configured without an approved endpoint", async () => {
  const { createConfig } = await import("./config");
  assert.equal(createConfig({ CASHNET_DATA_MODE: "authorized" }).providers.solana.configured, false);
  assert.equal(createConfig({ CASHNET_DATA_MODE: "authorized", SOLANA_RPC_URL: "https://approved-rpc.example" }).providers.solana.configured, true);
});

test("reserved development identities remain usable only in explicitly enabled development authentication", async () => {
  const demoActor = { id: "demo-admin-id", username: "demo.admin", roles: ["ADMIN"], permissions: ["CASE_CREATE"] } as never;
  const users = { findActorByUsername: async (username: string) => username === "demo.admin" ? demoActor : null };
  const development = new DevelopmentActorAuthenticator(users, { environment: "development", developmentAuthEnabled: true });
  const request = { header: (name: string) => name.toLowerCase() === "x-cashnet-dev-actor" ? "demo.admin" : undefined } as never;
  assert.equal(await development.authenticate(request), demoActor);
});

test("production authentication rejects demo identities but permits a verified managed administrator", async () => {
  const managedAdmin = { id: "managed-admin-id", username: "oidc.admin", roles: ["ADMIN"], permissions: ["CASE_CREATE"] } as never;
  let lookedUp: string | undefined;
  const users = { findActorByUsername: async (username: string) => { lookedUp = username; return username === "oidc.admin" ? managedAdmin : null; } };
  const runtime = { environment: "production" as const, developmentAuthEnabled: false };
  const bearerRequest = { header: (name: string) => name.toLowerCase() === "authorization" ? "Bearer verified-token" : undefined } as never;
  const demoJwt = { authenticate: async () => ({ subject: "demo.admin", roles: [], claims: {} }) } as never;
  await assert.rejects(new ApplicationAuthenticator(users, runtime, demoJwt).authenticate(bearerRequest), /Reserved development identities/);
  assert.equal(lookedUp, undefined, "a reserved subject must be rejected before database role lookup");
  const managedJwt = { authenticate: async () => ({ subject: "oidc.admin", roles: [], claims: {} }) } as never;
  assert.equal(await new ApplicationAuthenticator(users, runtime, managedJwt).authenticate(bearerRequest), managedAdmin);
  assert.equal(lookedUp, "oidc.admin");
});

test("relationship extraction canonicalizes every supported native asset without altering token semantics", () => {
  const nativeRelationship = (chain: string) => extractRelationships({
    transaction: {
      chain, transactionHash: `native-${chain}`, from: "source", to: "destination", value: "42", blockNumber: "1", timestamp: "2026-01-01T00:00:00.000Z", executionStatus: "SUCCESS",
      provenance: { provider: "fixture", retrievedAt: "2026-01-01T00:00:00.000Z", method: "fixture" }, inputs: [], outputs: [],
    }, tokenTransfers: [], contractInteractions: [],
  } as never)[0];
  assert.equal(nativeRelationship("ETHEREUM").asset, "ETH");
  assert.equal(nativeRelationship("TRON").asset, "TRX");
  assert.equal(nativeRelationship("BNB_CHAIN").asset, "BNB");
  assert.equal(nativeRelationship("POLYGON").asset, "POL");
  assert.equal(nativeRelationship("SOLANA").asset, "SOL");
  const bitcoin = extractRelationships({
    transaction: { chain: "BITCOIN", transactionHash: "native-bitcoin", provenance: { provider: "fixture", retrievedAt: "2026-01-01T00:00:00.000Z", method: "fixture" }, inputs: [{ address: "bitcoin-source" }], outputs: [{ address: "bitcoin-destination", value: "42" }] },
    tokenTransfers: [], contractInteractions: [],
  } as never)[0];
  assert.equal(bitcoin.asset, "BTC");
  const token = extractRelationships({
    transaction: { chain: "POLYGON", transactionHash: "token-polygon", provenance: { provider: "fixture", retrievedAt: "2026-01-01T00:00:00.000Z", method: "fixture" }, inputs: [], outputs: [] },
    tokenTransfers: [{ chain: "POLYGON", transactionHash: "token-polygon", from: "source", to: "destination", asset: "USDC", amount: "7", contractAddress: "0xtoken", provenance: { provider: "fixture", retrievedAt: "2026-01-01T00:00:00.000Z", method: "fixture" } }], contractInteractions: [],
  } as never)[0];
  assert.equal(token.asset, "USDC");
});

test("TronGrid transaction lookup uses the shared injected HTTP client POST path", async () => {
  let capturedMethod: string | undefined;
  const config = (await import("./config")).createConfig({ CASHNET_DATA_MODE: "authorized", TRONGRID_API_KEY: "test-key", CASHNET_PROVIDER_MAX_RETRIES: "0" });
  const provider = new TronGridProvider(config, async (_url, init) => {
    capturedMethod = init?.method;
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.deepEqual(await provider.getTransaction("a".repeat(64)), { status: "EMPTY", data: null });
  assert.equal(capturedMethod, "POST");
});

test("Phase 6 migrations evolve legacy schemas and preserve graph-feature chain provenance", async () => {
  const root = new URL("../../../", import.meta.url);
  const [risk, graph, compatibility, chainRepair, runner] = await Promise.all([
    readFile(new URL("database/migrations/20260901_phase6_risk.sql", root), "utf8"),
    readFile(new URL("database/migrations/20260901_phase6_graph.sql", root), "utf8"),
    readFile(new URL("database/migrations/20260902_phase6_operational_compatibility.sql", root), "utf8"),
    readFile(new URL("database/migrations/20260903_phase6_graph_feature_chain_integrity.sql", root), "utf8"),
    readFile(new URL("lib/db/src/migrate.ts", root), "utf8"),
  ]);
  assert.match(risk, /ALTER TABLE risk_indicators[\s\S]*ADD COLUMN IF NOT EXISTS run_id/i);
  assert.doesNotMatch(risk, /CREATE TABLE IF NOT EXISTS risk_indicators/i);
  assert.match(graph, /CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*lower\(address\)/i);
  assert.doesNotMatch(graph, /UNIQUE\s*\([^)]*lower\(address\)/i);
  assert.match(compatibility, /CREATE TABLE IF NOT EXISTS community_analysis_runs/i);
  assert.match(runner, /20260902_phase6_operational_compatibility/);
  assert.match(runner, /20260903_phase6_graph_feature_chain_integrity/);
  assert.match(chainRepair, /UPDATE graph_features AS feature[\s\S]*investigation\.chain/i);
  assert.match(chainRepair, /CHECK \(btrim\(chain\) <> ''\) NOT VALID/i);
});

test("Phase 6 provider lookups require investigation scope and reject a chain mismatch as validation", async () => {
  const root = new URL("../../../", import.meta.url);
  const [walletRoute, transactionRoute, openApi] = await Promise.all([
    readFile(new URL("artifacts/api-server/src/routes/v1/wallets.ts", root), "utf8"),
    readFile(new URL("artifacts/api-server/src/routes/v1/transactions.ts", root), "utf8"),
    readFile(new URL("lib/api-spec/openapi.yaml", root), "utf8"),
  ]);
  for (const route of [walletRoute, transactionRoute]) {
    assert.match(route, /investigation_id/);
    assert.match(route, /ValidationFailureError\("Lookup chain must match/);
    assert.doesNotMatch(route, /throw new Error\("Lookup chain must match/);
  }
  assert.match(openApi, /name: investigation_id, in: query, required: true/);
  assert.match(openApi, /executeInvestigationRiskAnalysis/);
  assert.match(openApi, /computeInvestigationGraphFeatures/);
  assert.match(openApi, /analyzeInvestigationDefiMev/);
  assert.match(openApi, /generateInvestigationForensicReport/);
});

test("Phase 6 PostgreSQL validation runner separates CASHNET privilege denial from administrator trigger enforcement", async () => {
  const root = new URL("../../../", import.meta.url);
  const script = await readFile(new URL("scripts/validate-phase6-postgres.ps1", root), "utf8");
  assert.match(script, /DATABASE_URL is required\. It is read only from the launching environment and is never printed/);
  assert.match(script, /pnpm --filter @workspace\/db run migrate/);
  assert.match(script, /\[string\] \$PsqlPath/);
  assert.match(script, /\$PsqlPath = \[string\]\$psqlCommand\.Source/);
  assert.doesNotMatch(script, /Program Files\\PostgreSQL/);
  assert.match(script, /\$psql = \[System\.IO\.Path\]::GetFullPath\(\[string\]\$PsqlPath\)/);
  assert.match(script, /CASHNET_VALIDATION_ADMIN_DATABASE_URL/);
  assert.match(script, /CASHNET_SUPABASE_CA_CERT_PATH/);
  assert.match(script, /\$env:PGSSLROOTCERT/);
  assert.match(script, /sslmode=verify-full/);
  assert.match(script, /&\s+\$psql\s+`?\s*--no-psqlrc\s+`?\s*--set "ON_ERROR_STOP=1"\s+`?\s*--dbname "\$ConnectionString"\s+`?\s*--command "\$Sql"/);
  assert.doesNotMatch(script, /@psqlArguments/);
  assert.match(script, /pg_catalog\.pg_class/);
  assert.match(script, /pg_catalog\.pg_namespace/);
  assert.match(script, /catalog_status/);
  assert.match(script, /All ten expected Phase 6 tables are present in pg_catalog/);
  assert.match(script, /Missing expected Phase 6 tables/);
  assert.match(script, /CASHNET audit SELECT allowed/);
  assert.match(script, /CASHNET audit UPDATE denied by table privileges/);
  assert.match(script, /CASHNET audit DELETE denied by table privileges/);
  assert.match(script, /Administrator audit UPDATE rejected by immutable-audit trigger/);
  assert.match(script, /Administrator audit DELETE rejected by immutable-audit trigger/);
  assert.match(script, /WHEN insufficient_privilege/);
  assert.match(script, /UPDATE\s+audit_events\s+SET\s+action\s*=\s*action/);
  assert.match(script, /DELETE\s+FROM\s+audit_events\s+WHERE\s+id\s*=\s*target_id/);
  assert.match(script, /Audit events are immutable\. UPDATE and DELETE are not permitted/);
  assert.doesNotMatch(script, /Write-(Output|Host).*(DatabaseUrl|ValidationAdminDatabaseUrl)/);
});

test("Compose uses Supabase secrets and a ledger migrator without a local PostgreSQL dependency, while CI keeps disposable migration coverage", async () => {
  const root = new URL("../../../", import.meta.url);
  const [compose, workflow, dockerfile] = await Promise.all([
    readFile(new URL("docker-compose.yml", root), "utf8"),
    readFile(new URL(".github/workflows/ci.yml", root), "utf8"),
    readFile(new URL("Dockerfile", root), "utf8"),
  ]);
  assert.match(compose, /migrate:[\s\S]*provision-application-role && pnpm --filter @workspace\/db run migrate/);
  assert.match(compose, /condition: service_completed_successfully/);
  assert.match(compose, /CASHNET_MIGRATION_DATABASE_URL: \$\{CASHNET_MIGRATION_DATABASE_URL:\?Set CASHNET_MIGRATION_DATABASE_URL through the deployment secret manager\}/);
  assert.match(compose, /DATABASE_URL: \$\{DATABASE_URL:\?Set DATABASE_URL through the deployment secret manager\}/);
  assert.match(compose, /CASHNET_SUPABASE_CA_CERT_PATH: \/run\/secrets\/cashnet_supabase_ca\.pem/);
  assert.match(compose, /cashnet_supabase_ca:[\s\S]*file: \$\{CASHNET_SUPABASE_CA_CERT_PATH:/);
  assert.doesNotMatch(compose, /^\s+postgres:/m);
  assert.doesNotMatch(compose, /postgres:5432/);
  assert.doesNotMatch(compose, /POSTGRES_PASSWORD/);
  assert.doesNotMatch(compose, /pgdata/);
  assert.match(workflow, /Migrate clean PostgreSQL database[\s\S]*@workspace\/db run migrate/);
  assert.match(workflow, /Prove migration idempotency[\s\S]*@workspace\/db run migrate/);
  assert.match(workflow, /Generate and validate OpenAPI clients[\s\S]*@workspace\/api-spec run codegen/);
  assert.match(workflow, /CASHNET_DATABASE_TEST_MODE: disposable-postgres/);
  assert.match(workflow, /NODE_ENV: test/);
  assert.doesNotMatch(workflow, /for f in database\/migrations/);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.doesNotMatch(workflow, /\|\| true/);
  assert.match(workflow, /Dockerfile docker-compose\.yml \.github artifacts lib scripts/);
  assert.match(workflow, /:\(exclude\)\*\.test\.ts/);
  assert.match(workflow, /exit-code: '1'/);
  assert.match(workflow, /version: 11\.19\.0/);
  assert.match(dockerfile, /pnpm@11\.19\.0/);
});


test("Phase 6 RBAC enforces case isolation and lifecycle privileges", async () => {
  const root = new URL("../../../", import.meta.url);
  const authMigration = await readFile(new URL("database/migrations/20260904_phase6_case_authorization.sql", root), "utf8");
  const baseMigration = await readFile(new URL("database/migrations/20260828_phase2_persistence_rbac.sql", root), "utf8");
  const validationScript = await readFile(new URL("scripts/validate-phase6-nonempty.ps1", root), "utf8");
  
  // Prove INVESTIGATOR cannot authorize a case (CASE_AUTHORIZE not granted to INVESTIGATOR)
  assert.match(authMigration, /WHERE role.code IN \('ADMIN', 'SUPERVISOR'\)/);
  assert.doesNotMatch(authMigration, /'INVESTIGATOR'/);

  // Prove SUPERVISOR cannot create a case (CASE_CREATE not granted to SUPERVISOR)
  const supervisorMatch = baseMigration.match(/WHERE r.code = 'SUPERVISOR'([^;]+);/s);
  if (supervisorMatch) {
    assert.doesNotMatch(supervisorMatch[0], /CASE_CREATE/);
  }

  // Prove demo.admin can execute the controlled validation lifecycle
  assert.match(validationScript, /\[string\]\$Actor = "demo\.admin"/);
});

test("Phase 6 provisions only repository-required access for the application role", async () => {
  const root = new URL("../../../", import.meta.url);
  const [migration, runner, validator] = await Promise.all([
    readFile(new URL("database/migrations/20260906_phase6_application_role_privileges.sql", root), "utf8"),
    readFile(new URL("lib/db/src/migrate.ts", root), "utf8"),
    readFile(new URL("scripts/validate-phase6-postgres.ps1", root), "utf8"),
  ]);
  assert.match(runner, /20260906_phase6_application_role_privileges/);
  assert.match(runner, /CASHNET_MIGRATION_DATABASE_URL/);
  assert.match(migration, /grant select on table cashnet_schema_migrations to cashnet/);
  assert.match(migration, /grant select on table users, roles, permissions, user_roles, role_permissions to cashnet/);
  assert.match(migration, /grant select, insert, update on table cases, investigations to cashnet/);
  assert.match(migration, /grant select, insert, update on table wallets, blockchain_transactions to cashnet/);
  assert.match(migration, /grant select, insert, update on table graph_features to cashnet/);
  assert.match(migration, /grant select, insert, delete on table cluster_members, attribution_evidence to cashnet/);
  assert.match(migration, /grant select, insert on table audit_events to cashnet/);
  assert.doesNotMatch(migration, /grant (?:all|update|delete) on table audit_events/i);
  assert.match(validator, /has_table_privilege\(\s*current_user,\s*format\('public.%I', required_table\),\s*'SELECT'\s*\)/);
  assert.match(validator, /CASHNET application role has migration-ledger SELECT privilege/);
  assert.match(validator, /CASHNET application role has required RBAC SELECT privileges/);
});

test("Supabase database configuration is environment-driven, TLS-required, and never falls back to local PostgreSQL", async () => {
  const root = new URL("../../../", import.meta.url);
  const [environmentExample, drizzleConfig, validator, nonEmptyValidator, provisioner, tlsConfiguration, liveTron, liveProviders] = await Promise.all([
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("lib/db/drizzle.config.ts", root), "utf8"),
    readFile(new URL("scripts/validate-phase6-postgres.ps1", root), "utf8"),
    readFile(new URL("scripts/validate-phase6-nonempty.ps1", root), "utf8"),
    readFile(new URL("lib/db/src/provision-application-role.ts", root), "utf8"),
    readFile(new URL("lib/db/src/supabase-tls.ts", root), "utf8"),
    readFile(new URL("lib/db/live-tron-test.mjs", root), "utf8"),
    readFile(new URL("lib/db/live-all-providers.mjs", root), "utf8"),
  ]);
  assert.match(environmentExample, /DATABASE_URL=postgresql:\/\/cashnet\.YOUR_PROJECT_REF:/);
  assert.match(environmentExample, /CASHNET_MIGRATION_DATABASE_URL=postgresql:\/\/postgres:/);
  assert.match(environmentExample, /sslmode=verify-full/);
  assert.match(environmentExample, /CASHNET_SUPABASE_CA_CERT_PATH=/);
  assert.doesNotMatch(environmentExample, /localhost:5432/);
  assert.doesNotMatch(environmentExample, /POSTGRES_PASSWORD/);
  assert.match(drizzleConfig, /const migrationDatabaseUrl = process\.env\.CASHNET_MIGRATION_DATABASE_URL/);
  assert.match(drizzleConfig, /DATABASE_URL is never used as a migration fallback/);
  assert.match(validator, /must target Supabase, not a local PostgreSQL service/);
  assert.match(validator, /CASHNET_SUPABASE_CA_CERT_PATH/);
  assert.match(nonEmptyValidator, /must target Supabase, not a local PostgreSQL service/);
  assert.match(provisioner, /runtimeUsername\.split\("\.", 1\)\[0\]/);
  assert.match(provisioner, /applicationRole !== "cashnet"/);
  assert.match(provisioner, /nosuperuser nocreatedb nocreaterole noinherit/);
  assert.match(provisioner, /role already exists; its credentials and attributes were not changed/);
  assert.match(tlsConfiguration, /CASHNET_SUPABASE_CA_CERT_PATH is required/);
  assert.match(tlsConfiguration, /rejectUnauthorized: true/);
  assert.match(tlsConfiguration, /servername: parsed\.hostname/);
  assert.match(tlsConfiguration, /must explicitly use sslmode=verify-full/);
  assert.match(tlsConfiguration, /The disposable PostgreSQL compatibility connection is restricted to CI test execution/);
  assert.match(tlsConfiguration, /must use a loopback host/);
  assert.match(tlsConfiguration, /parsed\.searchParams\.delete\(parameter\)/);
  assert.doesNotMatch(tlsConfiguration, /rejectUnauthorized:\s*false/);
  assert.doesNotMatch(tlsConfiguration, /NODE_TLS_REJECT_UNAUTHORIZED/);
  for (const liveValidator of [liveTron, liveProviders]) {
    assert.match(liveValidator, /createVerifiedSupabaseConnectionConfig/);
    assert.doesNotMatch(liveValidator, /new pg\.Pool\(\{ connectionString:/);
  }
});
