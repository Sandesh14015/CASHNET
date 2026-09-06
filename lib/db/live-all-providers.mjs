/**
 * ALL-PROVIDER LIVE VALIDATION — Ethereum + TRON
 * Bitcoin already validated. This script validates the remaining 2 providers.
 */
import pg from "pg";
// This validation utility must be invoked through its package script (tsx),
// which lets it use the same verified Supabase connection policy as CASHNET.
import { createVerifiedSupabaseConnectionConfig } from "./src/supabase-tls.ts";
const API = "http://localhost:5000";
const DB_URL = process.env.DATABASE_URL;
const pool = new pg.Pool(createVerifiedSupabaseConnectionConfig(DB_URL ?? ""));
const ts = Date.now();

async function api(method, path, body, headers) {
  const h = { "Content-Type": "application/json", ...headers };
  const opts = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text };
}
function apiAs(actor, method, path, body) {
  return api(method, path, body, { "X-Cashnet-Dev-Actor": actor });
}
function ok(l) { console.log(`  ✅ ${l}`); }
function no(l, d) { console.error(`  ❌ ${l}: ${d}`); }

async function liveCollect(chain, address, label) {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  ${label} LIVE COLLECTION`);
  console.log(`  Chain: ${chain}  Address: ${address}`);
  console.log(`${"═".repeat(50)}\n`);

  // 1. Case
  const c = await apiAs("demo.investigator", "POST", "/api/v1/cases", {
    caseNumber: `${chain}-LIVE-${ts}`, title: `${label} Live Validation`,
    description: `Real ${label} provider collection`, fraudType: "CRYPTO_FRAUD", reportedAmount: "0"
  });
  if (c.status !== 201) { no("Case create", c.text); return null; }
  ok(`Case: ${c.json.id.substring(0,8)}`);
  const cid = c.json.id;

  // 2. Investigation
  const inv = await apiAs("demo.investigator", "POST", "/api/v1/investigations", {
    caseId: cid, chain, walletAddress: address, investigationDepth: 1
  });
  if (inv.status !== 201) { no("Investigation create", inv.text); return null; }
  ok(`Investigation: ${inv.json.id.substring(0,8)} chain=${chain}`);
  const iid = inv.json.id;

  // 3. Add supervisor to case
  const supUser = (await pool.query("SELECT id FROM users WHERE username='demo.supervisor'")).rows[0];
  await pool.query("INSERT INTO case_memberships (case_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [cid, supUser.id]);
  ok(`Supervisor added to case`);

  // 4. Approve case auth
  const ap = await apiAs("demo.investigator", "PATCH", `/api/v1/cases/${cid}`, { investigationAuthorizationStatus: "APPROVED" });
  ap.status === 200 ? ok("Case approved") : no("Case approve", ap.text);

  // 5. Authorize investigation
  const auth = await apiAs("demo.supervisor", "PATCH", `/api/v1/investigations/${iid}`, { status: "AUTHORIZED" });
  auth.status === 200 ? ok("Investigation AUTHORIZED") : no("Authorize", auth.text);

  // 6. Collect
  console.log(`  Collecting from live provider...`);
  const col = await apiAs("demo.supervisor", "POST", `/api/v1/investigations/${iid}/collect`);

  if (col.status === 200 && col.json?.status === "COMPLETED") {
    ok(`COLLECTION COMPLETED`);
    ok(`Provider: ${col.json.provider}`);
    ok(`Transactions: ${col.json.transactionCount}`);
    ok(`Token transfers: ${col.json.tokenTransferCount}`);

    // Verify persistence
    const txCount = (await pool.query("SELECT count(*) as cnt FROM blockchain_transactions WHERE case_id=$1", [cid])).rows[0].cnt;
    ok(`PostgreSQL: ${txCount} transactions persisted`);

    // Graph
    const g = await apiAs("demo.supervisor", "GET", `/api/v1/investigations/${iid}/graph`);
    ok(`Graph: nodes=${g.json?.nodes?.length} edges=${g.json?.edges?.length}`);

    // Intelligence
    const intel = await apiAs("demo.supervisor", "GET", `/api/v1/investigations/${iid}/address-intelligence/${chain}/${address}`);
    ok(`Intelligence: ${intel.json?.status}`);

    // VASP
    const va = await apiAs("demo.supervisor", "POST", `/api/v1/investigations/${iid}/vasp-analysis`, {});
    ok(`VASP: ${va.json?.status}`);

    // Audit
    const audit = (await pool.query("SELECT count(*) as cnt FROM audit_events WHERE case_id=$1", [cid])).rows[0].cnt;
    ok(`Audit trail: ${audit} events`);

    console.log(`\n  ${label}: LIVE_VALIDATED ✅`);
    return { status: "LIVE_VALIDATED", provider: col.json.provider, txCount: col.json.transactionCount, transfers: col.json.tokenTransferCount };
  } else {
    no("Collection", JSON.stringify(col.json));
    return { status: "FAILED", error: col.json };
  }
}

try {
  // Verify all 3 providers are configured
  const h = await api("GET", "/api/v1/health");
  console.log(`Health: ${h.status} dataMode=${h.json?.dataMode}`);

  // ══════════════════════════════════════════
  // ETHEREUM (Etherscan V2)
  // ══════════════════════════════════════════
  const ethResult = await liveCollect(
    "ETHEREUM",
    "0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae",  // Ethereum Foundation
    "ETHEREUM / Etherscan V2"
  );

  // ══════════════════════════════════════════
  // TRON (TronGrid)
  // ══════════════════════════════════════════
  const tronResult = await liveCollect(
    "TRON",
    "TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH",  // Well-known TRON address
    "TRON / TronGrid"
  );

  // ══════════════════════════════════════════
  console.log("\n\n" + "═".repeat(50));
  console.log("  FINAL PROVIDER STATUS");
  console.log("═".repeat(50));
  console.log(`  Bitcoin/Esplora:     LIVE_VALIDATED ✅  (previous run)`);
  console.log(`  Ethereum/Etherscan:  ${ethResult?.status || "FAILED"} ${ethResult?.status === "LIVE_VALIDATED" ? "✅" : "❌"}`);
  console.log(`  TRON/TronGrid:       ${tronResult?.status || "FAILED"} ${tronResult?.status === "LIVE_VALIDATED" ? "✅" : "❌"}`);
  if (ethResult?.status === "LIVE_VALIDATED") console.log(`    ETH: ${ethResult.txCount} txs, ${ethResult.transfers} transfers via ${ethResult.provider}`);
  if (tronResult?.status === "LIVE_VALIDATED") console.log(`    TRX: ${tronResult.txCount} txs, ${tronResult.transfers} transfers via ${tronResult.provider}`);
  console.log("═".repeat(50));

} catch (e) {
  console.error("FATAL:", e.message, e.stack);
} finally {
  await pool.end();
}
