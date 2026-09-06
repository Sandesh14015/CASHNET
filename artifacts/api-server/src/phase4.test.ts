import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { GraphRelationshipRecord } from "./repositories/types";
import { traceStoredRelationships } from "./services/graph/graph-tracing-service";

const relationship = (id: string, fromAddress: string, toAddress: string, amount = "1", overrides: Partial<GraphRelationshipRecord> = {}): GraphRelationshipRecord => ({ id, caseId: "case-a", chain: "ETHEREUM", transactionHash: `tx-${id}`, fromAddress, toAddress, relationshipType: "TRANSFER", asset: "ETH", amount, tokenContract: null, blockNumber: "1", timestamp: "2026-01-01T00:00:00.000Z", executionStatus: "SUCCESS", derivationSourceType: "API", provider: "fixture", sourceReference: `source-${id}`, rawReference: `raw-${id}`, retrievedAt: "2026-01-01T00:00:01.000Z", method: "fixture", createdAt: "2026-01-01T00:00:01.000Z", ...overrides });

test("Phase 4 bounded BFS returns deterministic Ethereum paths and evidence", () => {
  const result = traceStoredRelationships("ETHEREUM", "WA", [relationship("ab", "WA", "WB", "1.5"), relationship("ac", "WA", "WC", "0.3"), relationship("ad", "WA", "WD", "0.2"), relationship("be", "WB", "WE", "1.2"), relationship("cf", "WC", "WF", "0.2")], { depth: 2, direction: "OUTGOING" });
  assert.equal(result.status, "OK");
  assert.deepEqual(result.nodes.map((node) => node.address).sort(), ["WA", "WB", "WC", "WD", "WE", "WF"]);
  assert.equal(result.paths.length, 5);
  assert.equal(result.edges[0].evidence.transactionHash, "tx-ab");
});

test("Phase 4 filtering, incoming traversal, and decimal amount comparisons are exact", () => {
  const values = [relationship("in", "WB", "WA", "0.10"), relationship("small", "WA", "WC", "0.09"), relationship("token", "WA", "WD", "100", { asset: "USDT", relationshipType: "TOKEN_TRANSFER", tokenContract: "0xtoken" })];
  assert.deepEqual(traceStoredRelationships("ETHEREUM", "WA", values, { depth: 1, direction: "INCOMING", minAmount: "0.1" }).nodes.map((node) => node.address).sort(), ["WA", "WB"]);
  assert.deepEqual(traceStoredRelationships("ETHEREUM", "WA", values, { depth: 1, asset: "USDT" }).nodes.map((node) => node.address).sort(), ["WA", "WD"]);
});

test("Phase 4 prevents cycles and transparently reports fan-out limits", () => {
  const cyclic = [relationship("ab", "WA", "WB"), relationship("bc", "WB", "WC"), relationship("ca", "WC", "WA")];
  const cycle = traceStoredRelationships("ETHEREUM", "WA", cyclic, { depth: 5 });
  assert.equal(cycle.nodes.length, 3);
  const fanout = traceStoredRelationships("ETHEREUM", "WA", [relationship("a", "WA", "WB", "9"), relationship("b", "WA", "WC", "8")], { depth: 1, maxNeighbors: 1 });
  assert.equal(fanout.metadata.traversalTruncated, true);
  assert.deepEqual(fanout.metadata.truncationReasons, ["MAX_NEIGHBORS_PER_NODE_REACHED"]);
});

test("Phase 4 accepts UTXO projections without asserting ownership or clustering", () => {
  const result = traceStoredRelationships("BITCOIN", "bc1wa", [relationship("utxo", "bc1wa", "bc1wb", "70000000", { chain: "BITCOIN", transactionHash: "bitcoin-tx", relationshipType: "UTXO_SPEND", asset: "BTC", derivationSourceType: "INFERENCE", method: "bitcoin-utxo-input-output-projection" })], { depth: 1 });
  assert.equal(result.edges[0].relationshipType, "UTXO_SPEND");
  assert.equal(result.edges[0].evidence.derivationSourceType, "INFERENCE");
});

test("Phase 4 migration defines canonical fields and idempotent derived relationships", async () => {
  const migration = await readFile(new URL("../../../database/migrations/20260830_phase4_graph_tracing.sql", import.meta.url), "utf8");
  for (const item of ["from_address", "value_numeric", "investigation_graph_relationships", "investigation_graph_relationship_identity_unique", "UTXO_SPEND"]) assert.match(migration, new RegExp(item));
});
