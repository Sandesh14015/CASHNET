import { UnavailableServiceError } from "../../errors/app-error";
import type { CashnetConfig } from "../../config";
import { ProviderHttpClient } from "./http-client";
import { bitcoinTransaction, bitcoinWallet } from "./normalizers";
import type { BlockchainFactProvider } from "./types";

export class EsploraBitcoinProvider implements BlockchainFactProvider {
  readonly name = "blockstream-esplora"; readonly chain = "BITCOIN" as const; private readonly client: ProviderHttpClient;
  constructor(private readonly config: CashnetConfig, fetcher?: typeof fetch) { this.client = new ProviderHttpClient(config.providerRequest, fetcher); }
  async validateAddress(address: string) { return /^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address); }
  async getWalletProfile(address: string) { const raw = await this.get(`/address/${encodeURIComponent(address)}`); return { status: "SUCCESS" as const, data: bitcoinWallet(address, raw) }; }
  async getTransactions(address: string, page?: string) { const suffix = page ? `/address/${encodeURIComponent(address)}/txs/chain/${encodeURIComponent(page)}` : `/address/${encodeURIComponent(address)}/txs`; const raw = await this.get(suffix); const values = Array.isArray(raw) ? raw : []; if (!values.length) return { status: "EMPTY" as const, data: [] }; const transactions = values.map(bitcoinTransaction); return { status: "SUCCESS" as const, data: transactions, nextPage: String((values.at(-1) as Record<string, unknown> | undefined)?.txid ?? "") || undefined }; }
  async getTokenTransfers(_address: string) { return { status: "UNSUPPORTED_CAPABILITY" as const, capability: "tokenTransfers" as const }; }
  async getInternalTransactions(_address: string) { return { status: "UNSUPPORTED_CAPABILITY" as const, capability: "internalTransactions" as const }; }
  async getTransaction(transactionHash: string) { const raw = await this.get(`/tx/${encodeURIComponent(transactionHash)}`); return { status: "SUCCESS" as const, data: bitcoinTransaction(raw) }; }
  async getBlock(blockReference: string) { const raw = await this.get(`/block/${encodeURIComponent(blockReference)}`); return { status: "SUCCESS" as const, data: raw as Record<string, unknown> }; }
  private async get(path: string) { const baseUrl = this.config.providers.bitcoinEsplora.baseUrl; if (!baseUrl) throw new UnavailableServiceError("Bitcoin Esplora is not configured. Set BITCOIN_ESPLORA_BASE_URL to an approved endpoint."); return this.client.getJson(`${baseUrl.replace(/\/$/, "")}${path}`); }
}
