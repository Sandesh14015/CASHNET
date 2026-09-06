import type { BlockchainTransaction, ContractInteraction, TokenTransfer, Wallet } from "../../schemas/models";
import { ChainSchema, ProvenanceSchema, WalletSchema } from "../../schemas/models";

export type SupportedChain = typeof ChainSchema._type;

export interface BlockchainProvider {
  readonly name: string;
  validateAddress(address: string, chain: SupportedChain): Promise<boolean>;
  getWalletProfile(address: string, chain: SupportedChain): Promise<Wallet | null>;
  getTransactions(address: string, chain: SupportedChain): Promise<BlockchainTransaction[]>;
  getTokenTransfers(address: string, chain: SupportedChain): Promise<TokenTransfer[]>;
  getInternalTransactions(address: string, chain: SupportedChain): Promise<BlockchainTransaction[]>;
  getTransaction(transactionHash: string, chain: SupportedChain): Promise<BlockchainTransaction | null>;
  getBlock(blockReference: string, chain: SupportedChain): Promise<{ chain: SupportedChain; blockReference: string; provenance: typeof ProvenanceSchema._type } | null>;
}

const syntheticProvenance = () => ({ sourceType: "SYNTHETIC" as const, provider: "cashnet-synthetic", sourceReference: "cashnet://synthetic-fixture", retrievedAt: new Date().toISOString(), method: "fixture", confidence: 1 });

export class SyntheticBlockchainProvider implements BlockchainProvider {
  readonly name = "cashnet-synthetic";

  async validateAddress(address: string, _chain: SupportedChain): Promise<boolean> { return address.trim().length > 0; }
  async getWalletProfile(address: string, chain: SupportedChain): Promise<Wallet> {
    return WalletSchema.parse({ id: `synthetic:${chain}:${address}`, address, chain, createdAt: new Date().toISOString(), provenance: syntheticProvenance() });
  }
  async getTransactions(_address: string, _chain: SupportedChain): Promise<BlockchainTransaction[]> { return []; }
  async getTokenTransfers(_address: string, _chain: SupportedChain): Promise<TokenTransfer[]> { return []; }
  async getInternalTransactions(_address: string, _chain: SupportedChain): Promise<BlockchainTransaction[]> { return []; }
  async getTransaction(_transactionHash: string, _chain: SupportedChain): Promise<BlockchainTransaction | null> { return null; }
  async getBlock(blockReference: string, chain: SupportedChain) { return { chain, blockReference, provenance: ProvenanceSchema.parse(syntheticProvenance()) }; }
}
