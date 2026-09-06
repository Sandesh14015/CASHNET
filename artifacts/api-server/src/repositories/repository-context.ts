import type { AuditRepository } from "./audit-repository";
import type { CaseRepository } from "./case-repository";
import type { EvidenceRepository } from "./evidence-repository";
import type { InvestigationRepository } from "./investigation-repository";
import type { UserRepository } from "./user-repository";
import type { WalletSubjectRepository } from "./wallet-subject-repository";
import type { BlockchainRepository } from "./blockchain-repository";
import type { GraphRepository } from "./graph-repository";
import type { IntelligenceRepository } from "./intelligence-repository";
import type { AnalyticsRepository } from "./analytics-repository";

export type RepositoryContext = {
  cases: CaseRepository;
  investigations: InvestigationRepository;
  walletSubjects: WalletSubjectRepository;
  evidence: EvidenceRepository;
  audit: AuditRepository;
  users: UserRepository;
  blockchain: BlockchainRepository;
  graph: GraphRepository;
  intelligence: IntelligenceRepository;
  analytics: AnalyticsRepository;
};

export interface TransactionCoordinator {
  transaction<T>(work: (repositories: RepositoryContext) => Promise<T>): Promise<T>;
}
