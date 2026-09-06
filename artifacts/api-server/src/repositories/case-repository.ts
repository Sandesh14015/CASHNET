import type { Actor, CaseRecord, CaseStatus } from "./types";

/** Persistence port. A PostgreSQL/Drizzle implementation replaces synthetic fixtures in Phase 2. */
export interface CaseRepository {
  findAccessibleById(actor: Actor, caseId: string): Promise<CaseRecord | null>;
  listAccessible(actor: Actor): Promise<CaseRecord[]>;
  create(input: Omit<CaseRecord, "id" | "createdAt" | "updatedAt" | "closedAt">): Promise<CaseRecord>;
  update(caseId: string, patch: { title?: string; description?: string; priority?: string; status?: CaseStatus; assignedTo?: string | null; investigationAuthorizationStatus?: "PENDING" | "APPROVED" | "REJECTED"; closedAt?: string | null }): Promise<CaseRecord | null>;
  addMember(caseId: string, userId: string): Promise<void>;
  isMember(caseId: string, userId: string): Promise<boolean>;
}
