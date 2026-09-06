# Phase 5 operational validation roadmap

## Reconciled execution flow

```text
Phase 3 stored provider facts
  → Phase 4 bounded case graph
  → discovered address
  → approved local address-label observation
  → Bitcoin-only cautious cluster inference
  → service-address assessment
  → deterministic evidence fusion
  → VASP/service candidate
  → human review
  → append-only audit and reproducible evaluation
```

The repository matrix supplies the inputs and legal boundaries; the operational-validation brief supplies the quality gate. CASHNET consumes stored facts and never makes the candidate engine rescan a provider.

## Current validation status

| Gate | Status | Evidence |
| --- | --- | --- |
| PostgreSQL migration/persistence | HISTORICAL / SUPERSEDED | This pre-Supabase roadmap recorded an earlier local validation constraint. It is not a current runtime configuration or a reason to use local PostgreSQL. The authoritative current target is Supabase; see [supabase-database-operations.md](supabase-database-operations.md). |
| Etherscan V2 / Esplora / TronGrid live read | PENDING_VALIDATION | No authorized provider configuration is present. |
| Approved address-label dataset | DATASET_PENDING_APPROVAL | Adapter is implemented but no dataset manifest/path/licence approval is configured. |
| Controlled rule/metric regression | IMPLEMENTED | Deterministic tests plus `evaluate-phase5` held-out metric utility. |
| Human review | IMPLEMENTED | `POST /api/v1/investigations/:id/vasp-candidates/:candidateId/review`. |
| Legacy synthetic `/api/*` regression | PASS | Existing live process returned HTTP 200 from `/api/healthz` and `/api/dashboard`. |
| Local bounded performance sample | PASS (non-production) | Twenty v1-health requests completed in 155.56 ms total. |
| Phase 5 production-like quality gate | VALIDATION_INCOMPLETE | Reproducible database/source/ground-truth evidence is required. |

The earlier local PostgreSQL constraint above is retained only to explain this
historical roadmap. CASHNET's current runtime and migration target is Supabase
PostgreSQL; it has no local-database fallback. The candidate engine was also
corrected so graph evidence is calculated from the candidate address's own
stored relationships, not the investigation-wide edge count.

On 2026-08-30 the API production bundle passed in 1.602 s when the project’s existing esbuild command was allowed normal local filesystem access. This does not satisfy the live-data quality gates.

## Required tool and repository status

| Tool / repository | Status | Actual use |
| --- | --- | --- |
| CASHNET Phase 4 graph | OPERATIONALLY_CONNECTED | Case-scoped stored relationship input to Phase 5. |
| Etherscan V2 | IMPLEMENTED_PENDING_LIVE_VALIDATION | Existing Phase 3 adapter; no live credentials validated here. |
| Esplora-compatible API | IMPLEMENTED_PENDING_LIVE_VALIDATION | Existing Phase 3 adapter; no approved live endpoint validated here. |
| TronGrid | IMPLEMENTED_PENDING_LIVE_VALIDATION | Existing Phase 3 adapter; no live credentials validated here. |
| `crypto-wallet-address-labels` | DATASET_PENDING_APPROVAL | Local approved-dataset adapter exists; no dataset was approved/imported. |
| `bitcoin-address-clustering` | METHODOLOGY_IMPLEMENTED | Clean-room common-input/cautious-change methodology only; external repository remains REFERENCE_ONLY. |
| `am-i-exposed` | REFERENCE_ONLY | Bitcoin tracing methodology. |
| Open-Source-Blockchain-Forensics | REFERENCE_ONLY | Forensic/evidence methodology. |
| `mev-wallet-cluster-analysis` | REFERENCE_ONLY | Ethereum relationship/evidence methodology. |
| Evidencly | REFERENCE_ONLY | Case/evidence workflow methodology. |
| ChainForensics | REFERENCE_ONLY | AGPL-3.0; no code copied. |
| OpenAML | REFERENCE_ONLY | Later AML/risk evaluation concepts. |
| Chainabuse | OPTIONAL_NOT_CONFIGURED | No adapter, request, data, or dependency. |

The precise static runtime/import audit is maintained in
[phase5-tool-integration-matrix.md](phase5-tool-integration-matrix.md).

## Controlled validation procedure

1. Provision an isolated PostgreSQL database and run the complete migration ledger.
2. Configure one approved read-only provider and collect a public address into an authorized case.
3. Register an approved, versioned local dataset manifest; do not point the adapter at a repository directory.
4. Exercise lookup, cluster, candidate, review, audit, and cross-case denial paths.
5. Keep a held-out ground-truth JSON set outside the source dataset. Run:

```powershell
pnpm --filter @workspace/scripts run evaluate-phase5 <held-out-evaluation.json>
```

6. Record environment, source versions, method versions, retrieval times, and resulting metrics. Do not create a release tag until all quality gates pass.

The current release decision is authoritative in
[phase5-final-validation.md](phase5-final-validation.md).
