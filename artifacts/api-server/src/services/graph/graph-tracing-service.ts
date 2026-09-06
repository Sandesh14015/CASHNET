import { NotFoundError, ValidationFailureError } from "../../errors/app-error";
import { logger } from "../../lib/logger";
import type { RepositoryContext, TransactionCoordinator } from "../../repositories/repository-context";
import type { Actor, GraphRelationshipRecord } from "../../repositories/types";
import type { CaseAuthorizationService } from "../../auth/case-authorization-service";

export type TraversalDirection = "OUTGOING" | "INCOMING" | "BOTH";
export type GraphTraceOptions = { depth?: number; direction?: TraversalDirection; maxNeighbors?: number; maxNodes?: number; maxEdges?: number; minAmount?: string; maxAmount?: string; asset?: string; startTime?: string; endTime?: string };
export type GraphTraceResult = { status: "OK" | "INSUFFICIENT_DATA"; nodes: GraphNode[]; edges: GraphEdge[]; paths: GraphPath[]; metadata: GraphMetadata; limitsApplied: Required<Pick<GraphTraceOptions, "depth" | "direction" | "maxNeighbors" | "maxNodes" | "maxEdges">>; evidenceReferences: GraphEvidence[] };
export type GraphNode = { id: string; chain: string; address: string; nodeType: "EOA" | "ADDRESS" | "CONTRACT" | "UNKNOWN"; firstSeen: string | null; lastSeen: string | null };
export type GraphEvidence = { transactionHash: string; provider: string | null; sourceReference: string | null; rawReference: string | null; retrievedAt: string | null; method: string; derivationSourceType: "API" | "INFERENCE" };
export type GraphEdge = { id: string; chain: string; transactionHash: string; fromAddress: string; toAddress: string; relationshipType: string; asset: string; amount: string; tokenContract: string | null; timestamp: string | null; blockNumber: string | null; status: string | null; evidence: GraphEvidence };
export type GraphPath = { rank: number; nodes: Array<{ chain: string; address: string }>; edgeIds: string[]; hopCount: number; evidenceComplete: boolean };
export type GraphMetadata = { seedAddress: string; chain: string; requestedDepth: number; actualDepth: number; nodesVisited: number; edgesVisited: number; nodesReturned: number; edgesReturned: number; executionTimeMs: number; traversalTruncated: boolean; truncationReasons: string[]; databaseQueryCount: number };

const defaults = { depth: 2, direction: "OUTGOING" as const, maxNeighbors: 25, maxNodes: 250, maxEdges: 500 };
const absoluteMaximums = { depth: 5, maxNeighbors: 100, maxNodes: 1000, maxEdges: 2000 };

export class GraphTracingService {
  constructor(private readonly repositories: RepositoryContext, private readonly transactions: TransactionCoordinator, private readonly authorization: CaseAuthorizationService) {}
  async trace(actor: Actor, investigationId: string, options: GraphTraceOptions, requestId?: string): Promise<GraphTraceResult> {
    const investigation = await this.repositories.investigations.findAccessibleById(actor, investigationId);
    if (!investigation) throw new NotFoundError("Investigation not found.");
    await this.authorization.requireCaseAccess(actor, investigation.caseId, "INVESTIGATION_READ", requestId);
    if (!investigation.chain || !investigation.walletAddress) throw new ValidationFailureError("A chain and seed wallet are required for graph tracing.");
    const relationships = await this.repositories.graph.listByCaseAndChain(investigation.caseId, investigation.chain);
    const result = traceStoredRelationships(investigation.chain, investigation.walletAddress, relationships, options);
    await this.transactions.transaction(async (repositories) => repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "INVESTIGATION_GRAPH_QUERIED", resourceType: "investigation", resourceId: investigation.id, requestId: requestId ?? null, result: "SUCCESS", metadata: { seedAddress: investigation.walletAddress, chain: investigation.chain, requestedDepth: result.metadata.requestedDepth, actualDepth: result.metadata.actualDepth, nodesVisited: result.metadata.nodesVisited, edgesVisited: result.metadata.edgesVisited, nodesReturned: result.metadata.nodesReturned, edgesReturned: result.metadata.edgesReturned, executionTimeMs: result.metadata.executionTimeMs, truncated: result.metadata.traversalTruncated, truncationReasons: result.metadata.truncationReasons } }));
    logger.info({ investigationId, seedAddress: investigation.walletAddress, chain: investigation.chain, requestedDepth: result.metadata.requestedDepth, actualDepth: result.metadata.actualDepth, nodesVisited: result.metadata.nodesVisited, edgesVisited: result.metadata.edgesVisited, nodesReturned: result.metadata.nodesReturned, edgesReturned: result.metadata.edgesReturned, executionTimeMs: result.metadata.executionTimeMs, truncated: result.metadata.traversalTruncated, truncationReasons: result.metadata.truncationReasons }, "graph trace completed");
    return result;
  }
}

