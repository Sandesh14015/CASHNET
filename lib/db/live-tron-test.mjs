import pg from "pg";
// This validation utility must be invoked through its package script (tsx),
// which lets it use the same verified Supabase connection policy as CASHNET.
import { createVerifiedSupabaseConnectionConfig } from "./src/supabase-tls.ts";
const API = "http://localhost:5000";
const pool = new pg.Pool(createVerifiedSupabaseConnectionConfig(process.env.DATABASE_URL ?? ""));
const ts = Date.now();
function apiAs(a, m, p, b) { return fetch(`${API}${p}`, { method: m, headers: { "Content-Type": "application/json", "X-Cashnet-Dev-Actor": a }, ...(b ? { body: JSON.stringify(b) } : {}) }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) })); }
function ok(l) { console.log(`  ✅ ${l}`); }
function no(l, d) { console.error(`  ❌ ${l}: ${d}`); }
try {
  const addr = "TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH";
  console.log(`\n═══ TRON / TronGrid LIVE COLLECTION ═══`);
  console.log(`  Address: ${addr}\n`);
  const c = await apiAs("demo.investigator", "POST", "/api/v1/cases", { caseNumber: `TRX-LIVE-${ts}`, title: "TRON Live Validation", description: "TronGrid collection", fraudType: "CRYPTO_FRAUD", reportedAmount: "0" });
  ok(`Case: ${c.json.id.substring(0,8)}`); const cid = c.json.id;
  const inv = await apiAs("demo.investigator", "POST", "/api/v1/investigations", { caseId: cid, chain: "TRON", walletAddress: addr, investigationDepth: 1 });
  ok(`Investigation: ${inv.json.id.substring(0,8)}`); const iid = inv.json.id;
  const sup = (await pool.query("SELECT id FROM users WHERE username='demo.supervisor'")).rows[0];
  await pool.query("INSERT INTO case_memberships (case_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [cid, sup.id]);
  ok("Supervisor added");
  await apiAs("demo.investigator", "PATCH", `/api/v1/cases/${cid}`, { investigationAuthorizationStatus: "APPROVED" });
  ok("Case approved");
  await apiAs("demo.supervisor", "PATCH", `/api/v1/investigations/${iid}`, { status: "AUTHORIZED" });
  ok("Investigation AUTHORIZED");
  console.log("  Collecting...");
  const col = await apiAs("demo.supervisor", "POST", `/api/v1/investigations/${iid}/collect`);
  if (col.status === 200 && col.json?.status === "COMPLETED") {
    ok(`COMPLETED: ${col.json.transactionCount} txs, ${col.json.tokenTransferCount} transfers`);
    ok(`Provider: ${col.json.provider}`);
    const txs = (await pool.query("SELECT count(*) as cnt FROM blockchain_transactions WHERE case_id=$1", [cid])).rows[0].cnt;
    ok(`PostgreSQL: ${txs} transactions`);
    const g = await apiAs("demo.supervisor", "GET", `/api/v1/investigations/${iid}/graph`);
    ok(`Graph: nodes=${g.json?.nodes?.length} edges=${g.json?.edges?.length}`);
    const audit = (await pool.query("SELECT count(*) as cnt FROM audit_events WHERE case_id=$1", [cid])).rows[0].cnt;
    ok(`Audit: ${audit} events`);
    console.log(`\n  TRON / TronGrid: LIVE_VALIDATED ✅`);
  } else {
    no("Collection", JSON.stringify(col.json));
  }
} catch (e) { console.error("FATAL:", e.message, e.stack); }
finally { await pool.end(); }
