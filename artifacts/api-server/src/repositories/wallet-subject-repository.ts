import type { WalletSubjectRecord } from "./types";

export interface WalletSubjectRepository {
  create(input: Omit<WalletSubjectRecord, "id" | "createdAt">): Promise<WalletSubjectRecord>;
}
