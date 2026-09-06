import type { Actor, InvestigationRecord } from "./types";

export interface InvestigationRepository {
  findAccessibleById(actor: Actor, investigationId: string): Promise<InvestigationRecord | null>;
  create(input: Omit<InvestigationRecord, "id" | "createdAt" | "updatedAt">): Promise<InvestigationRecord>;
  updateStatus(investigationId: string, status: InvestigationRecord["status"], authorizedBy?: string): Promise<InvestigationRecord | null>;
}
