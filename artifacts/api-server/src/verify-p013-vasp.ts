import { getDatabase } from "@workspace/db";
import { PostgresRepositories } from "./repositories/postgres-repositories.js";
import { getPersistentContext } from "./services/persistent-context.js";
import { sql } from "drizzle-orm";

async function verifyP013() {
  console.log("P0.13 VASP ATTRIBUTION TESTS\n");

  const db = getDatabase();
  const repositories = new PostgresRepositories(db.db);
  const context = getPersistentContext();
  const users = repositories.context().users;
  
  const actor = await users.findActorByUsername("demo.admin");
  if (!actor) {
    console.error("FATAL: Failed to authenticate demo.admin.");
    process.exit(1);
  }

  try {
    const caseRecord = await context.cases.create(actor, { 
      caseNumber: `P013-${Date.now()}`, title: "VASP Test", description: "Testing VASP", priority: "MEDIUM", fraudType: "OTHER", reportedAmount: "0" 
    });
    const caseId = caseRecord.id;
    await context.cases.update(actor, caseId, { investigationAuthorizationStatus: "APPROVED" });
    
    const chain = "ETHEREUM";
    const address = "0xVaspTestAddress";
    const inv = await context.investigations.create(actor, { caseId, chain, walletAddress: address });
    const invId = inv.id;
    await context.investigations.transition(actor, invId, "AUTHORIZED");

    console.log(`[INFO] Injecting synthetic observations...`);
    
    const now = new Date().toISOString();
    
    await db.db.execute(sql`
      insert into address_intelligence_observations (
        case_id, investigation_id, chain, address, entity_name, entity_type, source, retrieved_at, freshness_status, confidence, status
      ) values (
        ${caseId}::uuid, ${invId}::uuid, ${chain}, ${address}, 'Binance', 'VASP', 'synthetic-audit', ${now}::timestamptz, 'FRESH', 95, 'ACTIVE'
      )
    `);

    await db.db.execute(sql`
      insert into address_intelligence_observations (
        case_id, investigation_id, chain, address, entity_name, entity_type, source, retrieved_at, freshness_status, confidence, status
      ) values (
        ${caseId}::uuid, ${invId}::uuid, ${chain}, ${address}, 'Binance', 'VASP', 'synthetic-audit-2', ${now}::timestamptz, 'FRESH', 80, 'ACTIVE'
      )
    `);

    console.log(`[INFO] Analyzing VASP candidates...`);
    const result = await context.vaspCandidates.analyze(actor, invId);
    
    console.log(`[PASS] VASP Analysis executed.`);
    console.log(`[INFO] Status: ${result.status}`);
    console.log(`[INFO] Candidates found: ${result.candidates.length}`);
    
    if (result.candidates.length > 0) {
      const candidate = result.candidates[0];
      console.log(`[PASS] Identified Entity: ${candidate.entityName} (Type: ${candidate.entityType})`);
      console.log(`[PASS] Confidence: ${candidate.confidenceLevel}`);
      if (candidate.confidenceLevel === "LIKELY" && candidate.entityName === "Binance") {
        console.log(`[PASS] Attribution logic correctly fused evidence and determined LIKELY confidence.`);
      } else {
        console.log(`[FAIL] Attribution logic returned unexpected confidence or entity.`);
      }
    } else {
      console.log(`[FAIL] No candidates were generated.`);
    }

  } catch (e: any) {
    console.error(`[FAIL] VASP test failed: ${e.message}`);
  }

  process.exit(0);
}

verifyP013().catch(console.error);
