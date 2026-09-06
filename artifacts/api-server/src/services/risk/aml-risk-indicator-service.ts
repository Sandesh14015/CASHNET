import type { RepositoryContext } from "../../repositories/repository-context";
import type { Actor, GraphRelationshipRecord } from "../../repositories/types";

/**
 * A risk indicator is an OBSERVATION or ASSESSMENT, never proof of criminal activity.
 *
 * Classification hierarchy:
 *   FACT       — observed on-chain
 *   INDICATOR  — heuristic-derived signal with evidence
 *   ASSESSMENT — scored candidate with multiple indicators
 *   CANDIDATE  — review-required finding
 */

// ── Indicator Types ─────────────────────────────────────────────────────────

export type IndicatorType =
  | "RAPID_IN_OUT"
  | "HIGH_VELOCITY"
  | "FAN_IN"
  | "FAN_OUT"
  | "ROUND_NUMBER_PATTERN"
  | "BURST_ACTIVITY"
  | "SIMILAR_AMOUNTS"
  | "PEEL_CHAIN"
  | "MULTI_HOP_DIMINISHING"
  | "HIGH_VALUE_ANOMALY"
  | "COUNTERPARTY_CONCENTRATION"
  | "ADDRESS_REUSE"
  | "SERVICE_EXPOSURE"
  | "SANCTIONED_INTERACTION";

export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export interface RiskIndicatorResult {
  indicatorType: IndicatorType;
  ruleVersion: string;
  severity: Severity;
  scoreContribution: number;
  confidence: Confidence;
  description: string;
  explanation: string;
  evidence: RiskEvidence[];
  observedAt?: string;
}

export interface RiskEvidence {
  evidenceType: string;
  subjectType: string;
  subjectId: string;
  value?: string;
  source?: string;
  sourceReference?: string;
  method: string;
  methodVersion: string;
}

export interface RiskAnalysisResult {
  runId: string;
  chain: string;
  address: string;
  status: "COMPLETED" | "FAILED" | "PARTIAL";
  indicators: RiskIndicatorResult[];
  totalScore: number;
  indicatorCount: number;
  method: string;
  methodVersion: string;
}

// ── Indicator Plugins ────────────────────────────────────────────────────────

interface TransactionSummary {
  hash: string;
  from: string | null;
  to: string | null;
  value: string | null;
  timestamp: string | null;
  chain: string;
  executionStatus: string | null;
}

interface GraphEdgeSummary {
  fromAddress: string;
  toAddress: string;
  amount: string;
  timestamp: string | null;
  transactionHash: string;
}

const RULE_VERSION = "1.0.0";
const METHOD = "cashnet-aml-risk-engine";

function rapidInOut(address: string, edges: GraphEdgeSummary[]): RiskIndicatorResult | null {
  const incoming = edges.filter((e) => e.toAddress.toLowerCase() === address.toLowerCase());
  const outgoing = edges.filter((e) => e.fromAddress.toLowerCase() === address.toLowerCase());
  if (incoming.length === 0 || outgoing.length === 0) return null;

  const inTimes = incoming.map((e) => e.timestamp ? new Date(e.timestamp).getTime() : 0).filter((t) => t > 0);
  const outTimes = outgoing.map((e) => e.timestamp ? new Date(e.timestamp).getTime() : 0).filter((t) => t > 0);
  if (inTimes.length === 0 || outTimes.length === 0) return null;

  const minIn = Math.min(...inTimes);
  const minOut = Math.min(...outTimes);
  const maxOut = Math.max(...outTimes);
  // Check if outgoing started within 1 hour of first incoming
  const gapMs = Math.abs(minOut - minIn);
  const oneHour = 3600_000;
  if (gapMs > oneHour) return null;

  return {
    indicatorType: "RAPID_IN_OUT", ruleVersion: RULE_VERSION,
    severity: gapMs < 600_000 ? "HIGH" : "MEDIUM",
    scoreContribution: gapMs < 600_000 ? 15 : 8,
    confidence: "MEDIUM",
    description: "Funds received and forwarded within a short time window.",
    explanation: `Address received funds and began sending within ${Math.round(gapMs / 60_000)} minutes. In-txs: ${incoming.length}, Out-txs: ${outgoing.length}. Time span of outgoing activity: ${Math.round((maxOut - minOut) / 60_000)} minutes. This is an OBSERVATION, not proof of pass-through behavior.`,
    evidence: incoming.slice(0, 5).map((e) => ({ evidenceType: "INCOMING_TRANSACTION", subjectType: "TRANSACTION", subjectId: e.transactionHash, value: e.amount, method: METHOD, methodVersion: RULE_VERSION })),
  };
}

