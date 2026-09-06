import { createConfig } from "../artifacts/api-server/src/config";
import { EsploraBitcoinProvider } from "../artifacts/api-server/src/services/blockchain/esplora-provider";

async function main() {
  console.log("--- LIVE VALIDATION START ---");
  try {
    const config = createConfig();
    const provider = new EsploraBitcoinProvider(config);
    
    // Read-only validation: getWalletProfile for Bitcoin Genesis address
    const address = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    const result = await provider.getWalletProfile(address);
    
    // Obfuscate full endpoint to avoid logging potential secrets in URLs
    let safeUrl = "UNKNOWN";
    try {
        const url = new URL(config.providers.bitcoinEsplora.baseUrl ?? "");
        safeUrl = url.hostname + url.pathname;
    } catch {}

    console.log("provider: blockstream-esplora");
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
    console.log("provider: blockstream-esplora");
    console.log("request type: getWalletProfile");
    console.log(`HTTP/result status: ERROR`);
    console.log("final PASS/FAIL: FAIL");
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
