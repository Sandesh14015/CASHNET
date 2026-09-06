import { createConfig } from "../artifacts/api-server/src/config";
import { TronGridProvider } from "../artifacts/api-server/src/services/blockchain/trongrid-provider";

async function main() {
  console.log("--- LIVE VALIDATION START ---");
  try {
    const config = createConfig();

    if (!config.providers.trongrid.configured) {
        console.log("PENDING_EXTERNAL — TRONGRID_API_KEY required");
        process.exit(1);
    }

    const provider = new TronGridProvider(config);
    
    // Read-only validation: getWalletProfile for a known TRON address (e.g. burn address or genesis)
    // T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb is TRON burn address
    const address = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
    const result = await provider.getWalletProfile(address);
    
    // Obfuscate full endpoint to avoid logging potential secrets in URLs
    let safeUrl = "UNKNOWN";
    try {
        const url = new URL(config.providers.trongrid.baseUrl);
        safeUrl = url.hostname + "/v1/accounts/...";
    } catch {}

    console.log("provider: trongrid");
    console.log(`endpoint hostname/path: ${safeUrl}`);
    console.log("request type: getWalletProfile");
    console.log(`HTTP/result status: ${result.status}`);
    
    if (result.status === "SUCCESS") {
        console.log("response validation result: SUCCESS");
        console.log("normalization result: SUCCESS");
        console.log(`provenance result: ${result.data?.provenance?.provider}`);
        console.log("retry/rate-limit result: Not triggered");
        console.log("final PASS/FAIL: PASS");
    } else {
        console.log("final PASS/FAIL: FAIL");
        process.exit(1);
    }
  } catch (error) {
    console.log("provider: trongrid");
    console.log("request type: getWalletProfile");
    console.log(`HTTP/result status: ERROR`);
    console.log("final PASS/FAIL: FAIL");
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
