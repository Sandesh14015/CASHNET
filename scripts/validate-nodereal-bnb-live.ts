/**
 * scripts/validate-nodereal-bnb-live.ts
 *
 * Isolated read-only live validation of the NodeRealBnbProvider.
 *
 * Requirements:
 * - Instantiate the real NodeRealBnbProvider via createConfig()
 * - Read configuration from the real environment
 * - Perform genuine live HTTPS JSON-RPC requests to NodeReal
 * - Use a stable read-only public BNB address
 * - Exercise the real normalization layer
 * - Do NOT initialize PostgreSQL
 * - Do NOT call the application API
 * - Do NOT mutate blockchain or database state
 * - Do NOT print credentials
 */

import { createConfig } from "../artifacts/api-server/src/config";
import { NodeRealBnbProvider } from "../artifacts/api-server/src/services/blockchain/nodereal-provider";

async function run() {
  const config = createConfig(process.env);
  const baseUrl = config.providers.noderealBnb.baseUrl;
  
  try {
    const parsed = new URL(baseUrl);
    console.log(`[VALIDATION] Endpoint Hostname: ${parsed.hostname}`);
  } catch {
    console.log(`[VALIDATION] Endpoint URL is malformed.`);
    process.exit(1);
  }

  const hasApiKey = Boolean(config.providers.noderealBnb.apiKey);
  console.log(`[VALIDATION] Authentication: ${hasApiKey ? "PRESENT" : "ABSENT"}`);

  if (!hasApiKey) {
    console.log("PENDING_EXTERNAL — BNB_NODEREAL_API_KEY required");
    process.exit(0);
  }

  // Stable Binance Hot Wallet (BSC)
  const TEST_ADDRESS = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
  
  console.log(`[VALIDATION] Target Address: ${TEST_ADDRESS}`);
  
  const provider = new NodeRealBnbProvider(config);
  
  console.log(`[VALIDATION] Dispatching live read-only requests...`);
  try {
    const profile = await provider.getWalletProfile(TEST_ADDRESS);
    if (profile.status !== "SUCCESS") throw new Error(`Unexpected profile status ${profile.status}`);
    console.log(`[VALIDATION] Wallet Profile: SUCCESS (Balance: ${profile.data?.balance} wei)`);

    const txs = await provider.getTransactions(TEST_ADDRESS);
    if (txs.status !== "SUCCESS") throw new Error(`Unexpected getTransactions status ${txs.status}`);
    console.log(`[VALIDATION] getTransactions (external): SUCCESS (Count: ${txs.data.length})`);
    
    if (txs.data.length > 0) {
       console.log(`[VALIDATION] Fallback/Input Check: PRESERVED (Input: ${txs.data[0].transaction.input ? "Present" : "Missing"})`);
    }

    const tokenTxs = await provider.getTokenTransfers(TEST_ADDRESS);
    if (tokenTxs.status !== "SUCCESS" && tokenTxs.status !== "EMPTY") throw new Error(`Unexpected getTokenTransfers status ${tokenTxs.status}`);
    console.log(`[VALIDATION] getTokenTransfers (20): SUCCESS (Count: ${tokenTxs.data?.length || 0})`);

    const internalTxs = await provider.getInternalTransactions(TEST_ADDRESS);
    if (internalTxs.status !== "SUCCESS" && internalTxs.status !== "EMPTY") throw new Error(`Unexpected getInternalTransactions status ${internalTxs.status}`);
    console.log(`[VALIDATION] getInternalTransactions: SUCCESS (Count: ${internalTxs.data?.length || 0})`);
    
    // Provenance checks
    const p1 = profile.data?.provenance?.provider;
    const p2 = txs.data?.[0]?.transaction?.provenance?.provider;
    console.log(`[VALIDATION] Provenance Provider: ${p1} / ${p2}`);
    
    if (p1 !== "nodereal" || p2 !== "nodereal") {
      console.error("FAIL: Normalization or provenance failed validation.");
      process.exit(1);
    }
    
    console.log("PASS");
  } catch (error) {
    if (error && typeof error === "object" && "name" in error) {
      if (error.name === "RateLimitError") {
         console.error("FAIL: Provider rejected request due to rate limit.");
         process.exit(1);
      }
    }
    console.error("FAIL: Request threw an exception:");
    console.error(error);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("FAIL: Unhandled exception", err);
  process.exit(1);
});
