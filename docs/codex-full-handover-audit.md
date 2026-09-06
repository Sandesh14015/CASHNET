# CASHNET — Codex Full Project Handover / Forensic Repository Audit

**Audit date:** 2026-09-01  
**Audited repository:** `CASHNET`  
**Scope:** Read-first technical handover audit. No Phase 6 or Phase 7 implementation was performed as part of this audit.

## 1. Repository structure

The repository is a pnpm workspace with the expected primary application layout:

- `artifacts/api-server` — Express/TypeScript API, services, repositories, tests, and provider adapters.
- `artifacts/cashnet` — existing React investigator UI. Its legacy data flow remains present.
- `lib/db` — PostgreSQL/Drizzle schema exports, database singleton, and migration runner.
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` — OpenAPI contract and generated client artifacts.
- `database/schema.sql` plus ten versioned migration files.
- `docs`, `scripts`, `.github`, `Dockerfile`, and `docker-compose.yml`.
- `references/` — local reference checkouts, not tracked product dependencies. It contains the requested eight external repositories.

## 2. Git state

At audit time the working tree was clean and tracked `main` was aligned with `origin/main` locally:

```text
## main...origin/main
HEAD: 86dc1a3 fix: Phase 6 release-readiness defects found during audit
```

No history, tag, or remote was modified by this audit. A remote ref verification attempt was blocked by network access to GitHub, so remote publication state was not independently re-attested.

## 3. Release tags

All required historical annotated tags resolve locally and remain preserved:

| Tag | Peeled commit |
| --- | --- |
| `v0.3.0-phase3` | `2525aa85889f53216ecc2234e882819d20dcd100` |
| `v0.4.0-phase4` | `51d9cee2e0eac2c2ed9a3ddc53bee9823eea2181` |
| `v0.5.0-phase5` | `99cf86817110b7389f48b5e5f7087789b28d44a5` |
| `v0.6.0-phase6` | `86dc1a30403d1656663092cb2f70847a1171ff7b` |

`v0.6.0-phase6` is the current local `HEAD`; its presence is not evidence that all Phase 6 release criteria are met.

## 4. Phase 0 — reference and research foundation

The required reference repositories are present under `references/`. Their source is not tracked in CASHNET and no direct source import was found.

| Source | Audit classification | Finding |
| --- | --- | --- |
| `bitcoin-address-clustering` | `METHODOLOGY_IMPLEMENTED` | CASHNET has a clean-room Bitcoin-only clustering service; the external repository remains reference-only. |
| `crypto-wallet-address-labels` | `DATASET_PENDING_APPROVAL` | A local approved-dataset adapter exists, but no approved manifest/data was available in this audit environment. |
| `am-i-exposed` | `REFERENCE_ONLY` | No runtime dependency. |
| `Open-Source-Blockchain-Forensics` | `REFERENCE_ONLY` | No runtime dependency. |
| `Evidencly` | `REFERENCE_ONLY` | No runtime dependency; CASHNET remains the primary application. |
| `mev-wallet-cluster-analysis` | `REFERENCE_ONLY` | Methodology/case-study only. |
| `OpenAML` | `REFERENCE_ONLY` | Later governed AML research only. |
| `ChainForensics` | `REFERENCE_ONLY` | AGPL-3.0; no source code is copied or linked into CASHNET. |
| Chainabuse | `OPTIONAL_NOT_CONFIGURED` | No adapter, credential, or data source found. |

## 5. Phase 1 — foundational backend/data model

`database/migrations/20260827_phase1_foundation.sql` defines foundational domain tables including cases, wallets, blockchain transactions, address labels, evidence, VASP candidates, and a legacy `risk_indicators` table. The Express legacy `/api/*` synthetic workflow remains intentionally present.

**Classification:** `IMPLEMENTED`. Database application against a clean database was not independently run in this audit environment.

## 6. Phase 2 — PostgreSQL, RBAC, and case control

The source implements:

- PostgreSQL/Drizzle repositories and a transaction coordinator;
- users, roles, permissions, user roles, case memberships, persistent cases/investigations/wallet subjects/evidence;
- central `CaseAuthorizationService` checks and non-enumerating missing/inaccessible resource behavior;
- append-only audit events in services;
- development actor authentication through `PostgresUserRepository.findActorByUsername`.

Routes use the intended route → development authentication → authorization → service → repository pattern for cases, investigations, evidence, graph tracing, and Phase 5 intelligence. A known UUID alone does not bypass central case access checks in these persistent flows.

**Important limit:** development authentication is intentionally unavailable in production. The Phase 6 JWT implementation is not wired as a replacement and does not verify signatures; therefore there is no production-ready authentication path.

**Classification:** `IMPLEMENTED`; `OPERATIONALLY_CONNECTED` only when a correctly configured PostgreSQL database and explicitly enabled non-production development authentication are supplied.

## 7. Phase 3 — blockchain providers

The provider architecture is present and decoupled from downstream graph/intelligence services:

```text
ProviderRouter → provider adapter → response/normalization → persistence → relationship extraction
```

Implemented adapters:

| Provider | Classification in this audit environment | Evidence |
| --- | --- | --- |
| Ethereum / Etherscan V2 | `IMPLEMENTED_PENDING_LIVE_VALIDATION` | Adapter, internal-transfer support, normalizers, bounded HTTP client and provenance are present; no credential was provided to this audit process. |
| Bitcoin / Esplora-compatible | `IMPLEMENTED_PENDING_LIVE_VALIDATION` | Adapter and UTXO input/output normalizers are present; no approved endpoint was configured. |
| TRON / TronGrid | `IMPLEMENTED_PENDING_LIVE_VALIDATION` | Adapter and TRC-20 normalizers are present; no credential was provided. |

The generic `ProviderHttpClient` provides timeout/retry handling for the normal adapter requests. However, `TronGridProvider.getTransaction` calls `fetch` directly, bypassing that client’s timeout/retry behavior. This is a resilience defect to correct before treating the provider pipeline as production-ready.

Historical documents claim all three providers were live-validated. This audit had neither provider credentials nor a running authorised API process, so it cannot independently confirm those historical claims and does not restate them as current `LIVE_VALIDATED` evidence.

## 8. Phase 4 — transaction graph

Phase 4 is substantively implemented in source:

- deterministic relationship extraction from persisted normalised facts;
- case-scoped `investigation_graph_relationships` records with provider/source/raw-reference/retrieval provenance;
- bounded BFS traversal with direction, asset, time, amount, node, edge, neighbour, depth, cycle-prevention, and deterministic ranking controls;
- explicit Bitcoin UTXO projection semantics that do not assert ownership;
- an investigation graph route guarded by investigation/case access and an audit event.

No provider is invoked by `GraphTracingService`; it operates on stored relationships. Unit tests exercise the bounded traversal and provenance behavior.

**Classification:** `IMPLEMENTED`. PostgreSQL-backed replay and API execution were not independently available in this handover environment.

## 9. Phase 5 — intelligence and attribution

The current source includes reachable Phase 5 routes and services for:

- approved-dataset address-intelligence lookup;
- conservative Bitcoin common-input/cautious-change inference with CoinJoin/equal-output ambiguity protection;
- service-address assessment;
- deterministic, contradiction-aware evidence fusion;
- VASP/service candidate persistence and bounded listing;
- human review with confirmation gating;
- audit events and central case authorization.

The candidate service preserves investigation/address scope, source, method, method version, retrieval time, contradictions, and review state. It does not automatically claim a person, customer, or confirmed identity.

The label adapter only activates after authorised mode plus dataset path/name/version/licence configuration. It does not by itself enforce a signed manifest, integrity digest, retrieval date, retention policy, or an approval record; no approved dataset was supplied. Its correct operational state is therefore `DATASET_PENDING_APPROVAL`.

**Classification:** core clean-room intelligence is `IMPLEMENTED`; operational data-dependent functionality is conditional on PostgreSQL, authorised actors, stored facts, and approved sources. There was no independent held-out evaluation dataset, so accuracy remains `INSUFFICIENT_GROUND_TRUTH`.

## 10. Phase 6 — current implementation baseline

Phase 6 source is not uniformly operational. The following distinction is essential:

| Area | Actual classification | Basis |
| --- | --- | --- |
| BNB Chain and Polygon adapters | `IMPLEMENTED_PENDING_LIVE_VALIDATION` | Provider classes, normalizers, chain enum and collection routing exist; no credentials/live run in this audit. |
| Solana adapter | `IMPLEMENTED_PENDING_LIVE_VALIDATION` | Provider/normalizer support signature, slot, account keys, instructions and SPL transfer fields; no live validation. Configuration incorrectly sets `configured: true` even with no `SOLANA_RPC_URL`, and defaults to a public RPC endpoint. |
| AML/risk/typology code | `IMPLEMENTED` / `NOT_WIRED` | Pure source services exist; they are not constructed in `getPersistentContext`, have no API route, persistence adapter, or audit execution path. |
| Graph features/community detection | `IMPLEMENTED` / `NOT_WIRED` | Source algorithms exist; no route, service wiring, repository persistence, or API contract found. |
| DeFi interaction and historical MEV candidate code | `IMPLEMENTED` / `NOT_WIRED` | In-memory analysis exists; no controller, persistence, repository, audit, or review flow. It is not a real-time mempool system. |
| Evaluation/calibration/false-positive utilities | `IMPLEMENTED` / `NOT_WIRED` | In-memory utilities and unit fixtures exist; no held-out data pipeline or API. |
| JWT/OIDC abstraction | `NOT_WIRED` and **not production-safe** | It validates claim shape/JWKS key presence but explicitly does not cryptographically verify JWT signatures. |
| Security middleware | `IMPLEMENTED` / `NOT_WIRED` | Middleware functions are defined but not registered by `app.ts`. |
| Report generator | `IMPLEMENTED` / `NOT_WIRED` | Generates in-memory structures only; no route/repository persistence. |
| Container/compose | `IMPLEMENTED_BUT_BROKEN` | Static startup configuration defects are documented below; Docker was unavailable for execution. |
| CI workflow | `IMPLEMENTED_PENDING_CI_EXECUTION` | YAML exists, but no GitHub run was available to inspect. |

## 11. Database and migrations

`lib/db/src/migrate.ts` is a ledger-based runner. It declares every on-disk release migration in order:

```text
0000_baseline
20260827_phase1_foundation
20260828_phase2_persistence_rbac
20260829_phase3_provider_persistence
20260830_phase4_graph_tracing
20260831_phase5_intelligence
20260901_phase6_multichain
20260901_phase6_risk
20260901_phase6_graph
20260901_phase6_defi
20260901_phase6_production
```

This corrects the prior class of defect where Phase 6 files existed but were not in the runner. The runner applies each unrecorded file in a transaction and records it only after success.

### Static clean-replay blockers found

1. **Phase 6 risk migration collides with Phase 1 `risk_indicators`.** Phase 1 already creates `risk_indicators` with legacy columns (`name`, `source_type`, etc.). `20260901_phase6_risk.sql` again uses `CREATE TABLE IF NOT EXISTS risk_indicators`, which therefore does not evolve the table on a fresh replay, then creates `idx_risk_indicators_run` on `run_id`. The Phase 1 table has no `run_id`; the index statement will fail. This also means the new Phase 6 risk schema is not established by the stated migration strategy.
2. **Phase 6 graph migration uses an expression in a table-level `UNIQUE` constraint.** `20260901_phase6_graph.sql` declares `UNIQUE (..., lower(address), ...)` inside `CREATE TABLE`. PostgreSQL table constraints accept column names, not index expressions. It should be expressed as a separate unique index (or via a generated/canonical address column) after a corrective migration design is chosen.

Because this task did not receive `DATABASE_URL`, no migration ledger/catalog or clean database replay could be executed. These are static, evidence-backed blockers; they must be reproduced in an isolated PostgreSQL database before any release claim is renewed.

The Drizzle schema/repository layer contains no Phase 6 persistence adapters for the risk, graph-feature, DeFi/MEV, or reporting tables, confirming that their migrations do not establish operational features.

## 12. Providers

Provider source and normalisation paths are structurally present for all six chains: Bitcoin, Ethereum, TRON, BNB Chain, Polygon, and Solana. All live/provider state is `IMPLEMENTED_PENDING_LIVE_VALIDATION` for this audit because no local provider credential/approved endpoint was present and no running API was listening on port 5000.

Provider configuration must not mistake source presence for operational readiness. In particular, Solana's `configured: true` default is misleading and should be changed to an explicit approved-endpoint configuration state before production use.

## 13. API/controller wiring

Reachable `/api/v1` persistent routes cover cases, investigations, wallet subjects, evidence, Phase 4 graph tracing, Phase 5 intelligence/clustering/VASP reviews, and audit reads.

`/api/v1/graph`, `/api/v1/entities`, and `/api/v1/vasps` are empty placeholder routers. There are no Phase 6 API routes for risk, typology, graph features/community detection, DeFi, MEV, evaluation, reports, metrics, or production OIDC.

The direct wallet/transaction provider routes authenticate an actor but `BlockchainService` explicitly discards it and does not enforce a permission or a case/investigation scope. These routes need an explicit authorization and evidence/case-scoping decision before production exposure.

## 14. Services

Phase 2–5 persistent services are constructed by `getPersistentContext()`. The constructor does **not** construct Phase 6 risk, graph feature, community, DeFi, MEV, evaluation, JWT, or reporting services. Therefore source-only Phase 6 services are not operationally connected.

## 15. Authentication

The currently wired authenticator is `DevelopmentActorAuthenticator`, using `X-Cashnet-Dev-Actor` and the database user repository. It is explicitly disabled in production.

`JWTAuthenticator` is not instantiated by application startup and includes a source comment acknowledging that signature verification is not implemented. Parsing claims, checking issuer/audience/expiry, and matching a fetched `kid` are not cryptographic verification. This is a release-blocking production authentication gap.

## 16. RBAC and case isolation

Persistent case/investigation/evidence/graph/intelligence flows use central permission and accessible-case checks. Denials are represented as non-enumerating not-found outcomes and append denial audit events. Assignment is mediated through `CaseService` and repository methods, not route SQL.

This design is a sound source-level basis. Full PostgreSQL-backed multi-actor execution was not available in this handover process, so it is not independently `LIVE_VALIDATED` here.

## 17. Audit

Services append audit events for case access/mutation, authorization denial, investigation actions, collection, graph access, intelligence, clustering, candidate analysis, and reviews. The Phase 6 production migration adds a database trigger intended to reject `UPDATE`/`DELETE` of `audit_events`.

The trigger has not been exercised against a database in this audit. Its existence is `IMPLEMENTED_PENDING_DATABASE_VALIDATION`, not proof of operational immutability.

## 18. Provenance

Normalized providers and Phase 4 relationships retain provider/source/raw-reference/retrieval fields. Phase 5 observations and candidate evidence retain source, retrieval time, method/version, polarity, contradictions, and review status. The services’ semantic warnings appropriately avoid converting graph proximity, clustering, or labels into identity proof.

Dataset provenance governance is incomplete until a signed/recorded approved manifest, integrity verification, retention policy, and operator approval are implemented and exercised.

## 19. Tests and build baseline

The following commands were executed against the current checkout:

| Command | Result |
| --- | --- |
| `pnpm run typecheck` | PASS |
| `pnpm -r --if-present run test` | PASS — 46 tests, 46 passed, 0 failed |
| `pnpm --filter @workspace/api-spec run codegen` | PASS |
| `pnpm --filter @workspace/api-server run build` | PASS after granting the build read access to installed pnpm dependencies; initial restricted-sandbox failure was environmental, not a code error. |
| `git diff --check` | PASS |

Tests cover valuable deterministic source behavior, but Phase 6 tests are mostly in-memory unit fixtures. They do not prove migration replay, PostgreSQL persistence, API reachability, multi-actor authorization, live providers, CI, container startup, or production authentication.

## 20. Runtime validation

This Codex audit process had no `DATABASE_URL`, no provider credentials/endpoints, and no local listener on `127.0.0.1:5000`. Consequently it did not start the persistent API or perform a database/provider live run. It is inaccurate for documents in this checkout to present those conditions as this audit's successful runtime evidence.

`/api/healthz` is a process-only probe. `/api/readyz` reports database merely as `configured` when the environment variable exists; it does not query PostgreSQL. There is no `/metrics` endpoint.

## 21. Security findings

1. **Release blocker:** JWT/OIDC code lacks cryptographic signature verification and is not wired.
2. **Release blocker:** `app.ts` uses permissive `cors()` and does not register the defined secure-headers, request-ID, rate-limit, or custom request-size middleware.
3. **High:** direct provider wallet/transaction routes authenticate but do not apply a permission or case scope.
4. **High:** `TronGridProvider.getTransaction` bypasses the shared timeout/retry client.
5. **High:** `createDatabase` creates a pool from the connection string only; no application-level TLS posture, pool limit, statement timeout, or connection timeout is set.
6. **High:** Docker configuration cannot start the built API as written: the build emits `dist/index.mjs`, while Docker executes `dist/server.js`; `PORT` is required by `src/index.ts` but is not supplied; health checks target `/health` instead of `/api/healthz`.
7. **Medium:** compose contains a tracked development database password and enables development authentication. It must not be used as a production deployment definition.
8. **Medium:** approved-dataset configuration accepts any configured local path and lacks manifest/integrity/approval-record enforcement.
9. **Medium:** Phase 6 migration collisions block a defensible clean replay.

No hardcoded live provider credential was printed or added by this audit.

## 22. Defects

- The two static Phase 6 migration defects described in section 11.
- Source-only Phase 6 services with migrations but no repository/service/API/audit wiring.
- Non-cryptographic, unwired JWT path.
- Security middleware not registered.
- Misleading Solana configuration status and unvalidated public default endpoint.
- Direct TronGrid transaction request bypassing shared resilience behavior.
- Broken Docker entrypoint, required port configuration, and health probe path.
- Stale/internally inconsistent documentation: `README.md` still says Phase 4 and later capabilities are unimplemented, while Phase 5 documents alternately label several reference repositories as `REFERENCE_ONLY` and `CLEAN_ROOM_IMPLEMENTED`. The distinction must be normalized without representing references as runtime dependencies.

## 23. External blockers

- No `DATABASE_URL` was available to this audit process: migration ledger, schema catalog, RLS/role posture, real API flow, audit trigger, and clean replay are unverified.
- No Etherscan, TronGrid, BscScan, PolygonScan credential or approved Esplora/Solana endpoint was available: live provider validation is unverified.
- No approved label dataset manifest/data was available.
- No independent held-out ground truth was available: evaluation, calibration, accuracy, and false-positive rates remain `INSUFFICIENT_GROUND_TRUTH`.
- Docker CLI was not installed/available.
- GitHub remote reachability was blocked: `git ls-remote` failed to connect to GitHub over port 443.

## 24. Out-of-scope items

- Phase 7 was not started.
- ChainForensics source integration is prohibited without a separate AGPL licence decision.
- Chainabuse remains optional and unconfigured.
- No live VASP attribution, identity conclusion, label approval, calibration claim, benchmark, or provider result is inferred from source code or tests.
- No real-time mempool monitoring exists; Phase 6 MEV source only describes historical candidate analysis.

## 25. Exact recommended next work

Do this in order, with a new controlled implementation task after accepting this audit:

1. Create an isolated clean PostgreSQL database and reproduce both Phase 6 migration failures. Add safe additive/corrective migrations; do not rewrite released migrations or tags. Re-run the complete ledger twice.
2. Add Phase 6 Drizzle/repository interfaces, transaction-coordinated persistence, authorization checks, audit events, bounded routes, and OpenAPI contracts for only the accepted Phase 6 capabilities.
3. Implement a real production authenticator with strict issuer/audience/algorithm checks, JWKS key import and `crypto.subtle.verify`; wire it as the production path. Keep development auth disabled in production.
4. Wire security middleware deliberately: restrictive CORS policy, headers, request ID, rate limits, request size limits, safe logging, and tested error handling. Add authorization to direct provider lookup routes or remove them from production exposure.
5. Fix provider configuration semantics, move TronGrid transaction lookup through the common client, and then validate every approved provider read-only with documented evidence.
6. Repair Docker entrypoint/port/probe configuration, remove development-only compose credentials from production guidance, then build and run the container non-root against a disposable database.
7. Add genuine readiness/metrics/backup-restore controls and validate them.
8. Establish governed dataset approval and independent held-out evaluation before any accuracy or attribution-quality claim.
9. Reconcile README and Phase 5/6 documentation with verified behavior; only then decide whether a new corrective release is justified.

## Handover conclusion

Phase 0–5 contain meaningful, defensible source-level foundations, particularly case-scoped persistence, graph bounds, provenance, cautious clustering, human review, and clean-room reference handling. Phase 5's tag remains a preserved historical checkpoint, but this handover did not independently reproduce its database or provider validation claims.

`v0.6.0-phase6` is **not production-ready**. It has material migration, authentication, security wiring, container, and operational-connection gaps. Treat Phase 6 as a partially implemented code baseline requiring corrective work and fresh PostgreSQL/API/provider validation, not as a completed production release.
