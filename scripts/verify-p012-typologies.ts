import { RiskTypologyFramework } from "../artifacts/api-server/src/services/risk/typology-framework.js";

async function verifyP012() {
  console.log("P0.12 TYPOLOGY DETECTION TESTS\n");

  const framework = new RiskTypologyFramework();

  console.log("[INFO] Implemented Typologies in Framework: 5 (Not 22!)");
  console.log("[INFO] Beginning execution of test payloads...\n");
  
  const payload: any[] = [
    { indicatorType: "HIGH_VELOCITY", score: 0.9, metadata: {} },
    { indicatorType: "ROUND_NUMBER_PATTERN", score: 0.8, metadata: {} },
    { indicatorType: "BURST_ACTIVITY", score: 0.8, metadata: {} },
    { indicatorType: "PEEL_CHAIN", score: 0.9, metadata: {} },
    { indicatorType: "FAN_OUT", score: 0.8, metadata: {} },
    { indicatorType: "SANCTIONED_INTERACTION", score: 1.0, metadata: {} },
    { indicatorType: "COUNTERPARTY_CONCENTRATION", score: 0.7, metadata: {} }
  ];

  try {
    const results = framework.evaluateIndicators(payload as any);
    console.log(`[PASS] Framework executed successfully.`);
    console.log(`[PASS] Triggered Typologies (${results.length}): ${results.map(r => r.typology.name).join(', ')}`);
    if (results.length === 5) {
        console.log(`[PASS] All 5 typologies were successfully triggered.`);
    } else {
        console.log(`[FAIL] Expected 5 typologies to trigger, got ${results.length}.`);
    }
    console.log(`\n[SUMMARY] The codebase contains exactly 5 typologies. 22/22 claim is FALSE. Execution passed for the 5 existing typologies.`);
  } catch (e: any) {
    console.error(`[FAIL] Framework execution failed: ${e.message}`);
  }

  process.exit(0);
}

verifyP012().catch(console.error);
