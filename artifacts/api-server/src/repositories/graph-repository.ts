import type { GraphRelationshipInput, GraphRelationshipRecord } from "./types";

/** Read model for derived graph relationships. Canonical blockchain facts remain authoritative. */
export interface GraphRepository {
  upsertDerivedRelationships(caseId: string, relationships: GraphRelationshipInput[]): Promise<void>;
  listByCaseAndChain(caseId: string, chain: string, limit?: number): Promise<GraphRelationshipRecord[]>;
}