function fanInFanOut(address: string, edges: GraphEdgeSummary[]): RiskIndicatorResult[] {
  const results: RiskIndicatorResult[] = [];
  const incoming = edges.filter((e) => e.toAddress.toLowerCase() === address.toLowerCase());
  const outgoing = edges.filter((e) => e.fromAddress.toLowerCase() === address.toLowerCase());

  const uniqueIncoming = new Set(incoming.map((e) => e.fromAddress.toLowerCase()));
  const uniqueOutgoing = new Set(outgoing.map((e) => e.toAddress.toLowerCase()));

  if (uniqueIncoming.size >= 5) {
    results.push({
      indicatorType: "FAN_IN", ruleVersion: RULE_VERSION,
      severity: uniqueIncoming.size >= 20 ? "HIGH" : "MEDIUM",
      scoreContribution: Math.min(uniqueIncoming.size, 20),
      confidence: "HIGH",
      description: `Received funds from ${uniqueIncoming.size} unique addresses.`,
      explanation: `Fan-in of ${uniqueIncoming.size} unique senders across ${incoming.length} transactions. High fan-in MAY indicate consolidation behavior but also occurs with legitimate payment processors, exchanges, and services.`,
      evidence: [{ evidenceType: "FAN_IN_COUNT", subjectType: "ADDRESS", subjectId: address, value: String(uniqueIncoming.size), method: METHOD, methodVersion: RULE_VERSION }],
    });
  }

  if (uniqueOutgoing.size >= 5) {
    results.push({
      indicatorType: "FAN_OUT", ruleVersion: RULE_VERSION,
      severity: uniqueOutgoing.size >= 20 ? "HIGH" : "MEDIUM",
      scoreContribution: Math.min(uniqueOutgoing.size, 20),
      confidence: "HIGH",
      description: `Sent funds to ${uniqueOutgoing.size} unique addresses.`,
      explanation: `Fan-out of ${uniqueOutgoing.size} unique recipients across ${outgoing.length} transactions. High fan-out MAY indicate distribution behavior but also occurs with payroll systems, exchanges, and services.`,
      evidence: [{ evidenceType: "FAN_OUT_COUNT", subjectType: "ADDRESS", subjectId: address, value: String(uniqueOutgoing.size), method: METHOD, methodVersion: RULE_VERSION }],
    });
  }

  return results;
}

function burstActivity(address: string, edges: GraphEdgeSummary[]): RiskIndicatorResult | null {
  const allTimes = edges
    .filter((e) => e.fromAddress.toLowerCase() === address.toLowerCase() || e.toAddress.toLowerCase() === address.toLowerCase())
    .map((e) => e.timestamp ? new Date(e.timestamp).getTime() : 0)
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  if (allTimes.length < 5) return null;

  // Find bursts: 5+ transactions within 10 minutes
  const windowMs = 600_000;
  let maxBurstCount = 0;
  for (let i = 0; i < allTimes.length; i++) {
    let count = 1;
    for (let j = i + 1; j < allTimes.length && allTimes[j] - allTimes[i] <= windowMs; j++) {
      count++;
    }
    maxBurstCount = Math.max(maxBurstCount, count);
  }

  if (maxBurstCount < 5) return null;

  return {
    indicatorType: "BURST_ACTIVITY", ruleVersion: RULE_VERSION,
    severity: maxBurstCount >= 20 ? "HIGH" : "MEDIUM",
    scoreContribution: Math.min(maxBurstCount, 15),
    confidence: "MEDIUM",
    description: `${maxBurstCount} transactions within a 10-minute window.`,
    explanation: `Detected burst of ${maxBurstCount} transactions within 10 minutes. Burst activity MAY indicate automated behavior, but also occurs during normal trading, DeFi interactions, and batch operations.`,
    evidence: [{ evidenceType: "BURST_COUNT", subjectType: "ADDRESS", subjectId: address, value: String(maxBurstCount), method: METHOD, methodVersion: RULE_VERSION }],
  };
}

