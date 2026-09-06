import { NotFoundError, ValidationFailureError } from "../../errors/app-error";
import type { CaseAuthorizationService } from "../../auth/case-authorization-service";
import type { RepositoryContext, TransactionCoordinator } from "../../repositories/repository-context";
import type { Actor, BitcoinTransactionRecord, ClusterInferenceInput } from "../../repositories/types";

const METHOD = "bitcoin-common-input-and-cautious-change";
const VERSION = "1.0.0";
export type ClusterRunResult = { status: "OK" | "INSUFFICIENT_DATA"; analyzedTransactions: number; inferences: Awaited<ReturnType<RepositoryContext["intelligence"]["upsertCluster"]>>[]; truncated: boolean };

export class BitcoinClusterInferenceService {
  constructor(private readonly repositories: RepositoryContext, private readonly transactions: TransactionCoordinator, private readonly authorization: CaseAuthorizationService) {}
  async analyze(actor: Actor, investigationId: string, maxTransactions = 50, requestId?: string): Promise<ClusterRunResult> {
    const investigation = await this.repositories.investigations.findAccessibleById(actor, investigationId);
    if (!investigation) throw new NotFoundError("Investigation not found.");
    await this.authorization.requireCaseAccess(actor, investigation.caseId, "CLUSTER_ANALYZE", requestId);
    if (investigation.chain !== "BITCOIN") throw new ValidationFailureError("Bitcoin clustering is available only for BITCOIN investigations.");
    if (!Number.isInteger(maxTransactions) || maxTransactions < 1 || maxTransactions > 100) throw new ValidationFailureError("maxTransactions must be an integer between 1 and 100.");
    const transactions = await this.repositories.blockchain.listBitcoinTransactions(investigation.caseId, maxTransactions + 1);
    const selected = transactions.slice(0, maxTransactions); const inferences = [] as ClusterRunResult["inferences"];
    await this.transactions.transaction(async (repositories) => { for (const transaction of selected) { const inference = inferBitcoinCluster(transaction); if (inference) inferences.push(await repositories.intelligence.upsertCluster(investigation.caseId, investigationId, inference)); } await repositories.audit.append({ caseId: investigation.caseId, actorId: actor.id, action: "BITCOIN_CLUSTER_ANALYSIS_EXECUTED", resourceType: "investigation", resourceId: investigationId, requestId: requestId ?? null, result: "SUCCESS", metadata: { transactionCount: selected.length, inferenceCount: inferences.length, maxTransactions, truncated: transactions.length > maxTransactions, method: METHOD, methodVersion: VERSION } }); });
    return { status: inferences.length ? "OK" : "INSUFFICIENT_DATA", analyzedTransactions: selected.length, inferences, truncated: transactions.length > maxTransactions };
  }
  async list(actor: Actor, investigationId: string, limit = 50, requestId?: string) {
    const investigation = await this.repositories.investigations.findAccessibleById(actor, investigationId);
    if (!investigation) throw new NotFoundError("Investigation not found.");
    await this.authorization.requireCaseAccess(actor, investigation.caseId, "INTELLIGENCE_READ", requestId);
    return this.repositories.intelligence.listClusters(investigation.caseId, investigationId, Math.min(Math.max(limit, 1), 100));
  }
}

/** Pure, deterministic, intentionally conservative heuristic; it creates inferences, never ownership facts. */
export function inferBitcoinCluster(transaction: BitcoinTransactionRecord): ClusterInferenceInput | null {
  const inputs = [...new Set(transaction.inputs.map((input) => input.address).filter((address): address is string => Boolean(address)))].sort();
  if (inputs.length < 2) return null;
  const outputs = transaction.outputs.filter((output) => output.address); const coinJoin = isCoinJoinLike(inputs.length, outputs);
  const evidence: Record<string, unknown>[] = [{ transactionHash: transaction.transactionHash, inputCount: inputs.length, outputCount: outputs.length, equalValueOutputCount: equalValueOutputCount(outputs), heuristic: "common-input" }];
  if (coinJoin) return { clusterKey: `bitcoin:${transaction.transactionHash}:common-input`, chain: "BITCOIN", method: METHOD, methodVersion: VERSION, confidenceLevel: "UNKNOWN", numericScore: 0, reviewStatus: "PENDING_REVIEW", ambiguityReason: "COINJOIN_LIKE_OR_EQUAL_VALUE_MULTI_OUTPUT", evidence, members: [] };
  const change = cautiousChangeCandidate(inputs, outputs);
  const members: ClusterInferenceInput["members"] = inputs.map((address) => ({ address, membershipType: "COMMON_INPUT", evidence }));
  if (change) members.push({ address: change.address, membershipType: "POSSIBLE_CHANGE", evidence: [{ transactionHash: transaction.transactionHash, heuristic: "output-asymmetry", caveat: "possible_change_not_ownership" }] });
  const confidenceLevel = inputs.length >= 3 && !change?.ambiguous ? "LIKELY" : "POSSIBLE";
  const numericScore = confidenceLevel === "LIKELY" ? 60 : 35;
  return { clusterKey: `bitcoin:${transaction.transactionHash}:common-input`, chain: "BITCOIN", method: METHOD, methodVersion: VERSION, confidenceLevel, numericScore, reviewStatus: "PENDING_REVIEW", ambiguityReason: change?.ambiguous ? "CHANGE_OUTPUT_AMBIGUOUS" : change ? "POSSIBLE_CHANGE_OUTPUT_REQUIRES_REVIEW" : null, evidence, members };
}
function isCoinJoinLike(inputCount: number, outputs: BitcoinTransactionRecord["outputs"]) { return inputCount >= 3 && outputs.length >= 3 && equalValueOutputCount(outputs) >= 3; }
function equalValueOutputCount(outputs: BitcoinTransactionRecord["outputs"]) { const counts = new Map<string, number>(); for (const output of outputs) counts.set(output.value, (counts.get(output.value) ?? 0) + 1); return Math.max(0, ...counts.values()); }
function cautiousChangeCandidate(inputs: string[], outputs: BitcoinTransactionRecord["outputs"]) { if (outputs.length !== 2) return null; const candidates = outputs.filter((output) => output.address && !inputs.some((input) => input.toLowerCase() === output.address!.toLowerCase())); if (candidates.length !== 2) return null; const [first, second] = candidates; if (first.value === second.value) return { address: first.address!, ambiguous: true }; const lesser = compareSatoshis(first.value, second.value) < 0 ? first : second; return { address: lesser.address!, ambiguous: true }; }
function compareSatoshis(left: string, right: string) { const difference = BigInt(left) - BigInt(right); return difference === 0n ? 0 : difference > 0n ? 1 : -1; }
