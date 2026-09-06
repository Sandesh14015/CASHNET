import { NotFoundError, ValidationFailureError } from "../../errors/app-error";
import type { CaseAuthorizationService } from "../../auth/case-authorization-service";
import type { RepositoryContext, TransactionCoordinator } from "../../repositories/repository-context";
import type { Actor, InvestigationRecord, InvestigationStatus, WalletSubjectRecord } from "../../repositories/types";

const investigationTransitions: Record<InvestigationStatus, InvestigationStatus[]> = {
  CREATED: ["AUTHORIZED", "CANCELLED"], AUTHORIZED: ["RUNNING", "CANCELLED"], RUNNING: ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"], COMPLETED: [], PARTIAL: [], FAILED: [], CANCELLED: [],
};
const validChains = new Set(["BITCOIN", "ETHEREUM", "TRON", "BNB_CHAIN", "POLYGON", "SOLANA", "OTHER"]);

export class PersistentInvestigationService {
  constructor(private readonly repositories: RepositoryContext, private readonly transactions: TransactionCoordinator, private readonly authorization: CaseAuthorizationService) {}
  async create(actor: Actor, input: { caseId: string; chain?: string; walletAddress?: string; investigationDepth?: number; startTime?: string; endTime?: string }, requestId?: string): Promise<InvestigationRecord> {
    const caseRecord = await this.authorization.requireCaseAccess(actor, input.caseId, "INVESTIGATION_CREATE", requestId);
    if (["CLOSED", "ARCHIVED"].includes(caseRecord.status)) throw new ValidationFailureError("Investigations cannot be created for closed or archived cases.");
    if (input.chain && !validChains.has(input.chain)) throw new ValidationFailureError("Unsupported chain.");
    if (input.walletAddress && !isWalletAddress(input.walletAddress)) throw new ValidationFailureError("Invalid wallet address.");
    const depth = input.investigationDepth ?? 1;
    if (!Number.isInteger(depth) || depth < 1 || depth > 10) throw new ValidationFailureError("Investigation depth must be between 1 and 10.");
    return this.transactions.transaction(async (repositories) => {
      const investigation = await repositories.investigations.create({ caseId: input.caseId, status: "CREATED", chain: input.chain ?? null, walletAddress: input.walletAddress ?? null, investigationDepth: depth, startTime: input.startTime ?? null, endTime: input.endTime ?? null, createdBy: actor.id });
      await repositories.audit.append({ caseId: input.caseId, actorId: actor.id, action: "INVESTIGATION_CREATED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { dataMode: "persistent-no-collection" } });
      return investigation;
    });
  }
  async createWalletSubject(actor: Actor, input: { caseId: string; chain: string; walletAddress: string; label?: WalletSubjectRecord["label"]; investigationDepth?: number; startTime?: string; endTime?: string }, requestId?: string) {
    const caseRecord = await this.authorization.requireCaseAccess(actor, input.caseId, "INVESTIGATION_CREATE", requestId);
    if (["CLOSED", "ARCHIVED"].includes(caseRecord.status)) throw new ValidationFailureError("Investigations cannot be created for closed or archived cases.");
    if (!validChains.has(input.chain) || !isWalletAddress(input.walletAddress)) throw new ValidationFailureError("Valid chain and wallet address are required.");
    const depth = input.investigationDepth ?? 1;
    if (!Number.isInteger(depth) || depth < 1 || depth > 10) throw new ValidationFailureError("Investigation depth must be between 1 and 10.");
    return this.transactions.transaction(async (repositories) => {
      const investigation = await repositories.investigations.create({ caseId: input.caseId, status: "CREATED", chain: input.chain, walletAddress: input.walletAddress, investigationDepth: depth, startTime: input.startTime ?? null, endTime: input.endTime ?? null, createdBy: actor.id });
      const subject = await repositories.walletSubjects.create({ caseId: input.caseId, investigationId: investigation.id, chain: input.chain, walletAddress: input.walletAddress, label: input.label ?? "REPORTED" });
      await repositories.audit.append({ caseId: input.caseId, actorId: actor.id, action: "INVESTIGATION_CREATED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { walletSubjectId: subject.id, chain: input.chain, dataMode: "persistent-no-collection" } });
      return { investigation, walletSubject: subject };
    });
  }
  async get(actor: Actor, investigationId: string, requestId?: string) {
    await this.authorization.requirePermission(actor, "INVESTIGATION_READ", requestId);
    const investigation = await this.repositories.investigations.findAccessibleById(actor, investigationId);
    if (!investigation) throw new NotFoundError("Investigation not found.");
    await this.authorization.requireCaseAccess(actor, investigation.caseId, "INVESTIGATION_READ", requestId);
    await this.repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "INVESTIGATION_VIEWED", resourceType: "investigation", resourceId: investigationId, requestId: requestId ?? null, result: "SUCCESS", metadata: {} });
    return investigation;
  }
  async transition(actor: Actor, investigationId: string, status: InvestigationStatus, requestId?: string) {
    const existing = await this.get(actor, investigationId, requestId);
    await this.authorization.requireCaseAccess(actor, existing.caseId, "INVESTIGATION_EXECUTE", requestId);
    if (!investigationTransitions[existing.status].includes(status)) throw new ValidationFailureError(`Invalid investigation transition from ${existing.status} to ${status}.`);
    if (status === "AUTHORIZED") {
      const caseRecord = await this.authorization.requireCaseAccess(actor, existing.caseId, "INVESTIGATION_EXECUTE", requestId);
      if (caseRecord.investigationAuthorizationStatus !== "APPROVED") throw new ValidationFailureError("The case has not been approved for investigation execution.");
    }
    const updated = await this.transactions.transaction(async (repositories) => {
      const record = await repositories.investigations.updateStatus(investigationId, status, status === "AUTHORIZED" ? actor.id : undefined);
      if (!record) throw new NotFoundError("Investigation not found.");
      await repositories.audit.append({ caseId: record.caseId, actorId: actor.id, action: status === "AUTHORIZED" ? "INVESTIGATION_AUTHORIZED" : "INVESTIGATION_UPDATED", resourceType: "investigation", resourceId: investigationId, requestId: requestId ?? null, result: "SUCCESS", metadata: { status } });
      return record;
    });
    return updated;
  }
}

function isWalletAddress(address: string) { return address.trim().length >= 3 && address.trim().length <= 256 && !/(private|seed|mnemonic)/i.test(address); }
