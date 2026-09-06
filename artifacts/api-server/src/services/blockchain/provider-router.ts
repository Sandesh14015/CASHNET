import type { CashnetConfig } from "../../config";
import { UnsupportedChainError } from "../../errors/app-error";
import type { SupportedChain } from "./provider";
import { EsploraBitcoinProvider } from "./esplora-provider";
import { EtherscanEthereumProvider } from "./etherscan-provider";
import { TronGridProvider } from "./trongrid-provider";
import { NodeRealBnbProvider } from "./nodereal-provider";
import { PolygonBlockscoutProvider } from "./blockscout-provider";
import { SolanaRpcProvider } from "./solana-provider";
import type { BlockchainFactProvider } from "./types";

export class ProviderRouter {
  constructor(private readonly config: CashnetConfig, private readonly fetcher?: typeof fetch) {}
  forChain(chain: SupportedChain): BlockchainFactProvider {
    if (this.config.dataMode !== "authorized") throw new UnsupportedChainError("Live provider collection is disabled while CASHNET_DATA_MODE is synthetic.");
    if (chain === "ETHEREUM") return new EtherscanEthereumProvider(this.config, this.fetcher);
    if (chain === "BITCOIN") return new EsploraBitcoinProvider(this.config, this.fetcher);
    if (chain === "TRON") return new TronGridProvider(this.config, this.fetcher);
    if (chain === "BNB_CHAIN") return new NodeRealBnbProvider(this.config, this.fetcher);
    if (chain === "POLYGON") return new PolygonBlockscoutProvider(this.config, this.fetcher);
    if (chain === "SOLANA") return new SolanaRpcProvider(this.config, this.fetcher);
    throw new UnsupportedChainError(`No provider is configured for ${chain}.`);
  }
}
