import { ProviderFailureError, RateLimitError } from "../../errors/app-error";
import type { CashnetConfig } from "../../config";
import { ProviderHttpClient } from "./http-client";
import { blockscoutPolygonWallet, blockscoutPolygonTransaction, blockscoutPolygonTokenTransfer } from "./normalizers";
import type { BlockchainFactProvider, NormalizedTransactionBundle, ProviderResult } from "./types";
import type { TokenTransfer, Wallet } from "../../schemas/models";

type BlockscoutResponse = { status?: string; message?: string; result?: unknown };
const pageSize = 100;
const blockscoutDelay = () => new Promise<void>((r) => setTimeout(r, 250));

/**
 * Polygon provider via Blockscout API.
 *
 * Blockscout's main Polygon instance supports Etherscan-compatible API parameters:
 * - API base: https://polygon.blockscout.com/api
 * - V2 API (for block lookup): https://polygon.blockscout.com/api/v2
 * - Native asset: POL (formerly MATIC), balance in wei
 * - Chain ID: 137
 */
export class PolygonBlockscoutProvider implements BlockchainFactProvider {
  readonly name = "blockscout";
  readonly chain = "POLYGON" as const;
  private readonly client: ProviderHttpClient;

  constructor(private readonly config: CashnetConfig, fetcher?: typeof fetch) {
    this.client = new ProviderHttpClient(config.providerRequest, fetcher);
  }

  async validateAddress(address: string): Promise<boolean> {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  async getWalletProfile(address: string): Promise<ProviderResult<Wallet | null>> {
    const response = await this.request({ module: "account", action: "balance", address });
    return { status: "SUCCESS", data: blockscoutPolygonWallet(address, response.result, response) };
  }

  async getTransactions(address: string, page = "1"): Promise<ProviderResult<NormalizedTransactionBundle[]>> {
    await blockscoutDelay();
    const response = await this.request({
      module: "account", action: "txlist", address,
      startblock: "0", endblock: "999999999",
      page, offset: String(pageSize), sort: "desc",
    });
    return this.parseTransactions(response, "normal", page);
  }

  async getTokenTransfers(address: string, page = "1"): Promise<ProviderResult<TokenTransfer[]>> {
    await blockscoutDelay();
    const response = await this.request({
      module: "account", action: "tokentx", address,
      page, offset: String(pageSize), sort: "desc",
    });
    if (!Array.isArray(response.result) || response.result.length === 0) {
      return { status: "EMPTY", data: [] };
    }
    return {
      status: "SUCCESS",
      data: response.result.map((entry) => blockscoutPolygonTokenTransfer(entry)).filter((t): t is TokenTransfer => t !== null),
      nextPage: response.result.length === pageSize ? String(Number(page) + 1) : undefined,
    };
  }

  async getInternalTransactions(address: string, page = "1"): Promise<ProviderResult<NormalizedTransactionBundle[]>> {
    await blockscoutDelay();
    const response = await this.request({
      module: "account", action: "txlistinternal", address,
      startblock: "0", endblock: "999999999",
      page, offset: String(pageSize), sort: "desc",
    });
    return this.parseTransactions(response, "internal", page);
  }

  async getTransaction(transactionHash: string): Promise<ProviderResult<NormalizedTransactionBundle | null>> {
    await blockscoutDelay();
    // Blockscout Etherscan-compatible gettxinfo
    const response = await this.request({ module: "transaction", action: "gettxinfo", txhash: transactionHash });
    if (!response.result || typeof response.result !== "object") return { status: "EMPTY", data: null };
    return { status: "SUCCESS", data: blockscoutPolygonTransaction(response.result, "transaction") };
  }

  async getBlock(blockReference: string): Promise<ProviderResult<Record<string, unknown> | null>> {
    await blockscoutDelay();
    const baseUrl = this.config.providers.polygon.baseUrl || "https://polygon.blockscout.com";
    const url = `${baseUrl.replace(/\/api$/, "")}/api/v2/blocks/${blockReference}`;
    try {
      const response = await this.client.getJson(url);
      if (!response || typeof response !== "object") return { status: "EMPTY", data: null };
      return { status: "SUCCESS", data: response as Record<string, unknown> };
    } catch (e: any) {
      if (e && e.name === "ProviderFailureError") return { status: "EMPTY", data: null };
      throw e;
    }
  }

  private parseTransactions(response: BlockscoutResponse, kind: string, page: string): ProviderResult<NormalizedTransactionBundle[]> {
    if (!Array.isArray(response.result) || response.result.length === 0) return { status: "EMPTY", data: [] };
    return {
      status: "SUCCESS",
      data: response.result.map((entry) => blockscoutPolygonTransaction(entry, kind)),
      nextPage: response.result.length === pageSize ? String(Number(page) + 1) : undefined,
    };
  }

  private async request(query: Record<string, string>): Promise<BlockscoutResponse> {
    const baseUrl = this.config.providers.polygon.baseUrl || "https://polygon.blockscout.com/api";
    const url = new URL(baseUrl);
    const params = new URLSearchParams(query);
    // Only append apikey if configured
    if (this.config.providers.polygon.apiKey) {
      params.append("apikey", this.config.providers.polygon.apiKey);
    }
    url.search = params.toString();

    const response = await this.client.getJson(url.toString());
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      throw new ProviderFailureError("Blockscout returned an unexpected response.");
    }
    const parsed = response as BlockscoutResponse;
    if (parsed.status === "0" && !Array.isArray(parsed.result) && parsed.result !== "0") {
      if (typeof parsed.result === "string" && parsed.result.toLowerCase().includes("rate limit")) {
        throw new RateLimitError("Blockscout rate limit reached.");
      }
      throw new ProviderFailureError(`Blockscout rejected the request: ${typeof parsed.result === "string" ? parsed.result : parsed.message ?? "unknown"}`);
    }
    return parsed;
  }
}
