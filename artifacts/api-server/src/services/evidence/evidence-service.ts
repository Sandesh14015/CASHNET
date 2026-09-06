import { NotFoundError, ValidationFailureError } from "../../errors/app-error";
import type { CaseAuthorizationService } from "../../auth/case-authorization-service";
import type { RepositoryContext } from "../../repositories/repository-context";
import type { Actor, EvidenceRecord } from "../../repositories/types";

const evidenceTypes = new Set(["BLOCKCHAIN_FACT", "TRANSACTION", "ADDRESS_LABEL", "ENTITY_MATCH", "VASP_MATCH", "GRAPH_RELATION", "RISK_INDICATOR", "DOCUMENT", "OSINT", "OTHER"]);
const sourceTypes = new Set(["SYNTHETIC", "API", "RPC", "DATASET", "INFERENCE", "OTHER", "USER_PROVIDED"]);

export class EvidenceService {
  constructor(private readonly repositories: RepositoryContext, private readonly authorization: CaseAuthorizationService) {}
  async create(actor: Actor, input: Omit<EvidenceRecord, "id" | "createdAt" | "createdBy">, requestId?: string) {
    if (!input.caseId) throw new ValidationFailureError("Evidence requires a case ID.");
    await this.authorization.requireCaseAccess(actor, input.caseId, "EVIDENCE_CREATE", requestId);
    if (!evidenceTypes.has(input.evidenceType) || !sourceTypes.has(input.sourceType)) throw new ValidationFailureError("Unsupported evidence or source type.");
    if (input.confidence != null && (input.confidence < 0 || input.confidence > 1)) throw new ValidationFailureError("Confidence must be between zero and one.");
    const evidence = await this.repositories.evidence.create({ ...input, createdBy: actor.id });
    await this.repositories.audit.append({ caseId: input.caseId, actorId: actor.id, action: "EVIDENCE_CREATED", resourceType: "evidence", resourceId: evidence.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { evidenceType: evidence.evidenceType, sourceType: evidence.sourceType } });
    return evidence;
  }
  async get(actor: Actor, evidenceId: string, requestId?: string) {
    await this.authorization.requirePermission(actor, "EVIDENCE_READ", requestId);
    const evidence = await this.repositories.evidence.findAccessibleById(actor, evidenceId);
    if (!evidence || !evidence.caseId) throw new NotFoundError("Evidence not found.");
    await this.authorization.requireCaseAccess(actor, evidence.caseId, "EVIDENCE_READ", requestId);
    await this.repositories.audit.append({ caseId: evidence.caseId, actorId: actor.id, action: "EVIDENCE_VIEWED", resourceType: "evidence", resourceId: evidence.id, requestId: requestId ?? null, result: "SUCCESS", metadata: {} });
    return evidence;
  }
}
