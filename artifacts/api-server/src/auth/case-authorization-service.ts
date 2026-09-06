import { AuthorizationFailureError, NotFoundError } from "../errors/app-error";
import type { AuditRepository } from "../repositories/audit-repository";
import type { CaseRepository } from "../repositories/case-repository";
import type { Actor, CaseRecord, PermissionCode } from "../repositories/types";

export class CaseAuthorizationService {
  constructor(private readonly cases: CaseRepository, private readonly audit: AuditRepository) {}

  async requirePermission(actor: Actor, permission: PermissionCode, requestId?: string): Promise<void> {
    if (actor.roles.includes("ADMIN") || actor.permissions.includes(permission)) return;
    await this.audit.append({ caseId: null, actorId: actor.id, action: "UNAUTHORIZED_ACCESS_ATTEMPT", resourceType: "permission", resourceId: permission, requestId: requestId ?? null, result: "DENIED", metadata: { permission } });
    throw new AuthorizationFailureError("You do not have permission to perform this action.");
  }

  async requireCaseAccess(actor: Actor, caseId: string, permission: PermissionCode, requestId?: string): Promise<CaseRecord> {
    await this.requirePermission(actor, permission, requestId);
    const caseRecord = await this.cases.findAccessibleById(actor, caseId);
    if (caseRecord) return caseRecord;
    await this.audit.append({ caseId: null, actorId: actor.id, action: "UNAUTHORIZED_ACCESS_ATTEMPT", resourceType: "case", resourceId: caseId, requestId: requestId ?? null, result: "DENIED", metadata: { permission, reason: "missing_or_inaccessible" } });
    throw new NotFoundError("Case not found.");
  }
}
