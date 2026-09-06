import type { AuditEventRecord } from "./types";

export interface AuditRepository {
  append(input: Omit<AuditEventRecord, "id" | "createdAt">): Promise<AuditEventRecord>;
  listByCase(caseId: string): Promise<AuditEventRecord[]>;
}
