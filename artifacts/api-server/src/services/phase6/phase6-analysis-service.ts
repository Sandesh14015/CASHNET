import { CaseAuthorizationService } from "../../auth/case-authorization-service";
import { NotFoundError } from "../../errors/app-error";
import type { Actor, GraphFeaturePersistenceInput } from "../../repositories/types";
import type { RepositoryContext, TransactionCoordinator } from "../../repositories/repository-context";
import { AMLRiskIndicatorService } from "../risk/aml-risk-indicator-service";
import { RiskTypologyFramework } from "../risk/typology-framework";
import { GraphFeatureService } from "../graph/graph-feature-service";
import { CommunityDetectionService } from "../graph/community-detection-service";
import { DeFiInteractionService } from "../defi/defi-interaction-service";
import { MEVDetectionService } from "../defi/mev-detection-service";
import { ReportGenerator, type ReportType } from "../reporting/report-generator";

const MAX_GRAPH_EDGES = 10_000;
const MAX_COMMUNITY_NODES = 10_000;
const MAX_RUNTIME_MS = 5_000;

/** Orchestrates only stored, case-scoped facts. It never re-queries providers. */
export class Phase6AnalysisService {
  private readonly risk = new AMLRiskIndicatorService();
  private readonly typologies = new RiskTypologyFramework();
  private readonly features = new GraphFeatureService();
  private readonly communities = new CommunityDetectionService();
  private readonly defi = new DeFiInteractionService();
  private readonly mev = new MEVDetectionService();
  private readonly reports = new ReportGenerator();
  constructor(private readonly repositories: RepositoryContext, private readonly transactions: TransactionCoordinator, private readonly authorization: CaseAuthorizationService) {}

  private async accessible(actor: Actor, investigationId: string, permission: Parameters<CaseAuthorizationService["requireCaseAccess"]>[2], requestId?: string) {
    const investigation = await this.repositories.investigations.findAccessibleById(actor, investigationId);
    if (!investigation) throw new NotFoundError("Investigation not found.");
    await this.authorization.requireCaseAccess(actor, investigation.caseId, permission, requestId);
    if (!investigation.chain || !investigation.walletAddress) throw new NotFoundError("Investigation does not have a chain-qualified wallet subject.");
    return investigation;
  }

