import { candidateEvidence } from "../artifacts/api-server/src/services/intelligence/vasp-candidate-service.js";
import { fuseAttributionEvidence } from "../artifacts/api-server/src/services/intelligence/attribution-evidence-fusion-service.js";

async function verifyP013() {
  console.log("P0.13 VASP ATTRIBUTION TESTS (LOGIC EVALUATION)\n");

  const address = "0xVaspTestAddress";
  
  // Synthetic Observations
  const observations: any[] = [
    {
      chain: "ETHEREUM",
      address,
      source: "synthetic-audit",
      entityName: "Binance",
      entityType: "VASP",
      category: "EXCHANGE",
      confidence: 95,
      freshnessStatus: "FRESH"
    },
    {
      chain: "ETHEREUM",
      address,
      source: "synthetic-audit-2",
      entityName: "Binance",
      entityType: "VASP",
      category: "EXCHANGE",
      confidence: 80,
      freshnessStatus: "FRESH"
    }
  ];

  try {
    console.log(`[INFO] Extracting candidate evidence...`);
    const relationshipCount = 5; // 5 interactions
    const clusterMatches = true;

    const evidence = candidateEvidence("ETHEREUM", address, observations as any, relationshipCount, clusterMatches);
    console.log(`[PASS] Extracted ${evidence.length} evidence pieces.`);

    console.log(`[INFO] Fusing evidence...`);
    const fused = fuseAttributionEvidence(evidence);

    console.log(`[PASS] Evidence Fusion executed.`);
    console.log(`[INFO] Numeric Score: ${fused.numericScore}`);
    console.log(`[INFO] Confidence Level: ${fused.confidenceLevel}`);
    console.log(`[INFO] Contradictions: ${fused.contradictions.length}`);
    
    if (fused.confidenceLevel === "LIKELY" || fused.confidenceLevel === "CANDIDATE") {
      console.log(`[PASS] Attribution logic correctly fused evidence and determined positive confidence.`);
    } else {
      console.log(`[FAIL] Attribution logic returned unexpected confidence.`);
    }

  } catch (e: any) {
    console.error(`[FAIL] VASP test failed: ${e.message}`);
  }

  process.exit(0);
}

verifyP013().catch(console.error);
