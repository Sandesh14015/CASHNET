# CASHNET Phase 5 plan and implementation boundary

## Status and boundary

This document remains the Phase 5 design record. The bounded implementation is now committed in `3225be0`: it provides schema/repository/service/API support for approved local address-label observations, cautious Bitcoin inference, deterministic candidate evidence fusion, review records, RBAC, and audit. It imports no label dataset by default, makes no Chainabuse call, and does not identify a person. Phase 4 graph relationships remain evidence-backed blockchain observations or explicitly marked UTXO projections, not ownership claims.

## Goal

```text
Phase 4 graph → discovered address → reviewed address intelligence
  → entity-label evidence → separately-scored cluster evidence
  → exchange/deposit-pattern evidence → VASP candidate
  → evidence fusion → UNKNOWN / POSSIBLE / LIKELY / CONFIRMED
```

The output must never turn an address into a real-world person. It must remain a reviewable candidate with source, retrieval time, method, confidence, contradiction handling, and links to the Phase 4 path evidence.

## Inputs and source governance

| Source | Intended use | Required gate before use |
| --- | --- | --- |
| `crypto-wallet-address-labels` | Public address/entity/VASP label candidate | Dataset-level licence, freshness, provenance, normalization, and conflict review |
| `bitcoin-address-clustering` | Common-input/change/consolidation research | Treat as heuristic methodology; historical-data and false-positive evaluation |
| `mev-wallet-cluster-analysis` | Ethereum relationship and evidence-discipline methodology | Case-study review; no automatic CEX/VASP conclusion |
| Chainabuse | Future public abuse-report evidence | Terms, API authorization, source reliability, retention, and human-review policy |
| `am-i-exposed` | Bitcoin tracing concepts | Methodology only; no direct operational import |
| ChainForensics | UTXO and temporal methodology | **AGPL-3.0 reference only; no source copying without an explicit licence decision** |
| OpenAML | Later governed AML/risk research | Separate model/data/evaluation governance |

No source becomes production truth merely because it is public or present in `references/`. Import jobs must preserve source URL/reference, dataset version, licence, retrieval date, hash, transformation method, and reviewer decision.

## Implemented architecture

1. `AddressIntelligenceProvider`, `BitcoinClusterInferenceService`, and `VaspCandidateService` are implemented with repository ports.
2. Store source-labelled observations separately from normalized blockchain facts and derived relationships.
3. Require a case-authorized investigation and `INTELLIGENCE_READ`/`INTELLIGENCE_EXECUTE`-style permissions proposed through a Phase 5 RBAC migration.
4. Produce immutable evidence records and audit each lookup/import/scoring action.
5. Keep a human decision state distinct from an automated confidence score.

## Explainable first algorithms

### Address intelligence

Input: `(chain, address)`. Lookup only approved sources. Output: zero or more source observations with label text, source identity, provenance, confidence, and expiry/freshness status. Exact address matching is not entity verification.

### Bitcoin clustering

Store heuristic outputs as **inferences**, not facts. Common-input and change-address signals must include exclusions for CoinJoin-like structures, ambiguous change outputs, multi-party transactions, and insufficient data. A cluster should have a stable versioned method, member evidence, score, and reviewer status. No direct link from a Bitcoin cluster to a person is allowed.

### VASP candidate scoring

Use deterministic, explainable evidence fusion only: approved public label match, Phase 4 graph proximity, bounded trace path, observed deposit-like behavior, source agreement, and approved abuse-report evidence. Penalize stale, conflicting, ambiguous, or inferred-only evidence. Map the result to `UNKNOWN`, `POSSIBLE`, `LIKELY`, or `CONFIRMED`; `CONFIRMED` must require an explicit institutional evidence policy and human review.

### Deferred algorithms

Community detection, Louvain, Leiden, graph ML, and GNN are explicitly deferred until deterministic evidence, data governance, evaluation datasets, and false-positive controls are established.

## Delivery and pending validation

1. Completed: schema/migration ledger, repository ports, RBAC, audit, approved-local label adapter, bounded inference, deterministic scorer, OpenAPI, and 25 tests.
2. Pending: dataset-level licence/provenance/retention approval, configured clean PostgreSQL migration, and controlled live source validation.
3. Deferred: Chainabuse onboarding, graph ML/GNN, ML, PS184, and any real-world identity workflow.

## Non-goals

No private-key handling, wallet control, transaction broadcast, real-person attribution, hidden surveillance, unreviewed dataset import, automatic enforcement, ML/GNN, or PS184 belongs in the first Phase 5 release.
