import type { GraphRelationshipRecord } from "../../repositories/types";

/**
 * Community Detection Service
 *
 * Deterministic connected-component analysis on stored graph relationships.
 * No random algorithms (no Louvain, no stochastic label propagation) in initial version.
 *
 * IMPORTANT:
 * - A community is a structural observation, never an attribution of criminal activity.
 * - Community membership does not imply common ownership.
 * - Bridge interactions do NOT prove common ownership.
 */

const METHOD = "cashnet-community-detection";
const METHOD_VERSION = "1.0.0";

export interface Community {
  communityId: string;
  members: string[];
  memberCount: number;
  edgeCount: number;
  chains: string[];
  method: string;
  methodVersion: string;
  confidence: "STRUCTURAL" | "INFERRED";
  explanation: string;
}

export interface CommunityDetectionResult {
  communities: Community[];
  isolatedNodes: string[];
  totalNodes: number;
  totalEdges: number;
  method: string;
  methodVersion: string;
}

// ── Bounded Execution Limits ────────────────────────────────────────────────

export interface CommunityDetectionOptions {
  maxNodes?: number;
  maxEdges?: number;
  maxCommunities?: number;
  maxExecutionMs?: number;
}

const DEFAULTS: Required<CommunityDetectionOptions> = {
  maxNodes: 10_000,
  maxEdges: 50_000,
  maxCommunities: 500,
  maxExecutionMs: 5_000,
};

// ── Union-Find for Connected Components ─────────────────────────────────────

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); }
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression
    let current = x;
    while (current !== root) { const next = this.parent.get(current)!; this.parent.set(current, root); current = next; }
    return root;
  }

  union(x: string, y: string): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    const rankX = this.rank.get(rx)!;
    const rankY = this.rank.get(ry)!;
    if (rankX < rankY) { this.parent.set(rx, ry); }
    else if (rankX > rankY) { this.parent.set(ry, rx); }
    else { this.parent.set(ry, rx); this.rank.set(rx, rankX + 1); }
  }

  components(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const group = groups.get(root) ?? [];
      group.push(key);
      groups.set(root, group);
    }
    return groups;
  }
}

// ── Service ─────────────────────────────────────────────────────────────────

export class CommunityDetectionService {
  detectCommunities(
    edges: GraphRelationshipRecord[],
    options: CommunityDetectionOptions = {},
  ): CommunityDetectionResult {
    const opts = { ...DEFAULTS, ...options };
    const startMs = Date.now();

    // Enforce bounded execution
    const boundedEdges = edges.slice(0, opts.maxEdges);

    // Collect all unique addresses
    const allAddresses = new Set<string>();
    for (const edge of boundedEdges) {
      allAddresses.add(edge.fromAddress.toLowerCase());
      allAddresses.add(edge.toAddress.toLowerCase());
      if (allAddresses.size > opts.maxNodes) break;
    }

    // Union-Find connected components
    const uf = new UnionFind();
    for (const edge of boundedEdges) {
      if (Date.now() - startMs > opts.maxExecutionMs) break;
      uf.union(edge.fromAddress.toLowerCase(), edge.toAddress.toLowerCase());
    }

    const componentMap = uf.components();

    // Build community results
    const communities: Community[] = [];
    const isolatedNodes: string[] = [];
    let communityIndex = 0;

    for (const [_root, members] of componentMap) {
      if (communityIndex >= opts.maxCommunities) break;

      if (members.length === 1) {
        isolatedNodes.push(members[0]);
        continue;
      }

      const memberSet = new Set(members);
      const communityEdges = boundedEdges.filter(
        (e) => memberSet.has(e.fromAddress.toLowerCase()) && memberSet.has(e.toAddress.toLowerCase())
      );
      const chains = [...new Set(communityEdges.map((e) => e.chain))];

      communities.push({
        communityId: `community-${communityIndex}`,
        members,
        memberCount: members.length,
        edgeCount: communityEdges.length,
        chains,
        method: METHOD,
        methodVersion: METHOD_VERSION,
        confidence: "STRUCTURAL",
        explanation: `Connected component of ${members.length} addresses with ${communityEdges.length} edges across ${chains.join(", ")}. Structural connectivity does NOT imply common ownership or criminal association.`,
      });
      communityIndex++;
    }

    return {
      communities,
      isolatedNodes,
      totalNodes: allAddresses.size,
      totalEdges: boundedEdges.length,
      method: METHOD,
      methodVersion: METHOD_VERSION,
    };
  }
}
