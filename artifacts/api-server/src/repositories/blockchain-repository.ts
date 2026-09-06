import type { NormalizedTransactionBundle } from "../services/blockchain/types";
import type { Wallet } from "../schemas/models";
import type { BitcoinTransactionRecord } from "./types";

export type PersistedBlockchainBundle = { caseId: string; wallet: Wallet; bundle: NormalizedTransactionBundle };
export interface BlockchainRepository {
  upsertWallet(caseId: string, wallet: Wallet): Promise<{ id: string }>;
  upsertBundle(input: PersistedBlockchainBundle): Promise<{ transactionId: string }>;
  findTransaction(chain: string, transactionHash: string): Promise<Record<string, unknown> | null>;
  listBitcoinTransactions(caseId: string, limit: number): Promise<BitcoinTransactionRecord[]>;
}