/** Pure bounded BFS over persisted relationships; deliberately has no provider dependency. */
export function traceStoredRelationships(chain: string, seedAddress: string, relationships: GraphRelationshipRecord[], requested: GraphTraceOptions = {}): GraphTraceResult {
  const started = Date.now();
  const limits = validateOptions(requested);
  const filtered = relationships.filter((relationship) => relationship.chain === chain && matchesFilters(relationship, requested));
  const seed = nodeId(chain, seedAddress);
  const nodes = new Map<string, GraphNode>([[seed, makeNode(chain, seedAddress, "ADDRESS", null)]]);
  const selectedEdges = new Map<string, GraphRelationshipRecord>();
  const paths = new Map<string, { nodeIds: string[]; edgeIds: string[] }>();
  const queue: Array<{ address: string; depth: number; nodeIds: string[]; edgeIds: string[] }> = [{ address: seedAddress, depth: 0, nodeIds: [seed], edgeIds: [] }];
  const visited = new Set<string>([seed]);
  const reasons = new Set<string>();
  let nodesVisited = 0;
  let edgesVisited = 0;
  let actualDepth = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    nodesVisited += 1;
    actualDepth = Math.max(actualDepth, current.depth);
    if (current.depth >= limits.depth) continue;
    const candidates = adjacent(filtered, current.address, limits.direction).sort(compareRelationships);
    if (candidates.length > limits.maxNeighbors) reasons.add("MAX_NEIGHBORS_PER_NODE_REACHED");
    for (const candidate of candidates.slice(0, limits.maxNeighbors)) {
      edgesVisited += 1;
      if (selectedEdges.size >= limits.maxEdges) { reasons.add("MAX_EDGES_REACHED"); break; }
      const nextAddress = nextAddressFor(candidate, current.address, limits.direction);
      if (!nextAddress) continue;
      const next = nodeId(chain, nextAddress);
      if (visited.has(next)) continue;
      if (nodes.size >= limits.maxNodes) { reasons.add("MAX_NODES_REACHED"); break; }
      visited.add(next);
      selectedEdges.set(candidate.id, candidate);
      nodes.set(next, makeNode(chain, nextAddress, candidate.relationshipType === "CONTRACT_INTERACTION" && equalAddress(candidate.toAddress, nextAddress) ? "CONTRACT" : "ADDRESS", candidate.timestamp));
      const nextPath = { nodeIds: [...current.nodeIds, next], edgeIds: [...current.edgeIds, candidate.id] };
      paths.set(next, nextPath);
      queue.push({ address: nextAddress, depth: current.depth + 1, ...nextPath });
    }
    if (reasons.has("MAX_EDGES_REACHED") || reasons.has("MAX_NODES_REACHED")) break;
  }
  const edges = [...selectedEdges.values()].map(toGraphEdge);
  const rankedPaths = [...paths.values()].sort((a, b) => a.edgeIds.length - b.edgeIds.length || comparePathEvidence(a, b, selectedEdges) || a.nodeIds.join("|").localeCompare(b.nodeIds.join("|"))).map((path, index) => ({ rank: index + 1, nodes: path.nodeIds.map((id) => { const node = nodes.get(id)!; return { chain: node.chain, address: node.address }; }), edgeIds: path.edgeIds, hopCount: path.edgeIds.length, evidenceComplete: path.edgeIds.every((id) => evidenceComplete(selectedEdges.get(id)!)) }));
  const metadata: GraphMetadata = { seedAddress, chain, requestedDepth: limits.depth, actualDepth, nodesVisited, edgesVisited, nodesReturned: nodes.size, edgesReturned: edges.length, executionTimeMs: Date.now() - started, traversalTruncated: reasons.size > 0, truncationReasons: [...reasons].sort(), databaseQueryCount: 1 };
  return { status: edges.length === 0 ? "INSUFFICIENT_DATA" : "OK", nodes: [...nodes.values()], edges, paths: rankedPaths, metadata, limitsApplied: limits, evidenceReferences: edges.map((edge) => edge.evidence) };
}

