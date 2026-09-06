/**
 * Evaluation Framework
 *
 * Computes standard classification metrics for forensic analysis quality assessment.
 *
 * IMPORTANT:
 * - Evaluation requires an independent held-out dataset with verified labels.
 * - Without such a dataset: ACCURACY = INSUFFICIENT_GROUND_TRUTH
 * - A heuristic 87/100 score is NEVER "87% probability".
 *
 * Score Type Labels:
 *   ORDINAL_CONFIDENCE    — ordering only
 *   RANKING_SCORE         — relative position
 *   HEURISTIC_SCORE       — rule-based, not calibrated
 *   CALIBRATED_PROBABILITY — held-out calibration required
 *
 * Leakage Prevention:
 *   - Labels NEVER in feature computation
 *   - Temporal split: train strictly before test in time
 *   - Address split: no address in both train and test
 *   - Transaction split: no transaction overlap
 *   - Case split: no case in both splits
 */

const METHOD = "cashnet-evaluation";
const METHOD_VERSION = "1.0.0";

export type ScoreType = "ORDINAL_CONFIDENCE" | "RANKING_SCORE" | "HEURISTIC_SCORE" | "CALIBRATED_PROBABILITY";

export interface EvaluationPrediction {
  subjectId: string;
  predictedLabel: string;
  predictedScore: number;
  scoreType: ScoreType;
  trueLabel?: string;
}

export interface EvaluationMetrics {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  specificity: number | null;
  sensitivity: number | null;
  balancedAccuracy: number | null;
  topKAccuracy: Record<number, number | null>;
  mrr: number | null;
  brierScore: number | null;
  ece: number | null;
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
  method: string;
  methodVersion: string;
  groundTruthStatus: "VERIFIED" | "INSUFFICIENT_GROUND_TRUTH";
}

export interface CalibrationBin {
  binIndex: number;
  lowerBound: number;
  upperBound: number;
  avgPredicted: number;
  avgActual: number;
  count: number;
  gap: number;
}

export interface CalibrationResult {
  bins: CalibrationBin[];
  expectedCalibrationError: number;
  brierScore: number;
  scoreType: ScoreType;
  method: string;
  methodVersion: string;
}

// ── Metric Computation ──────────────────────────────────────────────────────

export function computeBinaryMetrics(predictions: EvaluationPrediction[], positiveLabel: string): EvaluationMetrics {
  const labeled = predictions.filter((p) => p.trueLabel != null);
  if (labeled.length === 0) {
    return emptyMetrics("INSUFFICIENT_GROUND_TRUTH");
  }

  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const p of labeled) {
    const predicted = p.predictedLabel === positiveLabel;
    const actual = p.trueLabel === positiveLabel;
    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && actual) fn++;
    else tn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 = precision != null && recall != null && precision + recall > 0
    ? 2 * (precision * recall) / (precision + recall)
    : null;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : null;
  const fnr = tp + fn > 0 ? fn / (tp + fn) : null;
  const specificity = fp + tn > 0 ? tn / (fp + tn) : null;
  const sensitivity = recall;
  const balancedAccuracy = sensitivity != null && specificity != null
    ? (sensitivity + specificity) / 2
    : null;

  return {
    precision, recall, f1,
    falsePositiveRate: fpr,
    falseNegativeRate: fnr,
    specificity, sensitivity, balancedAccuracy,
    topKAccuracy: computeTopK(labeled, positiveLabel, [1, 3, 5]),
    mrr: computeMRR(labeled, positiveLabel),
    brierScore: computeBrierScore(labeled, positiveLabel),
    ece: null,
    sampleCount: labeled.length,
    positiveCount: tp + fn,
    negativeCount: fp + tn,
    method: METHOD, methodVersion: METHOD_VERSION,
    groundTruthStatus: "VERIFIED",
  };
}

function computeTopK(predictions: EvaluationPrediction[], positiveLabel: string, ks: number[]): Record<number, number | null> {
  const sorted = [...predictions].sort((a, b) => b.predictedScore - a.predictedScore);
  const result: Record<number, number | null> = {};
  for (const k of ks) {
    if (sorted.length < k) { result[k] = null; continue; }
    const topK = sorted.slice(0, k);
    const hits = topK.filter((p) => p.trueLabel === positiveLabel).length;
    result[k] = hits / k;
  }
  return result;
}

