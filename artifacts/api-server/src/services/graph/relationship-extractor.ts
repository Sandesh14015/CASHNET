import type { GraphRelationshipInput } from "../../repositories/types";
import type { NormalizedTransactionBundle } from "../blockchain/types";

/** Canonical symbols for native transfers only. Token transfers retain the
 * asset supplied by their chain-specific normalizer. */
const nativeAsset: Record<string, string> = {
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  TRON: "TRX",
  BNB_CHAIN: "BNB",
  POLYGON: "POL",
  SOLANA: "SOL",
};

/** Converts one normalized, already-collected fact bundle into traceable relationships. */
export function extractRelationships(bundle: NormalizedTransactionBundle): GraphRelationshipInput[] {
  const { transaction, tokenTransfers, contractInteractions } = bundle;
  const provenance = transaction.provenance;
  const common = { chain: transaction.chain, transactionHash: transaction.transactionHash, blockNumber: transaction.blockNumber ?? null, timestamp: transaction.timestamp ?? null, executionStatus: transaction.executionStatus ?? null, provider: provenance.provider, sourceReference: provenance.sourceReference ?? null, rawReference: provenance.rawReference ?? null, retrievedAt: provenance.retrievedAt, method: provenance.method };
  const relationships: GraphRelationshipInput[] = [];
  if (transaction.chain === "BITCOIN") {
    for (const input of transaction.inputs) for (const output of transaction.outputs) {
      if (!input.address || !output.address || input.address.toLowerCase() === output.address.toLowerCase()) continue;
      relationships.push({ ...common, fromAddress: input.address, toAddress: output.address, relationshipType: "UTXO_SPEND", asset: "BTC", amount: output.value, tokenContract: null, derivationSourceType: "INFERENCE", method: "bitcoin-utxo-input-output-projection" });
    }
  } else if (transaction.from && transaction.to) {
    const isContract = contractInteractions.some((item) => item.contractAddress.toLowerCase() === transaction.to!.toLowerCase());
    relationships.push({ ...common, fromAddress: transaction.from, toAddress: transaction.to, relationshipType: isContract ? "CONTRACT_INTERACTION" : "TRANSFER", asset: nativeAsset[transaction.chain] ?? transaction.chain, amount: transaction.value ?? "0", tokenContract: null, derivationSourceType: "API" });
  }
  for (const transfer of tokenTransfers) {
    const source = transfer.provenance;
    relationships.push({ chain: transfer.chain, transactionHash: transfer.transactionHash, fromAddress: transfer.from, toAddress: transfer.to, relationshipType: "TOKEN_TRANSFER", asset: transfer.asset, amount: transfer.amount, tokenContract: transfer.contractAddress ?? null, blockNumber: transaction.blockNumber ?? null, timestamp: transaction.timestamp ?? null, executionStatus: transaction.executionStatus ?? null, derivationSourceType: "API", provider: source.provider, sourceReference: source.sourceReference ?? null, rawReference: source.rawReference ?? null, retrievedAt: source.retrievedAt, method: source.method });
  }
  return uniqueRelationships(relationships);
}

function uniqueRelationships(values: GraphRelationshipInput[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = [value.chain, value.transactionHash, value.fromAddress.toLowerCase(), value.toAddress.toLowerCase(), value.relationshipType, value.asset, value.amount, value.tokenContract ?? ""].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
