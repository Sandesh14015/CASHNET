# CASHNET Phase 4 final validation and complete status

Validation date: 2026-08-29. Source checkpoint: `51d9cee` / `v0.4.0-phase4`.

## Git and publication

The immutable Phase 4 implementation commit is `51d9cee2e0eac2c2ed9a3ddc53bee9823eea2181`; cached `origin/main` resolved to that commit during verification, and the local annotated tag `v0.4.0-phase4` resolves to `308f6ce627f652e15301b9e52b3232b22a975c03`. The subsequent documentation checkpoint(s) intentionally advance local `main` beyond that cached remote commit and must be pushed normally. A live `git fetch`/`git ls-remote` could not authenticate on this Windows host (`SEC_E_NO_CREDENTIALS`), so remote branch/tag verification is **pending Git credential availability**. No force-push or history rewrite was attempted. The local worktree has a pre-existing untracked `opencode.json`, deliberately left unmodified.

## Phase 4 review

The graph engine consumes only `GraphRepository.listByCaseAndChain`; it has no provider import or external-fetch path. `extractRelationships` derives idempotent case-scoped records when normalized Phase 3 bundles persist. The persisted graph table retains chain, transaction hash, addresses, relationship type, asset/amount, block/timestamp/status, provider/source/raw references, retrieval time, derivation type, and method.

`GraphTracingService` resolves an accessible investigation, enforces `INVESTIGATION_READ` through the central case authorization service, reads one chain/case relationship set, invokes pure bounded BFS, appends `INVESTIGATION_GRAPH_QUERIED`, and emits structured non-secret metrics. A missing/inaccessible investigation follows the existing non-enumerating not-found authorization behavior.

## Deterministic end-to-end fixture results

| Scenario | Result |
| --- | --- |
| Ethereum WA → WB/WC/WD; WB → WE; WC → WF at depth 2 | 6 nodes, 5 paths, evidence on every returned edge |
| Incoming + exact decimal/asset filters | Returned only eligible nodes/edges |
| WA → WB → WC → WA cycle | Terminated with 3 nodes |
| Fan-out capped at one neighbor | Returned truncation reason `MAX_NEIGHBORS_PER_NODE_REACHED` |
| Bitcoin UTXO projection | Returned `UTXO_SPEND` as `INFERENCE`, without ownership/clustering claim |

The Node test harness measured the five-edge two-hop fixture at **12.3749 ms**, including fixture construction and assertions. The graph response exposes construction/traversal metadata, one relationship-read query in the service flow, visited/returned counts, and truncation fields. This is a deterministic unit-fixture measurement, not a live PostgreSQL throughput benchmark.

## Real-data validation

**REAL-DATA VALIDATION = PENDING.** No `DATABASE_URL`, Etherscan key, approved Esplora endpoint, TronGrid key, local `.env`, `psql`, or Docker command was available. Therefore no migration, provider collection, or public-wallet tracing was executed against live infrastructure, and no result was fabricated.

## API inventory

| Boundary | Methods and paths | Auth/authorization | Implementation |
| --- | --- | --- | --- |
| Legacy `/api` | `GET /healthz`, dashboard, cases, case detail, fund-flow, wallets, predictions, interventions, reports; `POST` cases, analysis, complaint, intervention, approval | Legacy synthetic workflow; not v1 actor-authenticated | `SyntheticCaseService`; no persistent graph path |
| `/api/v1` platform | `GET /health`, `/version` | Public status only | Version/config response |
| `/api/v1/cases` | list/create/get/update; `GET /cases/:id/audit` | Development actor, permissions, case membership | Case/audit services and PostgreSQL repositories |
| `/api/v1/investigations` | create, wallet subject, get, transition, collect | Actor, permission, membership, approved status for collection | Investigation and collection services |
| `/api/v1/investigations/:id/graph` | `GET` with depth, direction, limits, amount, asset, and time filters | Actor + `INVESTIGATION_READ` + centralized case access | Graph repository + bounded BFS; no provider call |
| `/api/v1/evidence` | create/get | Actor, case authorization | Evidence service/repository |
| `/api/v1/wallets/:chain/:address`, `/transactions/:chain/:txHash` | `GET` | Development actor; provider service | Authorized provider-read boundary, not graph execution |

All v1 inputs use route Zod parsing; service errors use the common error middleware and request IDs. OpenAPI is `lib/api-spec/openapi.yaml`, with regenerated React and Zod artifacts.

