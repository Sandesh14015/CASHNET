import { ProviderRouter } from "../artifacts/api-server/src/services/blockchain/provider-router.js";
import { createConfig } from "../artifacts/api-server/src/config/index.js";

async function verifyP014() {
  console.log("P0.14 SYNTHETIC/LIVE BOUNDARY TEST\n");

  try {
    const config = createConfig({ CASHNET_DATA_MODE: "synthetic" });
    const router = new ProviderRouter(config);
    router.forChain("ETHEREUM");
    console.error("[FAIL] Router allowed Ethereum initialization in synthetic mode!");
    process.exit(1);
  } catch (e: any) {
    if (e.message.includes("Live provider collection is disabled")) {
      console.log("[PASS] ProviderRouter correctly blocked live collection in 'synthetic' mode.");
    } else {
      console.error(`[FAIL] Unexpected error: ${e.message}`);
    }
  }

  try {
    const config = createConfig({ CASHNET_DATA_MODE: "authorized" });
    const router = new ProviderRouter(config);
    router.forChain("ETHEREUM");
    console.log("[PASS] ProviderRouter correctly allowed live collection in 'authorized' mode.");
  } catch (e: any) {
    console.error(`[FAIL] Unexpected error in authorized mode: ${e.message}`);
  }

  process.exit(0);
}

verifyP014().catch(console.error);
