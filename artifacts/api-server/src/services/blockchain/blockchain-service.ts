import { NotFoundError, UnsupportedCapabilityError, ValidationFailureError } from "../../errors/app-error";
import type { Actor } from "../../repositories/types";
import { ProviderRouter } from "./provider-router";
import type { SupportedChain } from "./provider";

export class BlockchainService {
  constructor(private readonly providers: ProviderRouter) {}
  async wallet(actor: Actor, chain: SupportedChain, address: string) {
    void actor; const provider = this.providers.forChain(chain);
    if (!await provider.validateAddress(address)) throw new ValidationFailureError("Invalid address for the requested chain.");
    const profile = await provider.getWalletProfile(address); const transactions = await provider.getTransactions(address); const tokenTransfers = await provider.getTokenTransfers(address); const internalTransactions = await provider.getInternalTransactions(address);
    return { provider: provider.name, wallet: profile.status === "UNSUPPORTED_CAPABILITY" ? null : profile.data, transactions: transactions.status === "UNSUPPORTED_CAPABILITY" ? [] : transactions.data, tokenTransfers: tokenTransfers.status === "UNSUPPORTED_CAPABILITY" ? [] : tokenTransfers.data, internalTransactions: internalTransactions.status === "UNSUPPORTED_CAPABILITY" ? [] : internalTransactions.data, capabilities: { tokenTransfers: tokenTransfers.status !== "UNSUPPORTED_CAPABILITY", internalTransactions: internalTransactions.status !== "UNSUPPORTED_CAPABILITY" } };
  }
  async transaction(actor: Actor, chain: SupportedChain, transactionHash: string) {
    void actor; const provider = this.providers.forChain(chain); const result = await provider.getTransaction(transactionHash);
    if (result.status === "UNSUPPORTED_CAPABILITY") throw new UnsupportedCapabilityError(undefined, { chain, capability: result.capability });
    if (!result.data) throw new NotFoundError("Transaction not found.");
    return { provider: provider.name, ...result.data };
  }
}