## Actual tool/repository integration

| Tool/repository | Purpose | Phase | Actual status |
| --- | --- | --- | --- |
| Etherscan V2 | Ethereum collection | 3 | IMPLEMENTED adapter; live credentials pending |
| Blockstream Esplora-compatible | Bitcoin collection | 3 | IMPLEMENTED adapter; approved endpoint pending |
| TronGrid | TRON collection | 3 | IMPLEMENTED adapter; live key pending |
| Evidencly | Evidence/case/graph architecture reference | 0 | REFERENCE ONLY |
| am-i-exposed | Bitcoin tracing methodology | 0 | REFERENCE ONLY |
| bitcoin-address-clustering | Clustering methodology | 0 | REFERENCE ONLY / Phase 5 input |
| Open-Source-Blockchain-Forensics | Investigation architecture concepts | 0 | REFERENCE ONLY |
| crypto-wallet-address-labels | Future label-data candidate | 0 | PLANNED, not imported |
| mev-wallet-cluster-analysis | Ethereum methodology | 0 | REFERENCE ONLY |
| ChainForensics | UTXO/temporal methodology | 0 | REFERENCE ONLY; AGPL-3.0, no copied code |
| OpenAML | Later AML/risk research | 0 | REFERENCE ONLY |
| Chainabuse | Future abuse-intelligence source | 5 | NOT USED |

## Current stack

- Runtime: Node.js, TypeScript `~5.9.3`, pnpm workspace.
- API: Express `^5.2.1`, Zod catalog `^3.25.76`, Pino `^9.14.0`, Pino HTTP `^10.5.0`, CORS, cookie-parser.
- Database: PostgreSQL through `pg ^8.22.0`, Drizzle ORM catalog `^0.45.2`, Drizzle Kit `^0.31.10`, Drizzle Zod `^0.8.3`, `tsx ^4.21.0` migration runner.
- Contracts: OpenAPI 3.1, Orval `^8.23.0`, generated React Query client; React Query catalog `^5.90.21`.
- Build/test: esbuild `0.27.3`, Node built-in test runner, TypeScript compilation.

## Debugging record

| Problem | Cause/action | Current state |
| --- | --- | --- |
| Windows/esbuild resolution denial | Restricted filesystem traversal blocked dependency worker resolution; the requested build succeeded with required local read access | Resolved for local verification |
| Orval/Zod generated-name collision | Graph path validator and split model shared a generated name; configured Zod split output without unsafe index barrels | Resolved; code generation passes |
| PostgreSQL/live providers unavailable | No connection URL, keys/endpoints, psql, or Docker | Pending infrastructure |
| GitHub remote verification | Windows Git has no credentials | Cached branch matches; remote fetch/tag confirmation pending |

## Complete status

| Area | Status |
| --- | --- |
| Phase 0 | COMPLETE |
| Phase 1 | COMPLETE |
| Phase 2 | COMPLETE |
| Phase 3 | COMPLETE — live smoke validation environment-dependent |
| Phase 4 | COMPLETE — remote verification environment-dependent |
| Phase 5 | NOT STARTED — plan only |
| Ethereum / Bitcoin / TRON | Implemented adapters |
| Graph / BFS / UTXO awareness | Implemented |
| Clustering / address intelligence / VASP / Chainabuse / ML / PS184 | Not implemented |

```text
PROJECT=CASHNET
CURRENT_PHASE=4
PHASE_0=COMPLETE
PHASE_1=COMPLETE
PHASE_2=COMPLETE
PHASE_3=COMPLETE
PHASE_4=COMPLETE
PHASE_5=NOT_STARTED
ETHEREUM_PROVIDER=Etherscan_V2
BITCOIN_PROVIDER=Esplora
TRON_PROVIDER=TronGrid
GRAPH=IMPLEMENTED
BFS=IMPLEMENTED
UTXO_AWARENESS=IMPLEMENTED
CLUSTERING=NOT_IMPLEMENTED
ADDRESS_INTELLIGENCE=NOT_IMPLEMENTED
VASP_ATTRIBUTION=NOT_IMPLEMENTED
CHAINABUSE=NOT_IMPLEMENTED
ML=NOT_IMPLEMENTED
PS184=NOT_IMPLEMENTED
DATABASE=PostgreSQL
ORM=Drizzle
PHASE4_COMMIT=51d9cee
PHASE4_TAG=v0.4.0-phase4
```
