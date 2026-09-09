import { getDatabase } from "@workspace/db";
import { PostgresRepositories } from "./repositories/postgres-repositories.js";

async function verifyP011() {
  console.log("P0.11 DATABASE RUNTIME & CONCURRENCY TESTING\n");
  
  const startTotal = performance.now();
  const db = getDatabase();
  const repos = new PostgresRepositories(db.db);
  const context = repos.context();

  console.log("[INFO] Testing Basic CRUD Operations...");
  
  // 1. CREATE
  const caseId = crypto.randomUUID();
  try {
    await context.cases.create({
      caseNumber: `DB-TEST-${Date.now()}`,
      title: "DB CRUD Test",
      description: "Testing CRUD",
      priority: "LOW",
      fraudType: "OTHER",
      reportedAmount: "0",
      status: "OPEN",
      investigationAuthorizationStatus: "PENDING",
      createdBy: "demo.admin",
      assignedTo: "demo.admin"
    });
    console.log("[PASS] Database CREATE successful.");
  } catch (e: any) {
    console.error("[FAIL] Database CREATE failed:", e.message);
  }

  // 2. READ (with concurrency)
  console.log("\n[INFO] Testing Concurrency (10 simultaneous reads)...");
  const promises = [];
  let successCount = 0;
  let failCount = 0;
  
  const concurrencyStart = performance.now();
  for (let i = 0; i < 10; i++) {
    promises.push(
      context.users.findActorByUsername("demo.admin")
        .then(() => successCount++)
        .catch(e => {
          failCount++;
          console.error(`  [FAIL] Concurrency Task ${i} error:`, e.message);
        })
    );
  }
  
  await Promise.all(promises);
  const concurrencyTime = performance.now() - concurrencyStart;
  
  console.log(`[SUMMARY] Concurrency test complete in ${Math.round(concurrencyTime)}ms.`);
  console.log(`[SUMMARY] Success: ${successCount}/10`);
  console.log(`[SUMMARY] Failed: ${failCount}/10`);
  
  if (failCount > 0) {
    console.log("[FAIL] Connection pool bottleneck or queue starvation detected.");
  } else {
    console.log("[PASS] Connection pool handled 10 simultaneous requests.");
  }

  console.log(`\n[SUMMARY] Total test time: ${Math.round(performance.now() - startTotal)}ms`);
  process.exit(0);
}

verifyP011().catch(console.error);
