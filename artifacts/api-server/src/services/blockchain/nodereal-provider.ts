import { ProviderFailureError, RateLimitError, UnavailableServiceError } from "../../errors/app-error";
import type { CashnetConfig } from "../../config";
import { ProviderHttpClient } from "./http-client";
import { noderealBnbWallet, noderealBnbTransaction, noderealBnbTokenTransfer } from "./normalizers";
import type { BlockchainFactProvider, NormalizedTransactionBundle, ProviderResult } from "./types";
import type { TokenTransfer, Wallet } from "../../schemas/models";

type JsonRpcResponse = { id?: string | number; jsonrpc?: string; result?: unknown; error?: { code: number; message: string } };

/**
 * BNB Chain provider via NodeReal MegaNode / BSCTrace JSON-RPC.
 */
export class NodeRealBnbProvider implements BlockchainFactProvider {
  readonly name = "nodereal";
  readonly chain = "BNB_CHAIN" as const;
  private readonly client: ProviderHttpClient;

  constructor(private readonly config: CashnetConfig, fetcher?: typeof fetch) {
    this.client = new ProviderHttpClient(config.providerRequest, fetcher);
  }

  async validateAddress(address: string): Promise<boolean> {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  async getWalletProfile(address: string): Promise<ProviderResult<Wallet | null>> {
    const response = await this.rpcRequest("eth_getBalance", [address, "latest"]);
    return { status: "SUCCESS", data: noderealBnbWallet(address, response.result, response) };
  }

  async getTransactions(address: string, page = ""): Promise<ProviderResult<NormalizedTransactionBundle[]>> {
    return this.getAssetTransfers(address, ["external"], page, "normal");
  }

  async getTokenTransfers(address: string, page = ""): Promise<ProviderResult<TokenTransfer[]>> {
    const response = await this.rpcRequest("nr_getAssetTransfers", [{ fromAddress: address, category: ["20"], maxCount: "0x64", pageKey: page || undefined }]);
    const result = response.result as { pageKey?: string; transfers?: unknown[] };
    if (!result || !Array.isArray(result.transfers) || result.transfers.length === 0) {
      return { status: "EMPTY", data: [] };
    }
    return {
      status: "SUCCESS",
      data: result.transfers.map((entry) => noderealBnbTokenTransfer(entry)).filter((t): t is TokenTransfer => t !== null),
      nextPage: result.pageKey || undefined,
    };
  }

  async getInternalTransactions(address: string, page = ""): Promise<ProviderResult<NormalizedTransactionBundle[]>> {
    return this.getAssetTransfers(address, ["internal"], page, "internal");
  }

  async getTransaction(transactionHash: string): Promise<ProviderResult<NormalizedTransactionBundle | null>> {
    const response = await this.rpcRequest("eth_getTransactionByHash", [transactionHash]);
    if (!response.result || typeof response.result !== "object") return { status: "EMPTY", data: null };
    
    // Check receipts status
    const receiptResponse = await this.rpcRequest("eth_getTransactionReceipt", [transactionHash]);
    const receipt = receiptResponse.result && typeof receiptResponse.result === "object" ? receiptResponse.result as { status?: string } : {};
    
    const combined = { ...(response.result as Record<string, unknown>), receiptsStatus: receipt.status === "0x1" ? 1 : 0 };
    return { status: "SUCCESS", data: noderealBnbTransaction(combined, "transaction") };
  }

  async getBlock(blockReference: string): Promise<ProviderResult<Record<string, unknown> | null>> {
    const tag = /^\d+$/.test(blockReference) ? `0x${BigInt(blockReference).toString(16)}` : blockReference;
    const response = await this.rpcRequest("eth_getBlockByNumber", [tag, false]);
    return response.result && typeof response.result === "object"
      ? { status: "SUCCESS", data: response.result as Record<string, unknown> }
      : { status: "EMPTY", data: null };
  }

  private async getAssetTransfers(address: string, category: string[], page: string, kind: string): Promise<ProviderResult<NormalizedTransactionBundle[]>> {
    const response = await this.rpcRequest("nr_getAssetTransfers", [{ fromAddress: address, category, maxCount: "0x14", pageKey: page || undefined }]);
    const result = response.result as { pageKey?: string; transfers?: unknown[] };
    if (!result || !Array.isArray(result.transfers) || result.transfers.length === 0) {
      return { status: "EMPTY", data: [] };
    }
    
    const mapped = [];
    for (const entry of result.transfers) {
      // Fallback for calldata / missing transaction details
      let combined = { ...(entry as Record<string, unknown>) };
      if (typeof combined.hash === "string" && !combined.input) {
        try {
          const txResponse = await this.rpcRequest("eth_getTransactionByHash", [combined.hash]);
          if (txResponse.result && typeof txResponse.result === "object") {
            combined = { ...combined, ...(txResponse.result as Record<string, unknown>) };
          }
        } catch (e) {
           // ignore error to prevent storm failure
        }
      }
      mapped.push(noderealBnbTransaction(combined, kind));
    }

    return {
      status: "SUCCESS",
      data: mapped,
      nextPage: result.pageKey || undefined,
    };
  }

  private requireConfigured(): string {
    const { apiKey, baseUrl } = this.config.providers.noderealBnb;
    if (!this.config.providers.noderealBnb.configured || !apiKey) {
      throw new UnavailableServiceError("NodeReal is not configured. Set BNB_NODEREAL_API_KEY in the server environment.");
    }
    return `${baseUrl.replace(/\/+$/, "")}/${apiKey}`;
  }

  private async rpcRequest(method: string, params: unknown[]): Promise<JsonRpcResponse> {
    const endpoint = this.requireConfigured();
    const payload = { jsonrpc: "2.0", id: Date.now(), method, params };
    
    // Note: ProviderHttpClient currently uses GET if you pass just URL. We need POST for JSON-RPC.
    // Wait, let's check ProviderHttpClient implementation to see how POST is handled.
    const response = await this.client.postJson(endpoint, payload);
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      throw new ProviderFailureError("NodeReal returned an unexpected response.");
    }
    const parsed = response as JsonRpcResponse;
    if (parsed.error) {
      if (parsed.error.code === 429 || parsed.error.message.toLowerCase().includes("rate limit")) {
        throw new RateLimitError("NodeReal rate limit reached.");
      }
      throw new ProviderFailureError(`NodeReal rejected the request: ${parsed.error.message}`);
    }
    return parsed;
  }
}
