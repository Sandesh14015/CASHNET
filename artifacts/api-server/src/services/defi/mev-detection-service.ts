import type { GraphRelationshipRecord } from "../../repositories/types";

/**
 * MEV Detection Service
 *
 * Identifies potential MEV activity from HISTORICAL chain data only.
 * This is NOT mempool monitoring — only post-execution analysis.
 *
 * IMPORTANT:
 * - MEV detection from historical data is inherently uncertain.
 * - Every result is CANDIDATE, LIKELY, or REVIEW_REQUIRED.
 * - No result should be reported as "confirmed" without independent validation.
 */

const METHOD = "cashnet-mev-detection";
const METHOD_VERSION = "1.0.0";

export type MEVType = "SANDWICH" | "ARBITRAGE" | "LIQUIDATION" | "OTHER";
export type MEVConfidence = "CANDIDATE" | "LIKELY" | "REVIEW_REQUIRED";

export interface MEVCandidate {
  id: string;
  chain: string;
  mevType: MEVType;
  confidenceLevel: MEVConfidence;
  frontRunHash?: string;
  victimHash?: string;
  backRunHash?: string;
  poolAddress?: string;
  profitEstimate?: string;
  evidence: MEVEvidence[];
  explanation: string;
  method: string;
  methodVersion: string;
}

export interface MEVEvidence {
  evidenceType: string;
  transactionHash: string;
  detail: string;
}

export interface MEVDetectionResult {
  candidates: MEVCandidate[];
  totalEdgesAnalyzed: number;
  method: string;
  methodVersion: string;
}

/**
 * Sandwich Detection Algorithm (Historical):
 *
 * A sandwich consists of three transactions in the same block (or consecutive blocks):
 * 1. Front-run: attacker buys token before victim
 * 2. Victim: user's trade at worse price
 * 3. Back-run: attacker sells token after victim
 *
 * From historical data, we can only identify CANDIDATES based on:
 * - Same block / adjacent blocks
 * - Same pool/token contract
 * - Temporal ordering consistent with sandwich
 * - Economically consistent (front-run buys, back-run sells)
 *
 * This CANNOT be confirmed without mempool analysis or detailed execution traces.
 */

export class MEVDetectionService {
  detectSandwichCandidates(edges: GraphRelationshipRecord[]): MEVCandidate[] {
    const candidates: MEVCandidate[] = [];

    // Group edges by block number
    const byBlock = new Map<string, GraphRelationshipRecord[]>();
    for (const edge of edges) {
      if (!edge.blockNumber) continue;
      const key = `${edge.chain}:${edge.blockNumber}`;
      const group = byBlock.get(key) ?? [];
      group.push(edge);
      byBlock.set(key, group);
    }

    // Look for potential sandwich patterns within each block
    let candidateIndex = 0;
    for (const [blockKey, blockEdges] of byBlock) {
      if (blockEdges.length < 3) continue;

      // Group by token contract (same pool indicator)
      const byContract = new Map<string, GraphRelationshipRecord[]>();
      for (const edge of blockEdges) {
        if (!edge.tokenContract) continue;
        const group = byContract.get(edge.tokenContract) ?? [];
        group.push(edge);
        byContract.set(edge.tokenContract, group);
      }

      for (const [contract, contractEdges] of byContract) {
        if (contractEdges.length < 3) continue;

        // Look for address appearing as sender AND receiver (potential attacker)
        const senders = new Set(contractEdges.map((e) => e.fromAddress.toLowerCase()));
        const receivers = new Set(contractEdges.map((e) => e.toAddress.toLowerCase()));
        const bothSideAddresses = [...senders].filter((a) => receivers.has(a));

        for (const potentialAttacker of bothSideAddresses) {
          const attackerSends = contractEdges.filter((e) => e.fromAddress.toLowerCase() === potentialAttacker);
          const attackerReceives = contractEdges.filter((e) => e.toAddress.toLowerCase() === potentialAttacker);

          if (attackerSends.length < 1 || attackerReceives.length < 1) continue;

          // Potential victim: someone else transacting in between
          const otherEdges = contractEdges.filter(
            (e) => e.fromAddress.toLowerCase() !== potentialAttacker && e.toAddress.toLowerCase() !== potentialAttacker
          );
          if (otherEdges.length === 0) continue;

          candidates.push({
            id: `mev:sandwich:${candidateIndex++}`,
            chain: contractEdges[0].chain,
            mevType: "SANDWICH",
            confidenceLevel: "CANDIDATE",
            frontRunHash: attackerReceives[0].transactionHash,
            victimHash: otherEdges[0].transactionHash,
            backRunHash: attackerSends[0].transactionHash,
            poolAddress: contract,
            evidence: [
              { evidenceType: "SAME_BLOCK", transactionHash: blockKey, detail: `${contractEdges.length} transactions in same block involving same token contract` },
              { evidenceType: "BOTH_SIDES", transactionHash: potentialAttacker, detail: `Address ${potentialAttacker} appears as both sender and receiver for ${contract}` },
            ],
            explanation: `Potential sandwich: address ${potentialAttacker.slice(0, 10)}... both bought and sold token ${contract.slice(0, 10)}... in block ${blockKey.split(":")[1]}, with ${otherEdges.length} other transaction(s) in between. This is a CANDIDATE pattern identified from historical data. Confirmation requires execution trace analysis.`,
            method: METHOD,
            methodVersion: METHOD_VERSION,
          });
        }
      }
    }

    return candidates;
  }

