import { ProviderFailureError, RateLimitError, UnavailableServiceError } from "../../errors/app-error";
import type { CashnetConfig } from "../../config";
import { ProviderHttpClient } from "./http-client";
import { evmTransaction, evmWallet } from "./normalizers";
import type { BlockchainFactProvider, ProviderResult } from "./types";

type EtherscanResponse = { status?: string; message?: string; result?: unknown };
const pageSize = 100;
const etherscanDelay = () => new Promise<void>((r) => setTimeout(r, 250));

export class EtherscanEthereumProvider implements BlockchainFactProvider {
  readonly name = "etherscan-v2";
  readonly chain = "ETHEREUM" as const;
  private readonly client: ProviderHttpClient;
  constructor(private readonly config: CashnetConfig, fetcher?: typeof fetch) { this.client = new ProviderHttpClient(config.providerRequest, fetcher); }
  async validateAddress(address: string) { return /^0x[a-fA-F0-9]{40}$/.test(address); }
  async getWalletProfile(address: string): Promise<ProviderResult<ReturnType<typeof evmWallet> | null>> {
    this.requireConfigured(); const response = await this.request({ module: "account", action: "balance", address, tag: "latest" });
    return { status: "SUCCESS", data: evmWallet(address, response.result, response) };
  }
  async getTransactions(address: string, page = "1") { await etherscanDelay(); const response = await this.request({ module: "account", action: "txlist", address, startblock: "0", endblock: "999999999", page, offset: String(pageSize), sort: "desc" }); return this.transactions(response, "normal", page); }
  async getTokenTransfers(address: string, page = "1") { await etherscanDelay(); const response = await this.request({ module: "account", action: "tokentx", address, page, offset: String(pageSize), sort: "desc" }); if (!Array.isArray(response.result) || response.result.length === 0) return { status: "EMPTY" as const, data: [] }; return { status: "SUCCESS" as const, data: response.result.map((entry) => evmTransaction(entry, "token").tokenTransfers).flat(), nextPage: response.result.length === pageSize ? String(Number(page) + 1) : undefined }; }
  async getInternalTransactions(address: string, page = "1") { await etherscanDelay(); const response = await this.request({ module: "account", action: "txlistinternal", address, startblock: "0", endblock: "999999999", page, offset: String(pageSize), sort: "desc" }); return this.transactions(response, "internal", page); }
  async getTransaction(transactionHash: string) { await etherscanDelay(); const response = await this.request({ module: "proxy", action: "eth_getTransactionByHash", txhash: transactionHash }); if (!response.result || typeof response.result !== "object") return { status: "EMPTY" as const, data: null }; return { status: "SUCCESS" as const, data: evmTransaction(response.result, "transaction") }; }
  async getBlock(blockReference: string) { await etherscanDelay(); const tag = /^\d+$/.test(blockReference) ? `0x${BigInt(blockReference).toString(16)}` : blockReference; const response = await this.request({ module: "proxy", action: "eth_getBlockByNumber", tag, boolean: "false" }); return response.result && typeof response.result === "object" ? { status: "SUCCESS" as const, data: response.result as Record<string, unknown> } : { status: "EMPTY" as const, data: null }; }
  private async transactions(response: EtherscanResponse, kind: string, page: string) { if (!Array.isArray(response.result) || response.result.length === 0) return { status: "EMPTY" as const, data: [] }; return { status: "SUCCESS" as const, data: response.result.map((entry) => evmTransaction(entry, kind)), nextPage: response.result.length === pageSize ? String(Number(page) + 1) : undefined }; }
  private requireConfigured() { if (!this.config.providers.etherscan.configured) throw new UnavailableServiceError("Etherscan is not configured. Set ETHERSCAN_API_KEY only in the server environment."); }
  private async request(query: Record<string, string>): Promise<EtherscanResponse> { this.requireConfigured(); const url = new URL("https://api.etherscan.io/v2/api"); url.search = new URLSearchParams({ chainid: this.config.providers.etherscan.chainId, apikey: process.env.ETHERSCAN_API_KEY ?? "", ...query }).toString(); const response = await this.client.getJson(url.toString()); if (!response || typeof response !== "object" || Array.isArray(response)) throw new ProviderFailureError("Etherscan returned an unexpected response."); const parsed = response as EtherscanResponse; if (parsed.status === "0" && !Array.isArray(parsed.result) && parsed.result !== "0") { if (typeof parsed.result === "string" && parsed.result.toLowerCase().includes("rate limit")) throw new RateLimitError("Etherscan rate limit reached."); throw new ProviderFailureError(`Etherscan rejected the request: ${typeof parsed.result === "string" ? parsed.result : parsed.message ?? "unknown"}`); } return parsed; }
}
