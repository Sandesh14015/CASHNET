import type { CommunityPersistenceInput, CommunityRunRecord, DeFiInteractionPersistenceInput, ForensicReportPersistenceInput, ForensicReportRecord, GraphFeaturePersistenceInput, MevCandidatePersistenceInput, PersistedGraphFeature, PersistedRiskIndicator, RiskAnalysisRunRecord, RiskIndicatorPersistenceInput } from "./types";

/** Persistence port for Phase 6 analysis results. It is deliberately case and
 * investigation scoped; analytics services never issue SQL directly. */
export interface AnalyticsRepository {
  persistRiskAnalysis(input: { caseId: string; investigationId: string; actorId: string; chain: string; address: string; method: string; methodVersion: string; status: "COMPLETED" | "FAILED" | "PARTIAL"; totalRiskScore: number; indicators: RiskIndicatorPersistenceInput[] }): Promise<{ run: RiskAnalysisRunRecord; indicators: PersistedRiskIndicator[] }>;
  listRiskIndicators(caseId: string, investigationId: string, limit: number): Promise<PersistedRiskIndicator[]>;
  findRiskIndicator(caseId: string, investigationId: string, indicatorId: string): Promise<PersistedRiskIndicator | null>;
  upsertGraphFeatures(caseId: string, investigationId: string, values: GraphFeaturePersistenceInput[]): Promise<PersistedGraphFeature[]>;
  persistCommunities(input: { caseId: string; investigationId: string; actorId: string; chain: string; maxNodes: number; maxEdges: number; maxRuntimeMs: number; totalNodes: number; totalEdges: number; communities: CommunityPersistenceInput[] }): Promise<CommunityRunRecord>;
  persistDeFiInteractions(caseId: string, investigationId: string, values: DeFiInteractionPersistenceInput[]): Promise<number>;
  persistMevCandidates(caseId: string, investigationId: string, values: MevCandidatePersistenceInput[]): Promise<number>;
  createReport(caseId: string, investigationId: string | null, actorId: string, value: ForensicReportPersistenceInput): Promise<ForensicReportRecord>;
  findReport(caseId: string, reportId: string): Promise<ForensicReportRecord | null>;
}
