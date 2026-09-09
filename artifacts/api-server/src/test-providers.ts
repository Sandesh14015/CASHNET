import { ProviderRouter } from "./services/blockchain/provider-router.js";
import { config } from "./config/index.js";

async function runTests() {
  const fetcher = globalThis.fetch;

  // We must override the dataMode for testing the providers, otherwise the router throws UnsupportedChainError
  const testConfig = { ...config, dataMode: "authorized" as const };
  const router = new ProviderRouter(testConfig, fetcher);

  const tests = [
    { chain: "ETHEREUM" as const, address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", invalid: "0xInvalid" },
    { chain: "BITCOIN" as const, address: "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97", invalid: "invalidbtc" },
    { chain: "TRON" as const, address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHKNdGg", invalid: "invalidtron" },
    { chain: "SOLANA" as const, address: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg", invalid: "invalidsol" },
    { chain: "POLYGON" as const, address: "0x220866B1A2219f40e72f5c628B65D54268cA3A9D", invalid: "0xInvalid" },
    { chain: "BNB_CHAIN" as const, address: "0x0000000000000000000000000000000000000000", invalid: "0xInvalid" }
  ];

  for (const { chain, address, invalid } of tests) {
    console.log("\n======================================================");
    console.log("--- Testing " + chain + " ---");
    
    try {
      const instance = router.forChain(chain);
      console.log("Provider Class: " + instance.constructor.name);
      
      const isValid = instance.validateAddress(address);
      const isInvalid = instance.validateAddress(invalid);
      console.log("Valid Address (" + address + "): " + (isValid ? "PASS" : "FAIL"));
      console.log("Invalid Address (" + invalid + "): " + (!isInvalid ? "PASS" : "FAIL"));
      
      console.log("Attempting to fetch live transactions...");
      const result = await instance.getTransactions(address, { limit: 1 });
      console.log("Fetch Success! Found " + result.transactions.length + " txs.");
      if (result.transactions.length > 0) {
        console.log("Example Normalized Tx ID: " + result.transactions[0].hash);
      }
    } catch (error) {
      console.log("Fetch Failed: " + (error instanceof Error ? error.message : String(error)));
    }
  }
}

runTests().catch(console.error);
