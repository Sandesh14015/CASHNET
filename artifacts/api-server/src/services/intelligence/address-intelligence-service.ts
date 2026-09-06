import { NotFoundError } from "../../errors/app-error";
import type { CaseAuthorizationService } from "../../auth/case-authorization-service";
import type { RepositoryContext, TransactionCoordinator } from "../../repositories/repository-context";
import type { Actor, AddressIntelligenceObservationRecord } from "../../repositories/types";
import type { AddressIntelligenceProvider } from "./provider-interfaces";

export type AddressIntelligenceResult = { status: "SUCCESS" | "NOT_CONFIGURED" | "UNAVAILABLE"; observations: AddressIntelligenceObservationRecord[]; conflicts: Array<{ entityNames: string[]; sources: string[] }> };
export class AddressIntelligenceService {
  constructor(private readonly repositories: RepositoryContext, private readonly transactions: TransactionCoordinator, private readonly authorization: CaseAuthorizationService, private readonly provider: AddressIntelligenceProvider) {}
  async lookup(actor: Actor, investigationId: string, chain: string, address: string, requestId?: string): Promise<AddressIntelligenceResult> {
    const investigation = await this.repositories.investigations.findAccessibleById(actor, investigationId);
    if (!investigation) throw new NotFoundError("Investigation not found.");
    await this.authorization.requireCaseAccess(actor, investigation.caseId, "INTELLIGENCE_READ", requestId);
    let observations = await this.repositories.intelligence.listAddressObservations(investigation.caseId, investigationId, chain, address);
    let status: AddressIntelligenceResult["status"] = "SUCCESS";
    if (observations.length === 0) {
      await this.authorization.requirePermission(actor, "INTELLIGENCE_EXECUTE", requestId);
      const providerResult = await this.provider.lookup({ chain, address }); status = providerResult.status;
      if (providerResult.observations.length) observations = await this.transactions.transaction((repositories) => repositories.intelligence.upsertAddressObservations(investigation.caseId, investigationId, providerResult.observations));
    }
    const conflicts = conflictsFor(observations);
    await this.transactions.transaction(async (repositories) => { await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "ADDRESS_INTELLIGENCE_LOOKUP", resourceType: "investigation", resourceId: investigationId, requestId: requestId ?? null, result: "SUCCESS", metadata: { chain, address, observationCount: observations.length, providerStatus: status, conflictCount: conflicts.length } }); if (observations.length) await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "ADDRESS_INTELLIGENCE_IMPORTED", resourceType: "address_intelligence", resourceId: `${chain}:${address}`, requestId: requestId ?? null, result: "SUCCESS", metadata: { observationCount: observations.length, sourceNames: [...new Set(observations.map((value) => value.source))].sort() } }); });
    return { status, observations, conflicts };
  }
}
export function conflictsFor(observations: AddressIntelligenceObservationRecord[]) { const entityNames = [...new Set(observations.map((value) => value.entityName ?? value.label).filter((value): value is string => Boolean(value)).map((value) => value.trim()))].sort(); return entityNames.length > 1 ? [{ entityNames, sources: [...new Set(observations.map((value) => value.source))].sort() }] : []; }