function validateOptions(options: GraphTraceOptions) {
  const resolved = { depth: options.depth ?? defaults.depth, direction: options.direction ?? defaults.direction, maxNeighbors: options.maxNeighbors ?? defaults.maxNeighbors, maxNodes: options.maxNodes ?? defaults.maxNodes, maxEdges: options.maxEdges ?? defaults.maxEdges };
  for (const [key, maximum] of Object.entries(absoluteMaximums) as Array<[keyof typeof absoluteMaximums, number]>) if (!Number.isInteger(resolved[key]) || resolved[key] < 1 || resolved[key] > maximum) throw new ValidationFailureError(`${key} must be an integer between 1 and ${maximum}.`);
  if (options.minAmount && !isDecimal(options.minAmount) || options.maxAmount && !isDecimal(options.maxAmount)) throw new ValidationFailureError("Amounts must be non-negative decimal strings.");
  if (options.minAmount && options.maxAmount && compareDecimal(options.minAmount, options.maxAmount) > 0) throw new ValidationFailureError("minAmount cannot exceed maxAmount.");
  if (options.startTime && Number.isNaN(Date.parse(options.startTime)) || options.endTime && Number.isNaN(Date.parse(options.endTime))) throw new ValidationFailureError("Time filters must be ISO timestamps.");
  if (options.startTime && options.endTime && Date.parse(options.startTime) > Date.parse(options.endTime)) throw new ValidationFailureError("startTime cannot be after endTime.");
  return resolved;
}
function matchesFilters(relationship: GraphRelationshipRecord, options: GraphTraceOptions) {
  if (options.asset && relationship.asset.toLowerCase() !== options.asset.toLowerCase()) return false;
  if (options.minAmount && compareDecimal(relationship.amount, options.minAmount) < 0) return false;
  if (options.maxAmount && compareDecimal(relationship.amount, options.maxAmount) > 0) return false;
  if (options.startTime && (!relationship.timestamp || Date.parse(relationship.timestamp) < Date.parse(options.startTime))) return false;
  if (options.endTime && (!relationship.timestamp || Date.parse(relationship.timestamp) > Date.parse(options.endTime))) return false;
  return true;
}
function adjacent(values: GraphRelationshipRecord[], address: string, direction: TraversalDirection) { return values.filter((value) => (direction === "OUTGOING" || direction === "BOTH") && equalAddress(value.fromAddress, address) || (direction === "INCOMING" || direction === "BOTH") && equalAddress(value.toAddress, address)); }
function nextAddressFor(value: GraphRelationshipRecord, address: string, direction: TraversalDirection) { if ((direction === "OUTGOING" || direction === "BOTH") && equalAddress(value.fromAddress, address)) return value.toAddress; if ((direction === "INCOMING" || direction === "BOTH") && equalAddress(value.toAddress, address)) return value.fromAddress; return null; }
function compareRelationships(a: GraphRelationshipRecord, b: GraphRelationshipRecord) { return compareDecimal(b.amount, a.amount) || String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")) || a.transactionHash.localeCompare(b.transactionHash) || a.id.localeCompare(b.id); }
function comparePathEvidence(a: { edgeIds: string[] }, b: { edgeIds: string[] }, edges: Map<string, GraphRelationshipRecord>) { return Number(b.edgeIds.every((id) => evidenceComplete(edges.get(id)!))) - Number(a.edgeIds.every((id) => evidenceComplete(edges.get(id)!))); }
function evidenceComplete(value: GraphRelationshipRecord) { return Boolean(value.provider && value.sourceReference && value.rawReference && value.retrievedAt); }
function toGraphEdge(value: GraphRelationshipRecord): GraphEdge { return { id: value.id, chain: value.chain, transactionHash: value.transactionHash, fromAddress: value.fromAddress, toAddress: value.toAddress, relationshipType: value.relationshipType, asset: value.asset, amount: value.amount, tokenContract: value.tokenContract, timestamp: value.timestamp, blockNumber: value.blockNumber, status: value.executionStatus, evidence: { transactionHash: value.transactionHash, provider: value.provider, sourceReference: value.sourceReference, rawReference: value.rawReference, retrievedAt: value.retrievedAt, method: value.method, derivationSourceType: value.derivationSourceType } }; }
function makeNode(chain: string, address: string, nodeType: GraphNode["nodeType"], timestamp: string | null): GraphNode { return { id: nodeId(chain, address), chain, address, nodeType, firstSeen: timestamp, lastSeen: timestamp }; }
function nodeId(chain: string, address: string) { return `${chain}:${address.toLowerCase()}`; }
function equalAddress(left: string, right: string) { return left.toLowerCase() === right.toLowerCase(); }
function isDecimal(value: string) { return /^\d+(\.\d+)?$/.test(value); }
export function compareDecimal(left: string, right: string) { const [li, lf = ""] = left.split("."); const [ri, rf = ""] = right.split("."); const integer = BigInt(li) - BigInt(ri); if (integer !== 0n) return integer > 0n ? 1 : -1; const length = Math.max(lf.length, rf.length); const fraction = BigInt((lf.padEnd(length, "0") || "0")) - BigInt((rf.padEnd(length, "0") || "0")); return fraction === 0n ? 0 : fraction > 0n ? 1 : -1; }
