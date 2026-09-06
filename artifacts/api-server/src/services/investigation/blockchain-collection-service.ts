import { NotFoundError, ValidationFailureError } from "../../errors/app-error";
import type { CaseAuthorizationService } from "../../auth/case-authorization-service";
import type { RepositoryContext, TransactionCoordinator } from "../../repositories/repository-context";
import type { Actor } from "../../repositories/types";
import { ProviderRouter } from "../blockchain/provider-router";
import type { SupportedChain } from "../blockchain/provider";
import type { NormalizedTransactionBundle } from "../blockchain/types";

export class BlockchainCollectionService {
  constructor(private readonly repositories: RepositoryContext, private readonly transactions: TransactionCoordinator, private readonly authorization: CaseAuthorizationService, private readonly providers: ProviderRouter) {}
  async collect(actor: Actor, investigationId: string, requestId?: string) {
    const investigation = await this.repositories.investigations.findAccessibleById(actor, investigationId);
    if (!investigation) throw new NotFoundError("Investigation not found.");
    await this.authorization.requireCaseAccess(actor, investigation.caseId, "INVESTIGATION_EXECUTE", requestId);
    if (investigation.status !== "AUTHORIZED" && investigation.status !== "RUNNING") throw new ValidationFailureError("Only authorized investigations can collect provider data.");
    if (!investigation.chain || !investigation.walletAddress) throw new ValidationFailureError("The investigation needs a chain and wallet address before collection.");
    const provider = this.providers.forChain(investigation.chain as SupportedChain);
    if (!await provider.validateAddress(investigation.walletAddress)) throw new ValidationFailureError("The investigation wallet address is invalid for its chain.");
    if (investigation.status === "AUTHORIZED") await this.transactions.transaction(async (repositories) => { await repositories.investigations.updateStatus(investigation.id, "RUNNING"); await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "INVESTIGATION_COLLECTION_STARTED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { provider: provider.name, chain: investigation.chain } }); });
    try {
      const profile = await provider.getWalletProfile(investigation.walletAddress);
      const transactions = await provider.getTransactions(investigation.walletAddress);
      const tokenTransfers = await provider.getTokenTransfers(investigation.walletAddress);
      const internal = await provider.getInternalTransactions(investigation.walletAddress);
      if (profile.status === "UNSUPPORTED_CAPABILITY" || !profile.data) throw new ValidationFailureError("The selected provider cannot retrieve a wallet profile.");
      const bundles: NormalizedTransactionBundle[] = [];
      if (transactions.status !== "UNSUPPORTED_CAPABILITY") bundles.push(...transactions.data);
      if (internal.status !== "UNSUPPORTED_CAPABILITY") bundles.push(...internal.data);
      const transfers = tokenTransfers.status === "UNSUPPORTED_CAPABILITY" ? [] : tokenTransfers.data;
      const indexed = new Map(bundles.map((bundle) => [bundle.transaction.transactionHash, bundle]));
      for (const transfer of transfers) {
        let existing = indexed.get(transfer.transactionHash);
        if (!existing) {
          const transaction = await provider.getTransaction(transfer.transactionHash);
          if (transaction.status === "SUCCESS" && transaction.data) {
            existing = transaction.data;
            indexed.set(transfer.transactionHash, existing);
          }
        }
        // A transfer is persisted only with the provider transaction that proves it.
        // This avoids creating an invented parent transaction merely to satisfy a FK.
        if (existing) existing.tokenTransfers.push(transfer);
      }
      await this.transactions.transaction(async (repositories) => {
        for (const bundle of indexed.values()) await repositories.blockchain.upsertBundle({ caseId: investigation.caseId, wallet: profile.data!, bundle });
        await repositories.investigations.updateStatus(investigation.id, "COMPLETED");
        await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "INVESTIGATION_COLLECTION_COMPLETED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { provider: provider.name, transactionCount: indexed.size, tokenTransferCount: transfers.length } });
      });
      return { investigationId, status: "COMPLETED", provider: provider.name, transactionCount: indexed.size, tokenTransferCount: transfers.length };
    } catch (error) {
      await this.transactions.transaction(async (repositories) => { await repositories.investigations.updateStatus(investigation.id, "FAILED"); await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "INVESTIGATION_COLLECTION_FAILED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "FAILURE", metadata: { provider: provider.name, reason: error instanceof Error ? error.name : "unknown" } }); });
      throw error;
    }
  }
}