function counterpartyConcentration(address: string, edges: GraphEdgeSummary[]): RiskIndicatorResult | null {
  const outgoing = edges.filter((e) => e.fromAddress.toLowerCase() === address.toLowerCase());
  if (outgoing.length < 3) return null;

  const counterpartyCounts: Record<string, number> = {};
  for (const e of outgoing) {
    const key = e.toAddress.toLowerCase();
    counterpartyCounts[key] = (counterpartyCounts[key] ?? 0) + 1;
  }

  const sorted = Object.entries(counterpartyCounts).sort((a, b) => b[1] - a[1]);
  const topCounterparty = sorted[0];
  const concentration = topCounterparty[1] / outgoing.length;

  if (concentration < 0.5) return null;

  return {
    indicatorType: "COUNTERPARTY_CONCENTRATION", ruleVersion: RULE_VERSION,
    severity: concentration >= 0.8 ? "MEDIUM" : "LOW",
    scoreContribution: Math.round(concentration * 10),
    confidence: "HIGH",
    description: `${Math.round(concentration * 100)}% of outgoing transactions go to a single address.`,
    explanation: `Top counterparty ${topCounterparty[0]} receives ${topCounterparty[1]}/${outgoing.length} (${Math.round(concentration * 100)}%) of outgoing transactions. High concentration MAY indicate a specific relationship but is common in legitimate service interactions.`,
    evidence: [{ evidenceType: "CONCENTRATION_RATIO", subjectType: "ADDRESS", subjectId: topCounterparty[0], value: String(concentration.toFixed(3)), method: METHOD, methodVersion: RULE_VERSION }],
  };
}

function highValueAnomaly(address: string, edges: GraphEdgeSummary[]): RiskIndicatorResult | null {
  const outgoing = edges.filter((e) => e.fromAddress.toLowerCase() === address.toLowerCase());
  if (outgoing.length < 3) return null;

  const values = outgoing.map((e) => Number(e.amount)).filter((v) => Number.isFinite(v) && v > 0);
  if (values.length < 3) return null;

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const stddev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  if (stddev === 0) return null;

  const outliers = values.filter((v) => Math.abs(v - mean) > 3 * stddev);
  if (outliers.length === 0) return null;

  return {
    indicatorType: "HIGH_VALUE_ANOMALY", ruleVersion: RULE_VERSION,
    severity: "MEDIUM",
    scoreContribution: Math.min(outliers.length * 5, 15),
    confidence: "MEDIUM",
    description: `${outliers.length} transaction(s) exceed 3 standard deviations from mean value.`,
    explanation: `Mean value: ${mean.toFixed(0)}, StdDev: ${stddev.toFixed(0)}. ${outliers.length} transaction(s) are statistical outliers. This is a mathematical observation and may reflect legitimate large transfers.`,
    evidence: [{ evidenceType: "STATISTICAL_OUTLIER", subjectType: "ADDRESS", subjectId: address, value: `outliers=${outliers.length},mean=${mean.toFixed(0)},stddev=${stddev.toFixed(0)}`, method: METHOD, methodVersion: RULE_VERSION }],
  };
}

// ── Main Service ─────────────────────────────────────────────────────────────

export class AMLRiskIndicatorService {
  private readonly method = METHOD;
  private readonly methodVersion = RULE_VERSION;

  async analyzeAddress(
    repos: RepositoryContext,
    actor: Actor,
    caseId: string,
    investigationId: string,
    chain: string,
    address: string,
  ): Promise<RiskAnalysisResult> {
    // Fetch graph relationships for the address
    const edges = await repos.graph.listByCaseAndChain(caseId, chain);

    const edgeSummaries: GraphEdgeSummary[] = edges.map((e) => ({
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      amount: e.amount,
      timestamp: e.timestamp,
      transactionHash: e.transactionHash,
    }));

    // Run all deterministic indicator plugins
    const indicators: RiskIndicatorResult[] = [];

    const rapid = rapidInOut(address, edgeSummaries);
    if (rapid) indicators.push(rapid);

    indicators.push(...fanInFanOut(address, edgeSummaries));

    const burst = burstActivity(address, edgeSummaries);
    if (burst) indicators.push(burst);

    const concentration = counterpartyConcentration(address, edgeSummaries);
    if (concentration) indicators.push(concentration);

    const anomaly = highValueAnomaly(address, edgeSummaries);
    if (anomaly) indicators.push(anomaly);

    // Compute total score (capped at 100)
    const totalScore = Math.min(100, indicators.reduce((sum, i) => sum + i.scoreContribution, 0));

    return {
      runId: crypto.randomUUID(),
      chain, address,
      status: "COMPLETED",
      indicators,
      totalScore,
      indicatorCount: indicators.length,
      method: this.method,
      methodVersion: this.methodVersion,
    };
  }
}
