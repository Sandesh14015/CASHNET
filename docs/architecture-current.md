# CASHNET current architecture — Phase 4

This is the implemented Phase 4 architecture. It preserves Phase 3 collection and adds bounded graph tracing over stored facts only; attribution remains deferred.

## 1. Overall system

```text
                         ┌────────────────────────────────────┐
                         │ artifacts/cashnet React investigator│
                         │ legacy synthetic UI workflow        │
                         └──────────────┬─────────────────────┘
                                        │ generated client
                    ┌───────────────────▼───────────────────────┐
                    │ Express API                               │
                    │ /api legacy     │ /api/v1 persistent      │
                    └────────┬────────┴─────────────┬───────────┘
                             │                      │
                    synthetic case service   actor/RBAC/case gate
                             │                      │
                             ▼                      ▼
                    deterministic fixtures   investigation services
                                                     │
                                                     ▼
                                             provider router
                                      ┌────────┼────────┐
                                      ▼        ▼        ▼
                                  Etherscan  Esplora  TronGrid
                                      │        │        │
                                      └────────┴────────┘
                                               │ raw facts
                                               ▼
                                 normalizers → repositories → PostgreSQL
                                                        │
                                                        ▼
                            derived graph relationships → bounded BFS
                                                        │
                                                        ▼
                                            provenance/evidence/audit
```

## 2. API and authorization flow

```text
request → pino request ID/log redaction → route validation
        → development actor authentication (v1 only)
        → role permission check → case-membership scoped lookup
        → service → repository transaction → response

No active/authorized actor, disabled development auth, or missing actor
  → standardized authentication/unavailable error.
Insufficient permission → 403 and audit event.
Missing or inaccessible case → 404 and denied-access audit event.
```

## 3. Database flow

```text
database/schema.sql
        │
        ├── 20260827_phase1_foundation.sql
        ├── 20260828_phase2_persistence_rbac.sql
        ├── 20260829_phase3_provider_persistence.sql
        └── 20260830_phase4_graph_tracing.sql
                    │
                    ▼
         cashnet_schema_migrations ledger
                    │
                    ▼
   Drizzle/pg transaction → PostgreSQL repositories
                    │
  cases/users/roles/case_memberships/investigations/wallet_subjects
                    │
  wallets/transactions/inputs/outputs/transfers/interactions/evidence/audit
                    │
  investigation_graph_relationships (derived, idempotent, provenance-backed)
```

## 4. Provider flow

```text
BlockchainService or BlockchainCollectionService
                    │
                    ▼
             ProviderRouter
                    │ CASHNET_DATA_MODE must be authorized
        ┌───────────┼────────────┐
        ▼           ▼            ▼
  Ethereum adapter  Bitcoin      TRON adapter
  Etherscan V2      Esplora      TronGrid
        │           │            │
        └────────── ProviderHttpClient ─────────┘
                    │ timeout/retry/backoff/429 handling
                    ▼
       raw payload → normalizer → typed provider result
```

Unsupported chains and unsupported capabilities are explicit typed outcomes. Synthetic mode does not silently select a live provider.

## 5. Ethereum pipeline

```text
authorized investigation
 → EtherscanEthereumProvider
 → account balance / txlist / tokentx / txlistinternal / proxy lookups
 → EVM normalizer
 → normalized transaction, transfer, interaction and provenance
 → atomic wallet/transaction child-record persistence
 → collection audit event
```

## 6. Bitcoin pipeline

```text
authorized investigation
 → EsploraBitcoinProvider
 → address profile/history or transaction lookup
 → Bitcoin normalizer
 → txid, vin(previous outpoint), vout, fee, confirmation/block fields
 → atomic persistence of wallet, transaction, inputs and outputs
 → collection audit event
```

Bitcoin facts retain UTXO semantics; they are not flattened into an account-only model.

## 7. TRON pipeline

```text
authorized investigation
 → TronGridProvider
 → account activity / transaction / TRC-20 history
 → TRON normalizer
 → transaction and token-transfer records with provenance
 → atomic persistence and collection audit event
```

## 8. Evidence and provenance flow

