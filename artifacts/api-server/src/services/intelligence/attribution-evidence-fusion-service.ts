import type { AttributionEvidenceInput, ConfidenceLevel } from "../../repositories/types";

export const ATTRIBUTION_SCORING_METHOD = "deterministic-attribution-evidence-fusion";
export const ATTRIBUTION_SCORING_VERSION = "1.0.0";
export type FusionResult = { numericScore: number; confidenceLevel: ConfidenceLevel; supportingEvidence: AttributionEvidenceInput[]; negativeEvidence: AttributionEvidenceInput[]; contradictions: Record<string, unknown>[] };
/** Versioned deterministic policy: labels 45, graph proximity <=20, agreement 15, assessment <=10, cluster 5; negative evidence subtracts its contribution. */
export function fuseAttributionEvidence(evidence: AttributionEvidenceInput[]): FusionResult {
  const supportingEvidence = evidence.filter((item) => item.polarity === "SUPPORTING"); const negativeEvidence = evidence.filter((item) => item.polarity !== "SUPPORTING");
  const numericScore = Math.max(0, Math.min(100, supportingEvidence.reduce((sum, item) => sum + item.contribution, 0) - negativeEvidence.reduce((sum, item) => sum + Math.abs(item.contribution), 0)));
  const independentSources = new Set(supportingEvidence.map((item) => item.source).filter(Boolean)).size;
  const hasConflict = negativeEvidence.some((item) => item.polarity === "CONTRADICTORY");
  const confidenceLevel: ConfidenceLevel = !supportingEvidence.length || hasConflict || numericScore < 30 ? "UNKNOWN" : numericScore >= 70 && independentSources >= 2 ? "LIKELY" : "POSSIBLE";
  return { numericScore, confidenceLevel, supportingEvidence, negativeEvidence, contradictions: negativeEvidence.filter((item) => item.polarity === "CONTRADICTORY").map((item) => ({ evidenceType: item.evidenceType, subjectId: item.subjectId, source: item.source })) };
}
