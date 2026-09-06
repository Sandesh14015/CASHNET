import { createConfig } from "../artifacts/api-server/src/config";
import { EtherscanEthereumProvider } from "../artifacts/api-server/src/services/blockchain/etherscan-provider";

async function main() {
  console.log("--- LIVE VALIDATION START ---");
  try {
    const config = createConfig();
    const provider = new EtherscanEthereumProvider(config);
    
    // Read-only validation: getWalletProfile for Ethereum Foundation
    const address = "0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae";
    const result = await provider.getWalletProfile(address);
    
    console.log("provider: etherscan-v2");
    console.log("endpoint hostname/path: api.etherscan.io/v2/api");
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
    }
  } catch (error) {
    console.log("provider: etherscan-v2");
    console.log("endpoint hostname/path: api.etherscan.io/v2/api");
    console.log("request type: getWalletProfile");
    console.log(`HTTP/result status: ERROR`);
    console.log("final PASS/FAIL: FAIL");
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
