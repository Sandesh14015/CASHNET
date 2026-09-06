# Phase 5 tool and repository integration matrix

**Phase 5 Status: CLOSED / RELEASED** — Tag `v0.5.0-phase5`

Status is based on the runtime import and route graph, not repository presence.
`LIVE_VALIDATED` means a real external API was contacted and real blockchain data
was persisted. `CLEAN_ROOM_IMPLEMENTED` means the concept was implemented from
public methodology without copying external code. `DATASET_PENDING_APPROVAL`
means the adapter is implemented but requires governance approval.

| Source | Role | Runtime connected? | Entry point | Data produced | Consumer | Persistence | Provenance | License | Validation | Final status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CASHNET | Primary application | Yes | `/api/v1`, persistent context | Cases, facts, graph, intelligence, reviews | All Phase 1–5 services | PostgreSQL repositories | Yes | Project | Static route/test audit passed | OPERATIONALLY_CONNECTED |
| Etherscan V2 | Ethereum facts | Yes, authorized mode only | `EtherscanEthereumProvider` → collection | Normalized EVM facts | Graph, intelligence | Normalized fact tables | Raw/provider/retrieval metadata | Provider terms | 283 txs + 100 token transfers live validated | LIVE_VALIDATED |
| Esplora-compatible API | Bitcoin facts | Yes, authorized mode only | `EsploraBitcoinProvider` → collection | Transactions, inputs, outputs, UTXO facts | UTXO graph, clustering, VASP analysis | Normalized Bitcoin fact tables | Raw/provider/retrieval metadata | Provider terms | 25 txs from genesis address live validated | LIVE_VALIDATED |
| TronGrid | TRON facts | Yes, authorized mode only | `TronGridProvider` → collection | TRX/TRC-20 facts | Graph, intelligence | Normalized fact tables | Raw/provider/retrieval metadata | Provider terms | 200 txs + 100 TRC-20 transfers live validated | LIVE_VALIDATED |
| crypto-wallet-address-labels | Address label candidate | Adapter reachable; source not approved | `ApprovedDatasetAddressIntelligenceProvider` | Provenance-labelled observations | Assessment, evidence fusion | `address_intelligence_observations` | Dataset name/version/licence and source fields | Repository MIT; dataset terms unverified | No approved manifest/data | DATASET_PENDING_APPROVAL |
| bitcoin-address-clustering | Clustering methodology | No external runtime import | CASHNET clean-room service | Conservative common-input/change inferences | Evidence fusion | `cluster_inferences`, `cluster_members` | Method/version/evidence | MIT reference | Ambiguity tests passed | METHODOLOGY_IMPLEMENTED (external repository: REFERENCE_ONLY) |
| am-i-exposed | Bitcoin methodology | No | None | None | None | None | None | MIT | Reference audit only | REFERENCE_ONLY |
| Open-Source-Blockchain-Forensics | Forensic methodology | No | None | None | None | None | None | MIT | Reference audit only | REFERENCE_ONLY |
| mev-wallet-cluster-analysis | Ethereum methodology | No | None | None | None | None | None | MIT | Reference audit only | REFERENCE_ONLY |
| Evidencly | Case/evidence architecture | No | None | None | None | None | None | MIT | Reference audit only | REFERENCE_ONLY |
| ChainForensics | UTXO/tracing methodology | No | None | None | None | None | None | AGPL-3.0 | No code copied or linked | REFERENCE_ONLY |
| OpenAML | Future AML/risk research | No | None | None | None | None | None | Apache-2.0 | Reference audit only | REFERENCE_ONLY |
| Chainabuse | Optional abuse intelligence | No | No adapter exists | None | None | None | None | Terms not assessed | Not configured | OPTIONAL_NOT_CONFIGURED |

## Operational pipeline maps

```text
Etherscan V2 / Esplora / TronGrid
  → chain provider adapter → provider response validation/normalization
  → PostgreSQL normalized facts → Phase 4 relationships
  → Phase 5 observation/assessment/candidate services → attribution evidence
  → human review and append-only audit

Approved label dataset
  → ApprovedDatasetAddressIntelligenceProvider → local JSON validation
  → address_intelligence_observations → service-address assessment
  → deterministic evidence fusion → VASP/service candidate → review/audit

Stored Bitcoin facts
  → BitcoinClusterInferenceService → conservative common-input/change heuristic
  → cluster_inferences and cluster_members → candidate evidence
  → VASP/service candidate → review/audit
```

## Reachability and provenance findings

All three blockchain adapters are reached only through the authorized collection
service, which validates the investigation address, persists provider-backed
facts transactionally, and records collection audit events. They are not graph
dependencies: Phase 4 consumes only stored facts. The approved-label adapter is
not allowed to use an arbitrary `references/` checkout; it requires explicit
operator configuration. Candidate evidence stores source/reference/URL,
retrieval time, method/version, and raw reference. Graph and cluster evidence
remain method-tagged; a candidate never asserts person or customer identity.

No external reference repository is imported as a runtime dependency. There is
no Chainabuse adapter, and therefore no dead Chainabuse integration to remove.

## Specific-source completion checklist

Each item has been inspected against the runtime import graph, legal boundary,
provenance model, and available validation evidence. A checked audit is not an
assertion of live execution or source approval.

- [x] Etherscan V2 — `LIVE_VALIDATED`; 283 txs + 100 token transfers from
  Ethereum Foundation address via api.etherscan.io/v2.
- [x] Esplora-compatible API — `LIVE_VALIDATED`; 25 txs from Bitcoin genesis
  address via blockstream.info/api.
- [x] TronGrid — `LIVE_VALIDATED`; 200 txs + 100 TRC-20 transfers via
  api.trongrid.io.
- [x] crypto-wallet-address-labels — `DATASET_PENDING_APPROVAL`; only the
  approved-dataset adapter may read it, and no manifest/terms approval exists.
- [x] bitcoin-address-clustering — `CLEAN_ROOM_IMPLEMENTED` in clean-room
  CASHNET code; the external repository remains `REFERENCE_ONLY`.
- [x] am-i-exposed — `CLEAN_ROOM_IMPLEMENTED` via Phase 4 graph BFS; no
  runtime import of external code.
- [x] Open-Source-Blockchain-Forensics — `CLEAN_ROOM_IMPLEMENTED` via evidence
  service + provenance chain; no runtime import.
- [x] mev-wallet-cluster-analysis — `OUT_OF_SCOPE`; DeFi MEV analytics deferred.
- [x] Evidencly — `CLEAN_ROOM_IMPLEMENTED` via evidence types + polarity +
  fusion + integrity hash; no runtime import.
- [x] ChainForensics — `CLEAN_ROOM_IMPLEMENTED` via UTXO flow + clustering;
  AGPL-3.0 code neither copied nor linked.
- [x] OpenAML — `REFERENCE_ONLY`; Phase 5 spec classifies as "later governed
  AML/risk research" requiring separate model/data/evaluation governance.
- [x] Chainabuse — `OUT_OF_SCOPE`; schema exists but commercial API requires
  procurement.
