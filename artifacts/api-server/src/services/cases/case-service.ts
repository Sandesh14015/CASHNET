import { NotFoundError, ValidationFailureError } from "../../errors/app-error";
import type { RepositoryContext, TransactionCoordinator } from "../../repositories/repository-context";
import type { Actor, CaseRecord, CaseStatus } from "../../repositories/types";
import type { CaseAuthorizationService } from "../../auth/case-authorization-service";

const caseTransitions: Record<CaseStatus, CaseStatus[]> = {
  OPEN: ["IN_PROGRESS", "ON_HOLD", "CLOSED"], IN_PROGRESS: ["ON_HOLD", "CLOSED"], ON_HOLD: ["IN_PROGRESS", "CLOSED"], CLOSED: ["ARCHIVED"], ARCHIVED: [],
};

export class CaseService {
  constructor(private readonly repositories: RepositoryContext, private readonly transactions: TransactionCoordinator, private readonly authorization: CaseAuthorizationService) {}
  async create(actor: Actor, input: { caseNumber: string; title: string; description: string; fraudType: string; reportedAmount: string; priority?: string }, requestId?: string): Promise<CaseRecord> {
    await this.authorization.requirePermission(actor, "CASE_CREATE", requestId);
    return this.transactions.transaction(async (repositories) => {
      const record = await repositories.cases.create({ ...input, priority: input.priority ?? "MEDIUM", status: "OPEN", investigationAuthorizationStatus: "PENDING", createdBy: actor.id, assignedTo: actor.id });
      await repositories.cases.addMember(record.id, actor.id);
      await repositories.audit.append({ caseId: record.id, actorId: actor.id, action: "CASE_CREATED", resourceType: "case", resourceId: record.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { caseNumber: record.caseNumber } });
      return record;
    });
  }
  async list(actor: Actor, requestId?: string) { await this.authorization.requirePermission(actor, "CASE_READ", requestId); return this.repositories.cases.listAccessible(actor); }
  async get(actor: Actor, caseId: string, requestId?: string) {
    const record = await this.authorization.requireCaseAccess(actor, caseId, "CASE_READ", requestId);
    await this.repositories.audit.append({ caseId, actorId: actor.id, action: "CASE_VIEWED", resourceType: "case", resourceId: caseId, requestId: requestId ?? null, result: "SUCCESS", metadata: {} });
    return record;
  }
  async update(actor: Actor, caseId: string, patch: { title?: string; description?: string; priority?: string; status?: CaseStatus; assignedTo?: string | null; investigationAuthorizationStatus?: "PENDING" | "APPROVED" | "REJECTED" }, requestId?: string) {
    const current = await this.authorization.requireCaseAccess(actor, caseId, patch.status === "CLOSED" || patch.status === "ARCHIVED" ? "CASE_CLOSE" : "CASE_UPDATE", requestId);
    if (patch.status && !caseTransitions[current.status].includes(patch.status)) throw new ValidationFailureError(`Invalid case transition from ${current.status} to ${patch.status}.`);
    if (patch.assignedTo) await this.authorization.requirePermission(actor, "CASE_ASSIGN", requestId);
    if (patch.investigationAuthorizationStatus) await this.authorization.requirePermission(actor, "CASE_AUTHORIZE", requestId);
    return this.transactions.transaction(async (repositories) => {
      if (patch.assignedTo) await repositories.cases.addMember(caseId, patch.assignedTo);
      const updatePatch = patch.status === "CLOSED"
        ? { ...patch, closedAt: new Date().toISOString() }
        : patch;
      const record = await repositories.cases.update(caseId, updatePatch);
      if (!record) throw new NotFoundError("Case not found.");
      const action = patch.assignedTo ? "CASE_ASSIGNED" : patch.investigationAuthorizationStatus ? "CASE_AUTHORIZATION_UPDATED" : "CASE_UPDATED";
      await repositories.audit.append({ caseId, actorId: actor.id, action, resourceType: "case", resourceId: caseId, requestId: requestId ?? null, result: "SUCCESS", metadata: { changed: Object.keys(patch) } });
      return record;
    });
  }
}
