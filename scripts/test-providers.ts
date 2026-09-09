import { EtherscanEthereumProvider } from "../artifacts/api-server/src/services/blockchain/etherscan-provider";
import { EsploraBitcoinProvider } from "../artifacts/api-server/src/services/blockchain/esplora-provider";
import { TronGridProvider } from "../artifacts/api-server/src/services/blockchain/trongrid-provider";
import { SolanaRpcProvider } from "../artifacts/api-server/src/services/blockchain/solana-provider";
import { PolygonBlockscoutProvider } from "../artifacts/api-server/src/services/blockchain/blockscout-provider";
import { NodeRealBnbProvider } from "../artifacts/api-server/src/services/blockchain/nodereal-provider";
import { createBlockchainProviderConfig } from "../artifacts/api-server/src/config/index";

async function runTests() {
  const config = createBlockchainProviderConfig();
  const fetcher = globalThis.fetch;

  const providers = [
    { name: "Ethereum", instance: new EtherscanEthereumProvider(config, fetcher), address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", invalid: "0xInvalid" },
    { name: "Bitcoin", instance: new EsploraBitcoinProvider(config, fetcher), address: "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97", invalid: "invalidbtc" },
    { name: "Tron", instance: new TronGridProvider(config, fetcher), address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHKNdGg", invalid: "invalidtron" },
    { name: "Solana", instance: new SolanaRpcProvider(config, fetcher), address: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg", invalid: "invalidsol" },
    { name: "Polygon", instance: new PolygonBlockscoutProvider(config, fetcher), address: "0x220866B1A2219f40e72f5c628B65D54268cA3A9D", invalid: "0xInvalid" },
    { name: "BNB", instance: new NodeRealBnbProvider(config, fetcher), address: "0x0000000000000000000000000000000000000000", invalid: "0xInvalid" }
  ];

  for (const { name, instance, address, invalid } of providers) {
    console.log("\n======================================================");
    console.log("--- Testing " + name + " ---");
    console.log("Provider Class: " + instance.constructor.name);
    
    try {
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