```text
provider raw payload
 → provider/source/reference/retrieved-at/method/raw-reference
 → normalized fact (API source type)
 → case-scoped persistence
 → audit event

Observed blockchain fact ≠ analytical inference ≠ entity label ≠ VASP candidate ≠ real-world identity.
```

## 9. Graph tracing flow

```text
stored normalized facts → deterministic relationship extractor
                       → investigation_graph_relationships (derived)
                       → case-authorized bounded BFS → evidence-backed graph response
```

The graph service never calls external providers. It supports direction, time, exact-decimal amount and asset filters, reports limits/truncation, and keeps Bitcoin UTXO projections explicitly inferred.

## 10. Complete authorization and API architecture

```text
user request
  → request ID + redacted Pino log
  → /api legacy synthetic route, OR /api/v1 route
  → v1 development actor boundary (disabled in production)
  → permission check → non-enumerating case-membership lookup
  → investigation/case service → repository interface → PostgreSQL transaction
  → standardized result/error + append-only audit event
```

Legacy `/api/*` keeps its synthetic dashboard, cases, fund-flow, wallet, prediction, intervention, and reporting workflow. Persistent `/api/v1/*` provides health/version, cases, audit, investigations/wallet subjects/collection/graph, evidence, and authorized provider read routes. The authoritative request/response contract is `lib/api-spec/openapi.yaml`; Orval regenerates the React client and Zod runtime validators.

## 11. Graph model and safeguards

```text
canonical normalized fact
  → relationship extractor
  → derived relationship (case + chain + tx + addresses + asset + amount)
  → authorized investigation query
  → one indexed relationship read
  → bounded BFS
  → ranked paths, edges, nodes, evidence and transparent limits
```

Node identity is `CHAIN:lowercase-address`, preventing accidental cross-chain identity. Node types are address/contract only. EVM/TRON native transfers become `TRANSFER` or `CONTRACT_INTERACTION`; token transfers become `TOKEN_TRANSFER`. Bitcoin input/output pair projections become `UTXO_SPEND` with `INFERENCE` provenance and never assert common ownership or change attribution.

Defaults are depth 2, 25 neighbors/node, 250 nodes, and 500 edges. Hard ceilings are depth 5, 100 neighbors, 1,000 nodes, and 2,000 edges. Filters are applied before traversal; exact decimal strings use `BigInt` comparison. BFS tracks visited chain-qualified nodes, never scans a provider, and reports `INSUFFICIENT_DATA` when stored history is absent. Ranking is deterministic: fewer hops, complete evidence, then lexical path identity; neighbor priority is amount descending, timestamp descending, transaction hash, then relationship ID.

## 12. Phase 5 intelligence flow

```text
stored Phase 3 facts + Phase 4 graph + approved local label observations
 → address observation / cautious Bitcoin inference
 → service-address assessment
 → deterministic evidence fusion
 → case-scoped VASP candidate + linked evidence + review state
```

The intelligence layer has no default external dataset and never invokes Chainabuse. It is bounded (100 stored Bitcoin transactions, 250 addresses/candidates at API limits), authorization-gated, audited, provenance-aware, and separate from canonical facts. Candidate confidence is `UNKNOWN`, `POSSIBLE`, `LIKELY`, or human-review-only `CONFIRMED`; it never identifies a customer or person.

Only candidate-address graph relationships can contribute graph evidence; unrelated
edges in the same investigation cannot boost a candidate. The exact runtime and
reference-repository status is recorded in
[phase5-tool-integration-matrix.md](phase5-tool-integration-matrix.md).

Human review is an append-only `attribution_reviews` record. `VASP_REVIEW` is required; confirmation additionally requires an uncontested `LIKELY` candidate with two sourced observations and a rationale. Evaluation is external-data driven through the `evaluate-phase5` metric utility; its output is not interpreted as probability calibration.

## 13. Security boundary

No private keys, seed phrases, signing, broadcasting, client-side provider secrets, or real-world identity claims are present. Provider access requires explicit authorized data mode and server-side configuration. Pino redacts authorization, cookies, developer-actor headers, and common secret fields. Successful graph/intelligence operations audit bounded execution metadata; unauthorized or inaccessible case access is audited but returned as non-enumerable not-found.