  async analyzeRisk(actor: Actor, investigationId: string, requestId?: string) {
    const investigation = await this.accessible(actor, investigationId, "RISK_ANALYZE", requestId);
    const analysis = await this.risk.analyzeAddress(this.repositories, actor, investigation.caseId, investigation.id, investigation.chain!, investigation.walletAddress!);
    const persisted = await this.transactions.transaction(async (repositories) => {
      const value = await repositories.analytics.persistRiskAnalysis({ caseId: investigation.caseId, investigationId: investigation.id, actorId: actor.id, chain: analysis.chain, address: analysis.address, method: analysis.method, methodVersion: analysis.methodVersion, status: analysis.status, totalRiskScore: analysis.totalScore, indicators: analysis.indicators });
      await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "RISK_ANALYSIS_EXECUTED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { runId: value.run.id, indicatorCount: value.indicators.length, scoreSemantics: "HEURISTIC_SCORE_NOT_PROBABILITY", method: analysis.method, methodVersion: analysis.methodVersion } });
      return value;
    });
    return { ...persisted, typologies: this.typologies.evaluateIndicators(analysis.indicators), scoreSemantics: "HEURISTIC_SCORE_NOT_PROBABILITY" };
  }
  async listRisk(actor: Actor, investigationId: string, limit = 100, requestId?: string) {
    const investigation = await this.accessible(actor, investigationId, "RISK_READ", requestId);
    return this.repositories.analytics.listRiskIndicators(investigation.caseId, investigation.id, Math.min(Math.max(limit, 1), 250));
  }
  async getRisk(actor: Actor, investigationId: string, indicatorId: string, requestId?: string) {
    const investigation = await this.accessible(actor, investigationId, "RISK_READ", requestId);
    const result = await this.repositories.analytics.findRiskIndicator(investigation.caseId, investigation.id, indicatorId);
    if (!result) throw new NotFoundError("Risk indicator not found.");
    return result;
  }
  async computeFeatures(actor: Actor, investigationId: string, maxEdges = MAX_GRAPH_EDGES, requestId?: string) {
    const investigation = await this.accessible(actor, investigationId, "GRAPH_FEATURES", requestId);
    const computed = await this.features.computeFeatures(this.repositories, investigation.caseId, investigation.chain!, investigation.walletAddress!, Math.min(Math.max(maxEdges, 1), MAX_GRAPH_EDGES));
    const records = await this.transactions.transaction(async (repositories) => {
      const values: GraphFeaturePersistenceInput[] = computed.features;
      const stored = await repositories.analytics.upsertGraphFeatures(investigation.caseId, investigation.id, values);
      await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "GRAPH_FEATURES_COMPUTED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { featureCount: stored.length, edgeCount: computed.edgeCount, maxEdges: Math.min(Math.max(maxEdges, 1), MAX_GRAPH_EDGES), method: computed.method, methodVersion: computed.methodVersion } });
      return stored;
    });
    return { ...computed, features: records, maxEdges: Math.min(Math.max(maxEdges, 1), MAX_GRAPH_EDGES) };
  }
  async detectCommunities(actor: Actor, investigationId: string, options: { maxNodes?: number; maxEdges?: number; maxRuntimeMs?: number; maxCommunities?: number }, requestId?: string) {
    const investigation = await this.accessible(actor, investigationId, "GRAPH_FEATURES", requestId);
    const maxEdges = Math.min(Math.max(options.maxEdges ?? MAX_GRAPH_EDGES, 1), MAX_GRAPH_EDGES);
    const maxNodes = Math.min(Math.max(options.maxNodes ?? MAX_COMMUNITY_NODES, 1), MAX_COMMUNITY_NODES);
    const maxRuntimeMs = Math.min(Math.max(options.maxRuntimeMs ?? MAX_RUNTIME_MS, 100), MAX_RUNTIME_MS);
    const result = this.communities.detectCommunities(await this.repositories.graph.listByCaseAndChain(investigation.caseId, investigation.chain!, maxEdges), { maxNodes, maxEdges, maxExecutionMs: maxRuntimeMs, maxCommunities: Math.min(Math.max(options.maxCommunities ?? 100, 1), 500) });
    const run = await this.transactions.transaction(async (repositories) => {
      const persisted = await repositories.analytics.persistCommunities({ caseId: investigation.caseId, investigationId: investigation.id, actorId: actor.id, chain: investigation.chain!, maxNodes, maxEdges, maxRuntimeMs, totalNodes: result.totalNodes, totalEdges: result.totalEdges, communities: result.communities.map((value) => ({ communityKey: value.communityId, members: value.members, memberCount: value.memberCount, edgeCount: value.edgeCount, chains: value.chains, confidence: value.confidence, explanation: value.explanation, method: value.method, methodVersion: value.methodVersion })) });
      await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "GRAPH_COMMUNITIES_DETECTED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { runId: persisted.id, totalNodes: result.totalNodes, totalEdges: result.totalEdges, communityCount: result.communities.length, maxNodes, maxEdges, maxRuntimeMs } });
      return persisted;
    });
    return { run, ...result, limits: { maxNodes, maxEdges, maxRuntimeMs } };
  }
  async analyzeDefi(actor: Actor, investigationId: string, requestId?: string) {
    const investigation = await this.accessible(actor, investigationId, "DEFI_ANALYZE", requestId);
    const edges = await this.repositories.graph.listByCaseAndChain(investigation.caseId, investigation.chain!, MAX_GRAPH_EDGES);
    const interactions = this.defi.identifyInteractions(edges);
    const mev = this.mev.analyze(edges);
    await this.transactions.transaction(async (repositories) => {
      await repositories.analytics.persistDeFiInteractions(investigation.caseId, investigation.id, interactions);
      await repositories.analytics.persistMevCandidates(investigation.caseId, investigation.id, mev.candidates.map((value) => ({ chain: value.chain, mevType: value.mevType, confidenceLevel: value.confidenceLevel, frontRunHash: value.frontRunHash, victimHash: value.victimHash, backRunHash: value.backRunHash, poolAddress: value.poolAddress, profitEstimate: value.profitEstimate, evidence: value.evidence, method: value.method, methodVersion: value.methodVersion })));
      await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "DEFI_MEV_ANALYSIS_EXECUTED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { interactionCount: interactions.length, mevCandidateCount: mev.candidates.length, historicalOnly: true, maxEdges: MAX_GRAPH_EDGES } });
    });
    return { interactions, mev, historicalOnly: true, disclaimer: "Historical candidate analysis only. It is not real-time mempool monitoring and is not proof of MEV activity." };
  }
  async generateReport(actor: Actor, investigationId: string, reportType: ReportType, requestId?: string) {
    const investigation = await this.accessible(actor, investigationId, "REPORT_GENERATE", requestId);
    const edges = await this.repositories.graph.listByCaseAndChain(investigation.caseId, investigation.chain!, MAX_GRAPH_EDGES);
    const candidates = await this.repositories.intelligence.listVaspCandidates(investigation.caseId, investigation.id, 250);
    const risks = await this.repositories.analytics.listRiskIndicators(investigation.caseId, investigation.id, 250);
    const audit = await this.repositories.audit.listByCase(investigation.caseId);
    const report = this.reports.generateInvestigationSummary(investigation.caseId, investigation.id, actor.id, { transactionCount: new Set(edges.map((edge) => edge.transactionHash)).size, walletCount: new Set(edges.flatMap((edge) => [edge.fromAddress.toLowerCase(), edge.toAddress.toLowerCase()])).size, chains: [...new Set(edges.map((edge) => edge.chain))], riskIndicatorCount: risks.length, graphEdgeCount: edges.length, candidateCount: candidates.length, reviewCount: audit.filter((event) => event.action === "VASP_CANDIDATE_REVIEWED").length, contradictionCount: candidates.reduce((count, candidate) => count + candidate.contradictions.length, 0), auditEventCount: audit.length }, reportType);
    const stored = await this.transactions.transaction(async (repositories) => {
      const value = await repositories.analytics.createReport(investigation.caseId, investigation.id, actor.id, { title: report.title, reportType, content: report as unknown as Record<string, unknown>, methodVersions: report.methodVersions });
      await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "FORENSIC_REPORT_GENERATED", resourceType: "forensic_report", resourceId: value.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { investigationId: investigation.id, reportType, method: "cashnet-report-generator", methodVersion: "1.0.0" } });
      return value;
    });
    return stored;
  }
  async getReport(actor: Actor, investigationId: string, reportId: string, requestId?: string) {
    const investigation = await this.accessible(actor, investigationId, "REPORT_READ", requestId);
    const report = await this.repositories.analytics.findReport(investigation.caseId, reportId);
    if (!report || report.investigationId !== investigation.id) throw new NotFoundError("Report not found.");
    await this.transactions.transaction(async (repositories) => repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "FORENSIC_REPORT_VIEWED", resourceType: "forensic_report", resourceId: report.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { investigationId } }));
    return report;
  }
}
