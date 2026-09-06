import type { AddressIntelligenceObservationInput, AddressIntelligenceObservationRecord, AttributionReviewInput, AttributionReviewRecord, ClusterInferenceInput, ClusterInferenceRecord, ServiceAddressAssessmentInput, ServiceAddressAssessmentRecord, VaspCandidateInput, VaspCandidateRecord } from "./types";

/** Case-scoped persistence port. Services never issue SQL directly. */
export interface IntelligenceRepository {
  listAddressObservations(caseId: string, investigationId: string, chain: string, address: string): Promise<AddressIntelligenceObservationRecord[]>;
  listObservationsForInvestigation(caseId: string, investigationId: string, chain: string, limit: number): Promise<AddressIntelligenceObservationRecord[]>;
  upsertAddressObservations(caseId: string, investigationId: string, values: AddressIntelligenceObservationInput[]): Promise<AddressIntelligenceObservationRecord[]>;
  upsertCluster(caseId: string, investigationId: string, value: ClusterInferenceInput): Promise<ClusterInferenceRecord>;
  listClusters(caseId: string, investigationId: string, limit: number): Promise<ClusterInferenceRecord[]>;
  upsertServiceAssessment(caseId: string, investigationId: string, value: ServiceAddressAssessmentInput): Promise<ServiceAddressAssessmentRecord>;
  upsertVaspCandidate(caseId: string, investigationId: string, value: VaspCandidateInput): Promise<VaspCandidateRecord>;
  listVaspCandidates(caseId: string, investigationId: string, limit: number): Promise<VaspCandidateRecord[]>;
  findVaspCandidate(caseId: string, investigationId: string, candidateId: string): Promise<VaspCandidateRecord | null>;
  appendReview(caseId: string, investigationId: string, candidateId: string, reviewerId: string, input: AttributionReviewInput): Promise<AttributionReviewRecord>;
}
