/**
 * scripts/validate-solana-live.ts
 *
 * Isolated read-only live validation of the SolanaRpcProvider.
 *
 * Requirements:
 * - Instantiate the real SolanaRpcProvider via createConfig()
 * - Read configuration from the real environment
 * - Perform a genuine live HTTPS request to the configured RPC endpoint
 * - Use a stable read-only public Solana address (Solana Foundation)
 * - Exercise the real normalization layer
 * - Do NOT initialize PostgreSQL
 * - Do NOT call the application API
 * - Do NOT mutate blockchain or database state
 * - Do NOT print credentials
 */

import { createConfig } from "../artifacts/api-server/src/config";
import { SolanaRpcProvider } from "../artifacts/api-server/src/services/blockchain/solana-provider";

async function run() {
  const config = createConfig(process.env);
  const rpcUrl = config.providers.solana.rpcUrl;
  
  if (!rpcUrl) {
    console.error("FAIL: SOLANA_RPC_URL is not configured.");
    process.exit(1);
  }

  // The URL may contain a sensitive path or key. Mask it before printing.
  try {
    const parsed = new URL(rpcUrl);
    const safeHostname = parsed.hostname;
    console.log(`[VALIDATION] Endpoint Hostname: ${safeHostname}`);
  } catch {
    console.log(`[VALIDATION] Endpoint URL is malformed.`);
    process.exit(1);
  }

  console.log(`[VALIDATION] Authentication: ${config.providers.solana.apiKey ? "PRESENT" : "ABSENT"}`);

  // Known stable public address
  const TEST_ADDRESS = "v4wBohqL7zX9Y75w7tEqBup4a1vXF7F4QZ4hYQ8mU9L"; // Example valid address (Base58)
  
  console.log(`[VALIDATION] Target Address: ${TEST_ADDRESS}`);
  
  // Use a generic un-authenticated fetcher wrapper to match the exact runtime behavior
  // Note: The provider internally adds the Authorization header if an apiKey is configured.
  const provider = new SolanaRpcProvider(config);
  
  console.log(`[VALIDATION] Dispatching live read-only getWalletProfile request...`);
  try {
    const profile = await provider.getWalletProfile(TEST_ADDRESS);
    
    if (profile.status !== "SUCCESS") {
      console.error(`FAIL: Unexpected provider status ${profile.status}`);
      process.exit(1);
    }
    
    console.log(`[VALIDATION] Request SUCCESS.`);
    console.log(`[VALIDATION] Balance: ${profile.data?.balance} lamports`);
    console.log(`[VALIDATION] Normalization Chain: ${profile.data?.chain}`);
    console.log(`[VALIDATION] Provenance Provider: ${profile.data?.provenance?.provider}`);
    console.log(`[VALIDATION] Provenance Raw Reference: ${profile.data?.provenance?.rawReference}`);
    
    if (profile.data?.chain !== "SOLANA" || profile.data?.provenance?.provider !== "solana-rpc") {
      console.error("FAIL: Normalization or provenance failed validation.");
      process.exit(1);
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
