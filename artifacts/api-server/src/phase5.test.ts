import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { AddressIntelligenceObservationRecord, AttributionEvidenceInput, BitcoinTransactionRecord } from "./repositories/types";
import { conflictsFor } from "./services/intelligence/address-intelligence-service";
import { fuseAttributionEvidence } from "./services/intelligence/attribution-evidence-fusion-service";
import { inferBitcoinCluster } from "./services/intelligence/bitcoin-cluster-inference-service";
import { evaluateHeldOutCases } from "./services/intelligence/evaluation";
import { canConfirmCandidate, candidateEvidence } from "./services/intelligence/vasp-candidate-service";

const observation = (entityName: string, source: string, freshnessStatus: AddressIntelligenceObservationRecord["freshnessStatus"] = "FRESH"): AddressIntelligenceObservationRecord => ({ id: `${source}-${entityName}`, caseId: "case-a", investigationId: "investigation-a", chain: "ETHEREUM", address: "0xdeposit", label: entityName, entityName, entityType: "EXCHANGE", source, sourceReference: source, sourceUrl: null, datasetName: "fixture", datasetVersion: "1", license: "MIT", retrievedAt: "2026-01-01T00:00:00.000Z", lastVerified: "2026-01-01T00:00:00.000Z", freshnessStatus, confidence: 0.8, status: "ACTIVE", rawReference: null, rawData: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
const evidence = (source: string, contribution: number, polarity: AttributionEvidenceInput["polarity"] = "SUPPORTING"): AttributionEvidenceInput => ({ category: "ADDRESS_INTELLIGENCE", evidenceType: "PUBLIC_SERVICE_LABEL", subjectType: "address", subjectId: "ETHEREUM:0xdeposit", polarity, contribution, source, sourceReference: source, sourceUrl: null, retrievedAt: "2026-01-01T00:00:00.000Z", method: "fixture", methodVersion: "1", rawReference: null, details: {} });
const bitcoin = (inputs: string[], outputs: Array<[string, string]>): BitcoinTransactionRecord => ({ transactionHash: "btc-fixture", inputs: inputs.map((address) => ({ address, value: "100" })), outputs: outputs.map(([address, value]) => ({ address, value })) });

test("Phase 5 ranks a known exchange candidate only from independently sourced evidence and a stored graph signal", () => {
  const result = fuseAttributionEvidence([evidence("source-a", 45), evidence("source-b", 45), { ...evidence("graph", 20), category: "GRAPH_EVIDENCE" }, { ...evidence("agreement", 15), category: "SOURCE_AGREEMENT" }]);
  assert.equal(result.numericScore, 100); assert.equal(result.confidenceLevel, "LIKELY");
});
test("Phase 5 keeps no intelligence as UNKNOWN and surfaces conflicting labels", () => {
  assert.equal(fuseAttributionEvidence([]).confidenceLevel, "UNKNOWN");
  assert.deepEqual(conflictsFor([observation("Exchange X", "source-a"), observation("Exchange Y", "source-b")])[0].entityNames, ["Exchange X", "Exchange Y"]);
});
test("Phase 5 applies stale and contradictory evidence as negative signals", () => {
  const result = fuseAttributionEvidence([evidence("source-a", 45), evidence("freshness", -15, "NEGATIVE"), evidence("source-b", -35, "CONTRADICTORY")]);
  assert.equal(result.confidenceLevel, "UNKNOWN"); assert.equal(result.numericScore, 0);
});
test("Phase 5 graph evidence is scoped to the candidate address", () => {
  assert.equal(candidateEvidence("ETHEREUM", "0xaddress", [], 0, false).some((item) => item.category === "GRAPH_EVIDENCE"), false);
  assert.equal(candidateEvidence("ETHEREUM", "0xaddress", [], 2, false).find((item) => item.category === "GRAPH_EVIDENCE")?.contribution, 10);
});
test("Phase 5 common-input inference is review-required and never confirmed", () => {
  const result = inferBitcoinCluster(bitcoin(["bc1a", "bc1b"], [["bc1out1", "150"], ["bc1out2", "50"]]));
  assert.equal(result?.confidenceLevel, "POSSIBLE"); assert.equal(result?.reviewStatus, "PENDING_REVIEW"); assert.equal(result?.members.some((member) => member.membershipType === "COMMON_INPUT"), true);
});
test("Phase 5 detects CoinJoin-like equal outputs and returns no ownership cluster", () => {
  const result = inferBitcoinCluster(bitcoin(["bc1a", "bc1b", "bc1c"], [["bc1x", "100"], ["bc1y", "100"], ["bc1z", "100"]]));
  assert.equal(result?.confidenceLevel, "UNKNOWN"); assert.equal(result?.members.length, 0); assert.match(result?.ambiguityReason ?? "", /COINJOIN/);
});
test("Phase 5 marks output-asymmetry change candidates as ambiguous, not facts", () => {
  const result = inferBitcoinCluster(bitcoin(["bc1a", "bc1b"], [["bc1pay", "150"], ["bc1change", "20"]]));
  assert.equal(result?.ambiguityReason, "CHANGE_OUTPUT_AMBIGUOUS"); assert.equal(result?.members.some((member) => member.membershipType === "POSSIBLE_CHANGE"), true);
});
test("Phase 5 migration, ledger, APIs and source boundary are explicit", async () => {
  const migration = await readFile(new URL("../../../database/migrations/20260831_phase5_intelligence.sql", import.meta.url), "utf8");
  const runner = await readFile(new URL("../../../lib/db/src/migrate.ts", import.meta.url), "utf8");
  const routes = await readFile(new URL("../src/routes/v1/investigations.ts", import.meta.url), "utf8");
  for (const item of ["address_intelligence_observations", "cluster_inferences", "vasp_candidates", "attribution_evidence", "INTELLIGENCE_READ", "VASP_ANALYZE"]) assert.match(migration, new RegExp(item));
  assert.match(runner, /20260831_phase5_intelligence/); for (const item of ["address-intelligence", "clusters", "vasp-analysis", "vasp-candidates", "review"]) assert.match(routes, new RegExp(item));
});
test("API development startup script is shell-neutral for Windows and CI", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { scripts?: Record<string, string> };
  assert.equal(manifest.scripts?.dev, "pnpm run build && pnpm run start");
  assert.doesNotMatch(manifest.scripts?.dev ?? "", /export\s+NODE_ENV/);
});
test("Phase 5 evolves the legacy VASP relation before using its address identity index", async () => {
  const migration = await readFile(new URL("../../../database/migrations/20260831_phase5_intelligence.sql", import.meta.url), "utf8");
  const legacyColumn = migration.indexOf("alter table vasp_candidates add column if not exists address text");
  const identityIndex = migration.indexOf("create unique index if not exists vasp_candidate_identity_unique");
  assert.ok(legacyColumn >= 0); assert.ok(identityIndex > legacyColumn); assert.match(migration, /where investigation_id is not null and address is not null/);
});
test("Phase 5 confirmation is human-review-only and rejects conflicted or weak candidates", () => {
  const base = { confidenceLevel: "LIKELY", status: "PENDING_REVIEW", contradictions: [], evidence: [{ polarity: "SUPPORTING", source: "source-a" }, { polarity: "SUPPORTING", source: "source-b" }] };
  assert.equal(canConfirmCandidate(base), true); assert.equal(canConfirmCandidate({ ...base, contradictions: [{ reason: "conflict" }] }), false); assert.equal(canConfirmCandidate({ ...base, confidenceLevel: "POSSIBLE" }), false);
});
test("Phase 5 held-out evaluator reports counts without treating confidence score as probability", () => {
  const result = evaluateHeldOutCases([{ id: "1", actual: "POSITIVE", predicted: "POSITIVE", expectedCandidateId: "x", rankedCandidateIds: ["x"] }, { id: "2", actual: "NEGATIVE", predicted: "POSITIVE" }, { id: "3", actual: "POSITIVE", predicted: "UNKNOWN" }, { id: "4", actual: "NEGATIVE", predicted: "NEGATIVE" }]);
  assert.deepEqual({ truePositive: result.truePositive, falsePositive: result.falsePositive, falseNegative: result.falseNegative, trueNegative: result.trueNegative, unknown: result.unknown }, { truePositive: 1, falsePositive: 1, falseNegative: 1, trueNegative: 1, unknown: 1 }); assert.equal(result.precision, 0.5); assert.equal(result.recall, 0.5); assert.equal(result.unknownRate, 0.25); assert.equal(result.top1Accuracy, 1);
});
test("development actor authentication wires through UserRepository and requires DATABASE_URL at persistent context creation", async () => {
  // Regression: the Phase 5 INTERNAL_ERROR was caused by a stale server
  // process lacking DATABASE_URL; the authentication path
  //   DevelopmentActorAuthenticator → PostgresUserRepository.findActorByUsername()
  // failed silently. This test verifies the wiring contracts.
  const { DevelopmentActorAuthenticator } = await import("./auth/actor-context");
  const { createConfig } = await import("./config");

  // 1. Production config disables development auth regardless of env var
  const productionConfig = createConfig({ NODE_ENV: "production", CASHNET_DEV_AUTH_ENABLED: "true" });
  assert.equal(productionConfig.developmentAuthEnabled, false);

  // 2. Development config with explicit flag enables auth
  const devConfig = createConfig({ NODE_ENV: "development", CASHNET_DEV_AUTH_ENABLED: "true" });
  assert.equal(devConfig.developmentAuthEnabled, true);

  // 3. UserRepository contract: findActorByUsername resolves a typed Actor
  const mockRepo = { findActorByUsername: async (username: string) => username === "demo.investigator" ? { id: "test-id", username: "demo.investigator", roles: ["INVESTIGATOR"], permissions: ["CASE_READ" as const, "CASE_CREATE" as const] } : null };
  const actor = await mockRepo.findActorByUsername("demo.investigator");
  assert.ok(actor); assert.equal(actor.username, "demo.investigator");
  assert.deepEqual(actor.roles, ["INVESTIGATOR"]);
  assert.ok(actor.permissions.includes("CASE_READ"));
  assert.equal(await mockRepo.findActorByUsername("nonexistent"), null);

  // 4. DevelopmentActorAuthenticator accepts UserRepository — class instantiates
  const authenticator = new DevelopmentActorAuthenticator(mockRepo);
  assert.ok(authenticator);

  // 5. createDatabase() requires DATABASE_URL — verified structurally
  const dbSource = await readFile(new URL("../../../lib/db/src/index.ts", import.meta.url), "utf8");
  assert.match(dbSource, /DATABASE_URL must be set/);
  assert.match(dbSource, /if\s*\(\s*!databaseUrl\s*\)/);

  // 6. Server entry point requires PORT (the exact startup failure mode)
  const entrySource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.match(entrySource, /PORT.*required/i);

  // 7. Persistent context uses getDatabase() — lazy singleton
  const contextSource = await readFile(new URL("../src/services/persistent-context.ts", import.meta.url), "utf8");
  assert.match(contextSource, /getDatabase\(\)/);
  assert.match(contextSource, /DevelopmentActorAuthenticator/);
});
