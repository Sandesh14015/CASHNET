import type { Actor, EvidenceRecord } from "./types";

export interface EvidenceRepository {
  findAccessibleById(actor: Actor, evidenceId: string): Promise<EvidenceRecord | null>;
  create(input: Omit<EvidenceRecord, "id" | "createdAt">): Promise<EvidenceRecord>;
}
