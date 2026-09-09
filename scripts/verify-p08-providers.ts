import { ProviderRouter } from "../artifacts/api-server/src/services/blockchain/provider-router.js";
import { config } from "../artifacts/api-server/src/config/index.js";

async function verifyP08() {
  console.log("P0.8 Live Provider Runtime Testing");
  console.log("Data Mode:", config.dataMode);

  if (config.dataMode !== "authorized") {
    console.error("FATAL: Test must run in authorized mode.");
    process.exit(1);
  }

  const router = new ProviderRouter(config, globalThis.fetch);

  const tests = [
    { chain: "ETHEREUM" as const, address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", invalid: "0xInvalid", name: "EtherscanEthereumProvider" },
    { chain: "BITCOIN" as const, address: "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97", invalid: "invalidbtc", name: "EsploraBitcoinProvider" },
    { chain: "TRON" as const, address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHKNdGg", invalid: "invalidtron", name: "TronGridProvider" },
    { chain: "SOLANA" as const, address: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg", invalid: "invalidsol", name: "SolanaRpcProvider" },
    { chain: "POLYGON" as const, address: "0x220866B1A2219f40e72f5c628B65D54268cA3A9D", invalid: "0xInvalid", name: "PolygonBlockscoutProvider" },
    { chain: "BNB_CHAIN" as const, address: "0x0000000000000000000000000000000000000000", invalid: "0xInvalid", name: "NodeRealBnbProvider" }
  ];

  let hasFailures = false;

  for (const { chain, address, invalid, name } of tests) {
    console.log("\n========================================");
    console.log(`TESTING PROVIDER: ${name} (Chain: ${chain})`);
    
    let instance;
    try {
      instance = router.forChain(chain);
      console.log("[PASS] Provider Instantiation");
    } catch (err: any) {
      console.error(`[FAIL] Instantiation Failed: ${err.message}`);
      hasFailures = true;
      continue;
    }

    try {
      const isValid = await instance.validateAddress(address);
      if (isValid) {
        console.log(`[PASS] Address Validation (Valid: ${address})`);
      } else {
        console.error(`[FAIL] Address Validation failed for valid address: ${address}`);
        hasFailures = true;
      }
    } catch (err: any) {
      console.error(`[FAIL] Address Validation exception: ${err.message}`);
      hasFailures = true;
    }

    try {
      const isInvalid = await instance.validateAddress(invalid);
      if (!isInvalid) {
        console.log(`[PASS] Address Validation (Invalid: ${invalid})`);
      } else {
        console.error(`[FAIL] Address Validation allowed invalid address: ${invalid}`);
        hasFailures = true;
      }
    } catch (err: any) {
      console.error(`[FAIL] Address Validation exception on invalid: ${err.message}`);
      hasFailures = true;
    }

    console.log(`[INFO] Executing live fetch for ${chain}...`);
    try {
      const result = await instance.getTransactions(address, { limit: 1 });
      console.log(`[PASS] Live Fetch Success. Tx Count: ${result.transactions.length}`);
      if (result.transactions.length > 0) {
        const tx = result.transactions[0];
        console.log(`[PASS] Normalization Success. First Tx Hash: ${tx.hash}`);
      }
    } catch (err: any) {
      console.error(`[FAIL/BLOCKED] Live Fetch Error: ${err.message}`);
      hasFailures = true;
    }
  }

  if (hasFailures) {
    console.error("\n[SUMMARY] One or more provider tests failed or were blocked.");
    process.exit(1);
  } else {
    console.log("\n[SUMMARY] All provider tests passed successfully.");
  }
}

verifyP08().catch((err) => {
  console.error("UNEXPECTED ERROR:", err);
  process.exit(1);
});
