import type { RepositoryContext } from "../../repositories/repository-context";
import type { GraphRelationshipRecord } from "../../repositories/types";

/**
 * Graph Feature Extraction Service
 *
 * Computes structural features from stored graph relationships for forensic analysis.
 * Each feature is versioned and scoped to a case/investigation.
 * 
 * All graph operations are bounded by configurable limits.
 */

const METHOD = "cashnet-graph-features";
const METHOD_VERSION = "1.0.0";

export interface GraphFeature {
  featureId: string;
  chain: string;
  address: string;
  featureType: string;
  value: number;
  method: string;
  methodVersion: string;
  scopeDescription: string;
  computedAt: string;
}

export interface GraphFeatureSet {
  address: string;
  chain: string;
  features: GraphFeature[];
  edgeCount: number;
  method: string;
  methodVersion: string;
}

type FeatureComputer = (chain: string, address: string, edges: GraphRelationshipRecord[]) => GraphFeature[];

function degreeFeatures(chain: string, address: string, edges: GraphRelationshipRecord[]): GraphFeature[] {
  const addr = address.toLowerCase();
  const now = new Date().toISOString();
  const inDegree = new Set(edges.filter((e) => e.toAddress.toLowerCase() === addr).map((e) => e.fromAddress.toLowerCase())).size;
  const outDegree = new Set(edges.filter((e) => e.fromAddress.toLowerCase() === addr).map((e) => e.toAddress.toLowerCase())).size;
  const totalDegree = inDegree + outDegree;

  return [
    { featureId: `${addr}:IN_DEGREE`, chain, address, featureType: "IN_DEGREE", value: inDegree, method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Unique incoming counterparties", computedAt: now },
    { featureId: `${addr}:OUT_DEGREE`, chain, address, featureType: "OUT_DEGREE", value: outDegree, method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Unique outgoing counterparties", computedAt: now },
    { featureId: `${addr}:TOTAL_DEGREE`, chain, address, featureType: "TOTAL_DEGREE", value: totalDegree, method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Total unique counterparties (in + out)", computedAt: now },
  ];
}

function volumeFeatures(chain: string, address: string, edges: GraphRelationshipRecord[]): GraphFeature[] {
  const addr = address.toLowerCase();
  const now = new Date().toISOString();
  const inEdges = edges.filter((e) => e.toAddress.toLowerCase() === addr);
  const outEdges = edges.filter((e) => e.fromAddress.toLowerCase() === addr);

  const inVolume = inEdges.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const outVolume = outEdges.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return [
    { featureId: `${addr}:IN_VOLUME`, chain, address, featureType: "IN_VOLUME", value: inVolume, method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Total incoming value", computedAt: now },
    { featureId: `${addr}:OUT_VOLUME`, chain, address, featureType: "OUT_VOLUME", value: outVolume, method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Total outgoing value", computedAt: now },
    { featureId: `${addr}:TX_COUNT`, chain, address, featureType: "TX_COUNT", value: inEdges.length + outEdges.length, method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Total transaction count", computedAt: now },
  ];
}

function temporalFeatures(chain: string, address: string, edges: GraphRelationshipRecord[]): GraphFeature[] {
  const addr = address.toLowerCase();
  const now = new Date().toISOString();
  const relevantEdges = edges.filter((e) => e.fromAddress.toLowerCase() === addr || e.toAddress.toLowerCase() === addr);
  const timestamps = relevantEdges.map((e) => e.timestamp ? new Date(e.timestamp).getTime() : 0).filter((t) => t > 0).sort((a, b) => a - b);
  if (timestamps.length < 2) return [];

  const span = timestamps[timestamps.length - 1] - timestamps[0];
  const avgInterval = span / (timestamps.length - 1);
  const velocityPerHour = timestamps.length / (span / 3_600_000);

  return [
    { featureId: `${addr}:ACTIVE_SPAN_HOURS`, chain, address, featureType: "ACTIVE_SPAN_HOURS", value: Math.round(span / 3_600_000), method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Time span of activity in hours", computedAt: now },
    { featureId: `${addr}:AVG_INTERVAL_MINUTES`, chain, address, featureType: "AVG_INTERVAL_MINUTES", value: Math.round(avgInterval / 60_000), method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Average interval between transactions in minutes", computedAt: now },
    { featureId: `${addr}:TX_VELOCITY_PER_HOUR`, chain, address, featureType: "TX_VELOCITY_PER_HOUR", value: Number.isFinite(velocityPerHour) ? Math.round(velocityPerHour * 100) / 100 : 0, method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Transactions per hour", computedAt: now },
  ];
}

function concentrationFeatures(chain: string, address: string, edges: GraphRelationshipRecord[]): GraphFeature[] {
  const addr = address.toLowerCase();
  const now = new Date().toISOString();
  const outEdges = edges.filter((e) => e.fromAddress.toLowerCase() === addr);
  if (outEdges.length < 2) return [];

  const counterpartyVolumes: Record<string, number> = {};
  let totalVolume = 0;
  for (const e of outEdges) {
    const val = Number(e.amount) || 0;
    const cp = e.toAddress.toLowerCase();
    counterpartyVolumes[cp] = (counterpartyVolumes[cp] ?? 0) + val;
    totalVolume += val;
  }

  if (totalVolume === 0) return [];

  // Herfindahl-Hirschman Index (HHI) for concentration
  const shares = Object.values(counterpartyVolumes).map((v) => v / totalVolume);
  const hhi = shares.reduce((sum, s) => sum + s * s, 0);

  return [
    { featureId: `${addr}:HHI_CONCENTRATION`, chain, address, featureType: "HHI_CONCENTRATION", value: Math.round(hhi * 10000) / 10000, method: METHOD, methodVersion: METHOD_VERSION, scopeDescription: "Herfindahl-Hirschman Index for outgoing counterparty concentration (0=dispersed, 1=single)", computedAt: now },
  ];
}

const ALL_FEATURE_COMPUTERS: FeatureComputer[] = [degreeFeatures, volumeFeatures, temporalFeatures, concentrationFeatures];

export class GraphFeatureService {
  async computeFeatures(
    repos: RepositoryContext,
    caseId: string,
    chain: string,
    address: string,
    maxEdges = 10_000,
  ): Promise<GraphFeatureSet> {
    const edges = await repos.graph.listByCaseAndChain(caseId, chain, Math.min(Math.max(maxEdges, 1), 50_000));

    const features: GraphFeature[] = [];
    for (const computer of ALL_FEATURE_COMPUTERS) {
      features.push(...computer(chain, address, edges));
    }

    return { address, chain, features, edgeCount: edges.length, method: METHOD, methodVersion: METHOD_VERSION };
  }
}
