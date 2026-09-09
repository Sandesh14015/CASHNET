import { config } from "./config/index.js";
import { getPersistentContext } from "./services/persistent-context.js";
import { getDatabase } from "@workspace/db";
import { PostgresRepositories } from "./repositories/postgres-repositories.js";

async function verifyP09() {
  console.log(`P0.9 END-TO-END INTELLIGENCE PIPELINE TESTING [${config.dataMode.toUpperCase()}]\n`);

  const db = getDatabase();
  const repositories = new PostgresRepositories(db.db);
  const users = repositories.context().users;
  const context = getPersistentContext();
  
  const actor = await users.findActorByUsername("demo.admin");

  if (!actor) {
    console.error("FATAL: Failed to authenticate demo.admin.");
    process.exit(1);
  }

  // Helper to run pipeline
  async function runPipeline(mode: string, chain: string, address: string) {
    console.log(`\n========================================`);
    console.log(`RUNNING PIPELINE (${mode} MODE)`);
    console.log(`Chain: ${chain} | Address: ${address}`);

    let caseId, invId;
    try {
      const c = await context.cases.create(actor, { caseNumber: `P09-${mode}-${Date.now()}`, title: `P0.9 Test Case ${mode}`, description: "Testing E2E", priority: "MEDIUM", fraudType: "OTHER", reportedAmount: "0" });
      caseId = c.id;
      // Approve case for investigation
      await context.cases.update(actor, caseId, { investigationAuthorizationStatus: "APPROVED" });
      
      const inv = await context.investigations.create(actor, { caseId, chain, walletAddress: address });
      invId = inv.id;
      await context.investigations.transition(actor, invId, "AUTHORIZED");
      console.log(`[PASS] Case & Investigation Created & Authorized: ${invId}`);
    } catch (e: any) {
      console.error(`[FAIL] Failed to setup case: ${e.message}`);
      return false;
    }

    let fetchSuccess = false;
    try {
      console.log(`[INFO] Step 1: Provider Selection & Fetch...`);
      await context.collection.collect(actor, invId);
      console.log(`[PASS] Collection Succeeded.`);
      fetchSuccess = true;
    } catch (e: any) {
      console.error(`[FAIL/BLOCKED] Collection Failed: ${e.message}`);
    }

    try {
      console.log(`[INFO] Step 2: VASP Attribution & Address Intelligence...`);
      const intel = await context.addressIntelligence.lookup(actor, invId, chain, address);
      console.log(`[PASS] Intelligence Succeeded. Found ${intel.observations.length} observations.`);
    } catch (e: any) {
      console.error(`[FAIL] Intelligence Failed: ${e.message}`);
    }

    try {
      console.log(`[INFO] Step 3: Typology Detection & AML Risk...`);
      const risk = await context.phase6.analyzeRisk(actor, invId);
      console.log(`[PASS] Typology Detection Succeeded. Typologies: ${risk.typologies.map(t => t.name).join(', ')} | Total Score: ${risk.totalRiskScore}`);
    } catch (e: any) {
      console.error(`[FAIL] Typology Detection Failed: ${e.message}`);
    }

    return fetchSuccess;
  }

  const address = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // Vitalik
  await runPipeline(config.dataMode.toUpperCase(), "ETHEREUM", address);
  
  console.log("\n[SUMMARY] Done.");
  process.exit(0);
}

verifyP09().catch(console.error);
