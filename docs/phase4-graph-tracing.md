# CASHNET Phase 4 — bounded transaction graph tracing

## Scope and source of truth

Phase 4 turns Phase-3 normalized, stored blockchain facts into a case-scoped graph. It does not call Etherscan, Esplora, TronGrid, Chainabuse, label datasets, or any intelligence service. Canonical source facts remain `blockchain_transactions`, `transaction_inputs`, `transaction_outputs`, `token_transfers`, and `contract_interactions`; `investigation_graph_relationships` is an idempotent, derived projection with full provenance.

## Model and derivation

Nodes are chain-qualified addresses (`CHAIN:lowercase-address`) and are typed only as `ADDRESS` or, when a recorded contract interaction supports it, `CONTRACT`. No person, criminal, entity, or VASP classification is inferred.

- EVM/TRON native records produce `TRANSFER` edges; a known recorded contract target produces `CONTRACT_INTERACTION`.
- ERC-20/TRC-20 facts produce `TOKEN_TRANSFER` edges retaining asset and token contract.
- Bitcoin input/output facts produce `UTXO_SPEND` projections. They are marked `INFERENCE` with method `bitcoin-utxo-input-output-projection`; this does not claim common ownership, change identification, or clustering.

Each edge retains transaction hash, block metadata, amount as PostgreSQL numeric/string (never JavaScript floating point), provider, source/raw references, retrieval time, and method.

## Traversal

`GET /api/v1/investigations/{id}/graph` performs deterministic in-process BFS over persisted relationships. The default direction is explicitly `OUTGOING`; `INCOMING` and `BOTH` are supported. Defaults are depth 2, 25 neighbors per node, 250 nodes, and 500 edges. Hard maxima are depth 5, 100 neighbors, 1,000 nodes, and 2,000 edges.

Time, amount, and asset filters are applied before traversal. Address visits are keyed by chain and address, so loops terminate. Neighbor order is deterministic: larger exact decimal amount, newer timestamp, transaction hash, then relationship ID. Paths rank by fewer hops, complete provenance, then lexical path identity. Results report limits, traversal counts, database query count, and explicit truncation reasons; missing stored history returns `INSUFFICIENT_DATA` rather than fetching unrelated provider data.

## Authorization, evidence, and observability

The route uses the existing development actor boundary, `INVESTIGATION_READ` permission, and centralized case membership authorization. Missing or inaccessible investigations remain non-enumerable through the existing authorization flow, which audits denials. Successful graph reads append `INVESTIGATION_GRAPH_QUERIED` with safe execution metrics. No provider credentials or raw secret values are logged.

## Performance and limitations

The initial implementation uses indexed PostgreSQL relationship reads and bounded in-process BFS; it does not introduce Neo4j. On this workspace on 2026-08-29, the deterministic five-edge two-hop Ethereum fixture completed in **12.3749 ms** as reported by the Node test harness (including fixture/assertion overhead). The graph response reports its own execution time, visited/returned counts, and one relationship-read query; this is not a production database benchmark. No live PostgreSQL/provider smoke test is claimed because this workspace has no configured authorized database or provider credentials. Historical Phase-3 rows collected before this migration need a future controlled backfill from retained canonical data where source address/value fields are available.

## Deferred interfaces

`AddressIntelligenceProvider` and `AbuseIntelligenceProvider` exist only as empty future extension contracts. Address labels, VASP attribution, Chainabuse, clustering, CoinJoin/change heuristics, AML/ML/GNN, and PS184 remain out of scope.
