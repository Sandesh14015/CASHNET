import { ProviderFailureError, RateLimitError, UnavailableServiceError } from "../../errors/app-error";
import type { CashnetConfig } from "../../config";
import { ProviderHttpClient } from "./http-client";
import { solanaWallet, solanaTransaction, solanaTokenTransfer } from "./solana-normalizer";
import type { BlockchainFactProvider, NormalizedTransactionBundle, ProviderResult } from "./types";
import type { TokenTransfer, Wallet } from "../../schemas/models";

/**
 * Solana provider via JSON-RPC 2.0.
 *
 * Solana is NOT EVM. This provider uses the Solana JSON-RPC protocol:
 * - Addresses are Base58-encoded Ed25519 public keys (32-44 chars)
 * - Transactions are identified by signatures (Base58)
 * - Blocks are identified by slots (u64)
 * - Transactions contain instructions (not input data like EVM)
 * - SPL tokens are separate from native SOL transfers
 *
 * Requires an explicitly approved RPC endpoint via SOLANA_RPC_URL.
 */

type JsonRpcResponse = { jsonrpc: string; id: number; result?: unknown; error?: { code: number; message: string } };
type SignatureInfo = { signature: string; slot: number; blockTime: number | null; err: unknown; memo: string | null; confirmationStatus?: string };
type RpcAccountInfo = { lamports: number; owner: string; data: unknown; executable: boolean; rentEpoch: number };
type ParsedInstruction = { program?: string; programId?: string; parsed?: { type?: string; info?: Record<string, unknown> }; data?: string; accounts?: string[] };
type ParsedTransactionMeta = { err: unknown; fee: number; preBalances: number[]; postBalances: number[]; preTokenBalances?: unknown[]; postTokenBalances?: unknown[]; innerInstructions?: { index: number; instructions: ParsedInstruction[] }[]; logMessages?: string[] };
type ParsedTransaction = { signatures: string[]; message: { accountKeys: { pubkey: string; signer: boolean; writable: boolean }[]; instructions: ParsedInstruction[]; recentBlockhash: string } };

const MAX_SIGNATURES = 100;
const solanaDelay = () => new Promise<void>((r) => setTimeout(r, 500));

export class SolanaRpcProvider implements BlockchainFactProvider {
  readonly name = "solana-rpc";
  readonly chain = "SOLANA" as const;
  private readonly rpcUrl: string | undefined;
  private readonly client: ProviderHttpClient;
  private requestId = 0;

  constructor(private readonly config: CashnetConfig, fetcher?: typeof fetch) {
    this.rpcUrl = config.providers.solana.rpcUrl;
    this.client = new ProviderHttpClient(config.providerRequest, fetcher);
  }

  async validateAddress(address: string): Promise<boolean> {
    // Solana addresses are Base58-encoded Ed25519 public keys (32-44 chars, no 0/O/I/l)
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  async getWalletProfile(address: string): Promise<ProviderResult<Wallet | null>> {
    const result = await this.rpcCall<{ value: RpcAccountInfo | null }>("getAccountInfo", [address, { encoding: "jsonParsed" }]);
    if (!result || !result.value) return { status: "SUCCESS", data: solanaWallet(address, 0, null) };
    return { status: "SUCCESS", data: solanaWallet(address, result.value.lamports, result) };
  }

  async getTransactions(address: string, page?: string): Promise<ProviderResult<NormalizedTransactionBundle[]>> {
    await solanaDelay();
    // Phase 1: get signatures for the address
    const sigParams: Record<string, unknown> = { limit: MAX_SIGNATURES };
    if (page) sigParams.before = page; // cursor-based pagination
    const signatures = await this.rpcCall<SignatureInfo[]>("getSignaturesForAddress", [address, sigParams]);
    if (!signatures || signatures.length === 0) return { status: "EMPTY", data: [] };

    // Phase 2: fetch each transaction (sequential to avoid rate limits)
    const bundles: NormalizedTransactionBundle[] = [];
    for (const sig of signatures) {
      await solanaDelay();
      const txResult = await this.rpcCall<{ slot: number; blockTime: number | null; transaction: ParsedTransaction; meta: ParsedTransactionMeta | null }>(
        "getTransaction", [sig.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
      );
      if (txResult) {
        bundles.push(solanaTransaction(txResult, sig.signature));
      }
    }

    const lastSig = signatures[signatures.length - 1];
    return {
      status: "SUCCESS",
      data: bundles,
      nextPage: signatures.length === MAX_SIGNATURES ? lastSig.signature : undefined,
    };
  }

  async getTokenTransfers(address: string, page?: string): Promise<ProviderResult<TokenTransfer[]>> {
    // SPL token transfers are extracted from parsed transaction instructions
    // We re-use the transaction fetching logic and extract token transfers
    const txResult = await this.getTransactions(address, page);
    if (txResult.status !== "SUCCESS") return { status: "EMPTY" as const, data: [] };
    const transfers: TokenTransfer[] = [];
    for (const bundle of txResult.data) {
      transfers.push(...bundle.tokenTransfers);
    }
    return {
      status: transfers.length > 0 ? "SUCCESS" : "EMPTY",
      data: transfers,
      nextPage: txResult.nextPage,
    };
  }

  async getInternalTransactions(_address: string, _page?: string): Promise<ProviderResult<NormalizedTransactionBundle[]>> {
    // Solana does not have "internal transactions" in the EVM sense.
    // Inner instructions are already extracted as part of getTransactions.
    return { status: "UNSUPPORTED_CAPABILITY", capability: "internalTransactions" };
  }

  async getTransaction(signature: string): Promise<ProviderResult<NormalizedTransactionBundle | null>> {
    await solanaDelay();
    const result = await this.rpcCall<{ slot: number; blockTime: number | null; transaction: ParsedTransaction; meta: ParsedTransactionMeta | null }>(
      "getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
    );
    if (!result) return { status: "EMPTY", data: null };
    return { status: "SUCCESS", data: solanaTransaction(result, signature) };
  }

  async getBlock(blockReference: string): Promise<ProviderResult<Record<string, unknown> | null>> {
    await solanaDelay();
    const slot = Number(blockReference);
    if (!Number.isFinite(slot)) return { status: "EMPTY", data: null };
    const result = await this.rpcCall<Record<string, unknown>>(
      "getBlock", [slot, { encoding: "jsonParsed", transactionDetails: "none", rewards: false, maxSupportedTransactionVersion: 0 }]
    );
    return result ? { status: "SUCCESS", data: result } : { status: "EMPTY", data: null };
  }

  private async rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
    const rpcUrl = this.rpcUrl;
    if (!rpcUrl) throw new UnavailableServiceError("Solana RPC is not configured. Set SOLANA_RPC_URL in the server environment.");
    this.requestId += 1;
    const body = JSON.stringify({ jsonrpc: "2.0", id: this.requestId, method, params });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = this.config.providers.solana.apiKey;
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    try {
      const json = await this.client.postJson(rpcUrl, JSON.parse(body), headers) as JsonRpcResponse;
      if (json.error) {
        if (json.error.code === -32429 || json.error.message?.toLowerCase().includes("rate")) {
          throw new RateLimitError("Solana RPC rate limit reached.");
        }
        throw new ProviderFailureError(`Solana RPC error: ${json.error.message}`);
      }
      return (json.result as T) ?? null;
    } catch (error) {
      if (error instanceof RateLimitError || error instanceof ProviderFailureError || error instanceof UnavailableServiceError) throw error;
      throw new UnavailableServiceError("Solana RPC network request failed.");
    }
  }
}