function computeMRR(predictions: EvaluationPrediction[], positiveLabel: string): number | null {
  const sorted = [...predictions].sort((a, b) => b.predictedScore - a.predictedScore);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].trueLabel === positiveLabel) return 1 / (i + 1);
  }
  return null;
}

function computeBrierScore(predictions: EvaluationPrediction[], positiveLabel: string): number | null {
  if (predictions.length === 0) return null;
  let sum = 0;
  for (const p of predictions) {
    const actual = p.trueLabel === positiveLabel ? 1 : 0;
    const predicted = Math.max(0, Math.min(1, p.predictedScore / 100));
    sum += (predicted - actual) ** 2;
  }
  return sum / predictions.length;
}

function emptyMetrics(status: EvaluationMetrics["groundTruthStatus"]): EvaluationMetrics {
  return {
    precision: null, recall: null, f1: null,
    falsePositiveRate: null, falseNegativeRate: null,
    specificity: null, sensitivity: null, balancedAccuracy: null,
    topKAccuracy: {}, mrr: null, brierScore: null, ece: null,
    sampleCount: 0, positiveCount: 0, negativeCount: 0,
    method: METHOD, methodVersion: METHOD_VERSION,
    groundTruthStatus: status,
  };
}

// ── Calibration ─────────────────────────────────────────────────────────────

export function computeCalibration(
  predictions: EvaluationPrediction[],
  positiveLabel: string,
  numBins = 10,
): CalibrationResult {
  const labeled = predictions.filter((p) => p.trueLabel != null);
  const bins: CalibrationBin[] = [];
  const binWidth = 1 / numBins;

  for (let i = 0; i < numBins; i++) {
    const lower = i * binWidth;
    const upper = (i + 1) * binWidth;
    const inBin = labeled.filter((p) => {
      const score = p.predictedScore / 100;
      return score >= lower && (i === numBins - 1 ? score <= upper : score < upper);
    });

    const avgPredicted = inBin.length > 0
      ? inBin.reduce((s, p) => s + p.predictedScore / 100, 0) / inBin.length
      : (lower + upper) / 2;
    const avgActual = inBin.length > 0
      ? inBin.filter((p) => p.trueLabel === positiveLabel).length / inBin.length
      : 0;

    bins.push({
      binIndex: i,
      lowerBound: lower,
      upperBound: upper,
      avgPredicted,
      avgActual,
      count: inBin.length,
      gap: Math.abs(avgPredicted - avgActual),
    });
  }

  const totalCount = labeled.length || 1;
  const ece = bins.reduce((sum, bin) => sum + (bin.count / totalCount) * bin.gap, 0);
  const brierScore = computeBrierScore(labeled, positiveLabel) ?? 0;

  return {
    bins, expectedCalibrationError: ece, brierScore,
    scoreType: "HEURISTIC_SCORE",
    method: METHOD, methodVersion: METHOD_VERSION,
  };
}

// ── False Positive Analysis ─────────────────────────────────────────────────

export type FalsePositiveCategory =
  | "STALE_DATA"
  | "CONFLICTING_LABELS"
  | "GRAPH_COINCIDENCE"
  | "CLUSTERING_AMBIGUITY"
  | "SHARED_SERVICE"
  | "BRIDGE_BEHAVIOR"
  | "EXCHANGE_OMNIBUS"
  | "PRIVACY_SERVICE"
  | "MALFORMED_DATA"
  | "INSUFFICIENT_CONTEXT";

export interface FalsePositiveAnalysis {
  subjectId: string;
  predictedLabel: string;
  trueLabel: string;
  categories: FalsePositiveCategory[];
  explanation: string;
}

export function analyzeFalsePositives(predictions: EvaluationPrediction[], positiveLabel: string): FalsePositiveAnalysis[] {
  return predictions
    .filter((p) => p.predictedLabel === positiveLabel && p.trueLabel != null && p.trueLabel !== positiveLabel)
    .map((p) => ({
      subjectId: p.subjectId,
      predictedLabel: p.predictedLabel,
      trueLabel: p.trueLabel!,
      categories: ["INSUFFICIENT_CONTEXT" as FalsePositiveCategory],
      explanation: `Predicted ${p.predictedLabel} (score: ${p.predictedScore}) but true label is ${p.trueLabel}. Root cause analysis requires manual review of the underlying evidence chain.`,
    }));
}
