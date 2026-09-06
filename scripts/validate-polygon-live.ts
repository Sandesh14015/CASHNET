/**
 * scripts/validate-polygon-live.ts
 *
 * Isolated read-only live validation of the PolygonBlockscoutProvider.
 *
 * Requirements:
 * - Instantiate the real PolygonBlockscoutProvider via createConfig()
 * - Read configuration from the real environment
 * - Perform a genuine live HTTPS request to the configured Blockscout endpoint
 * - Use a stable read-only public Polygon address
 * - Exercise the real normalization layer
 * - Do NOT initialize PostgreSQL
 * - Do NOT call the application API
 * - Do NOT mutate blockchain or database state
 * - Do NOT print credentials
 */

import { createConfig } from "../artifacts/api-server/src/config";
import { PolygonBlockscoutProvider } from "../artifacts/api-server/src/services/blockchain/blockscout-provider";

async function run() {
  const config = createConfig(process.env);
  const baseUrl = config.providers.polygon.baseUrl || "https://polygon.blockscout.com/api";
  
  // The URL may contain a sensitive path or key. Mask it before printing.
  try {
    const parsed = new URL(baseUrl);
    const safeHostname = parsed.hostname;
    console.log(`[VALIDATION] Endpoint Hostname: ${safeHostname}`);
  } catch {
    console.log(`[VALIDATION] Endpoint URL is malformed.`);
    process.exit(1);
  }

  console.log(`[VALIDATION] Authentication: ${config.providers.polygon.apiKey ? "PRESENT" : "ABSENT"}`);

  // Known stable public address on Polygon
  const TEST_ADDRESS = "0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4";
  
  console.log(`[VALIDATION] Target Address: ${TEST_ADDRESS}`);
  
  const provider = new PolygonBlockscoutProvider(config);
  
  console.log(`[VALIDATION] Dispatching live read-only getWalletProfile request...`);
  try {
    const profile = await provider.getWalletProfile(TEST_ADDRESS);
    
    if (profile.status !== "SUCCESS") {
      console.error(`FAIL: Unexpected provider status ${profile.status}`);
      process.exit(1);
    }
    
    console.log(`[VALIDATION] Request SUCCESS.`);
    console.log(`[VALIDATION] Balance: ${profile.data?.balance} wei`);
    console.log(`[VALIDATION] Normalization Chain: ${profile.data?.chain}`);
    console.log(`[VALIDATION] Provenance Provider: ${profile.data?.provenance?.provider}`);
    console.log(`[VALIDATION] Provenance Raw Reference: ${profile.data?.provenance?.rawReference}`);
    
    if (profile.data?.chain !== "POLYGON" || profile.data?.provenance?.provider !== "blockscout") {
      console.error("FAIL: Normalization or provenance failed validation.");
      process.exit(1);
    }
    
    const txs = await provider.getTransactions(TEST_ADDRESS);
    if (txs.status !== "SUCCESS") throw new Error("Unexpected getTransactions status");
    console.log(`[VALIDATION] getTransactions: SUCCESS (Count: ${txs.data.length})`);

    const tokenTxs = await provider.getTokenTransfers(TEST_ADDRESS);
    if (tokenTxs.status !== "SUCCESS" && tokenTxs.status !== "EMPTY") throw new Error("Unexpected getTokenTransfers status");
    console.log(`[VALIDATION] getTokenTransfers: SUCCESS (Count: ${tokenTxs.data?.length || 0})`);

    const internalTxs = await provider.getInternalTransactions(TEST_ADDRESS);
    if (internalTxs.status !== "SUCCESS" && internalTxs.status !== "EMPTY") throw new Error("Unexpected getInternalTransactions status");
    console.log(`[VALIDATION] getInternalTransactions: SUCCESS (Count: ${internalTxs.data?.length || 0})`);

    if (txs.data.length > 0) {
      const txHash = txs.data[0].transaction.transactionHash;
      const tx = await provider.getTransaction(txHash);
      if (tx.status !== "SUCCESS") throw new Error("Unexpected getTransaction status");
      console.log(`[VALIDATION] getTransaction: SUCCESS (Hash: ${tx.data?.transaction.transactionHash})`);

      const blockNum = txs.data[0].transaction.blockNumber;
      if (blockNum) {
        const block = await provider.getBlock(blockNum);
        if (block.status !== "SUCCESS") throw new Error("Unexpected getBlock status");
        console.log(`[VALIDATION] getBlock: SUCCESS`);
      }
    }
    
    console.log("PASS");
    process.exit(0);
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
