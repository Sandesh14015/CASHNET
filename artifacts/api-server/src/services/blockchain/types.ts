import type { BlockchainTransaction, ContractInteraction, TokenTransfer, Wallet } from "../../schemas/models";
import type { SupportedChain } from "./provider";

export type ProviderCapability = "walletProfile" | "transactions" | "transaction" | "tokenTransfers" | "internalTransactions" | "block";
export type ProviderResult<T> = { status: "SUCCESS"; data: T; nextPage?: string } | { status: "EMPTY"; data: T } | { status: "UNSUPPORTED_CAPABILITY"; capability: ProviderCapability };
export type NormalizedTransactionBundle = { transaction: BlockchainTransaction; tokenTransfers: TokenTransfer[]; contractInteractions: ContractInteraction[] };

/** The Phase 3 contract is deliberately distinct from the Phase 1 synthetic interface. */
export interface BlockchainFactProvider {
  readonly name: string;
  readonly chain: SupportedChain;
  validateAddress(address: string): Promise<boolean>;
  getWalletProfile(address: string): Promise<ProviderResult<Wallet | null>>;
  getTransactions(address: string, page?: string): Promise<ProviderResult<NormalizedTransactionBundle[]>>;
  getTransaction(transactionHash: string): Promise<ProviderResult<NormalizedTransactionBundle | null>>;
  getTokenTransfers(address: string, page?: string): Promise<ProviderResult<TokenTransfer[]>>;
  getInternalTransactions(address: string, page?: string): Promise<ProviderResult<NormalizedTransactionBundle[]>>;
  getBlock(blockReference: string): Promise<ProviderResult<Record<string, unknown> | null>>;
}