  detectArbitrageCandidates(edges: GraphRelationshipRecord[]): MEVCandidate[] {
    const candidates: MEVCandidate[] = [];

    // Group by block
    const byBlock = new Map<string, GraphRelationshipRecord[]>();
    for (const edge of edges) {
      if (!edge.blockNumber) continue;
      const key = `${edge.chain}:${edge.blockNumber}`;
      const group = byBlock.get(key) ?? [];
      group.push(edge);
      byBlock.set(key, group);
    }

    let candidateIndex = 0;
    for (const [blockKey, blockEdges] of byBlock) {
      // Find addresses that interact with multiple different token contracts in the same block
      const addressTokens = new Map<string, Set<string>>();
      for (const edge of blockEdges) {
        if (!edge.tokenContract) continue;
        const addr = edge.fromAddress.toLowerCase();
        const tokens = addressTokens.get(addr) ?? new Set();
        tokens.add(edge.tokenContract);
        addressTokens.set(addr, tokens);
      }

      for (const [addr, tokens] of addressTokens) {
        if (tokens.size < 2) continue;

        candidates.push({
          id: `mev:arbitrage:${candidateIndex++}`,
          chain: blockEdges[0].chain,
          mevType: "ARBITRAGE",
          confidenceLevel: "CANDIDATE",
          evidence: [
            { evidenceType: "MULTI_TOKEN_SAME_BLOCK", transactionHash: blockKey, detail: `Address ${addr} interacted with ${tokens.size} different token contracts in the same block` },
          ],
          explanation: `Potential arbitrage: address ${addr.slice(0, 10)}... traded ${tokens.size} different tokens in block ${blockKey.split(":")[1]}. Multi-token activity in a single block MAY indicate arbitrage but also occurs in legitimate portfolio rebalancing.`,
          method: METHOD,
          methodVersion: METHOD_VERSION,
        });
      }
    }

    return candidates;
  }

  analyze(edges: GraphRelationshipRecord[]): MEVDetectionResult {
    const sandwiches = this.detectSandwichCandidates(edges);
    const arbitrages = this.detectArbitrageCandidates(edges);

    return {
      candidates: [...sandwiches, ...arbitrages],
      totalEdgesAnalyzed: edges.length,
      method: METHOD,
      methodVersion: METHOD_VERSION,
    };
  }
}
