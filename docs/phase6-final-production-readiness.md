# Phase 6 corrective readiness record

**Date:** 2026-09-04
**Scope:** corrective work following `v0.6.0-phase6`; no historical tag was changed. Classifications separate source implementation from executable operational evidence.

## Current decision

- `PHASE_6_IMPLEMENTATION = INCOMPLETE` — the Supabase deployment conversion is
  implemented in source but has not yet been exercised with an authorised
  Supabase project/secret context.
- `PHASE_6_OPERATIONAL_VALIDATION = CONDITIONAL` — the running authorised API was
  exercised against PostgreSQL for AML, graph features, communities and historical
  DeFi/MEV analysis. The operator subsequently completed the real migration, catalog
  and audit-trigger validator against `cashnet`; remaining release gates are listed
  below and are not inferred from this database result.
- `PHASE_6_PRODUCTION_READINESS = BLOCKED` — production readiness requires evidence
  from clean PostgreSQL replay and persistence flows, audit-trigger immutability,
  backup/restore, container execution, CI, deployment probes, and authorised provider
  validation where configured.
- `PHASE_7 = NOT_STARTED`.

## 2026-09-03 source remediation checkpoint

The following audited source defects have been corrected after the historical
Phase 6 checkpoint. This is **not** container or remote-CI execution evidence.

- Compose contains no PostgreSQL service, host port, or database volume. Its
  one-shot migrator provisions the fixed least-privilege `cashnet` role when
  absent and invokes the same `@workspace/db` ledger runner used elsewhere;
  API startup requires successful completion against Supabase.
- CI invokes that runner twice against its clean PostgreSQL service. Its secret
  scan, high/critical dependency audit, and high/critical image scan are
  blocking gates rather than advisory output.
- Production authentication rejects all reserved `demo.*` fixture subjects
  before database role lookup. Development fixture use remains explicitly
  development-only. See [production-identity-operations.md](production-identity-operations.md).
- Relationship extraction now canonicalises native BNB, Polygon, and Solana
  transfers as `BNB`, `POL`, and `SOL`; token-transfer symbols remain unchanged.

Regression coverage was added for all five behaviours. Docker engine execution,
real CI execution, and authorised database scripts remain evidence gates and
must not be inferred from these source changes.

### Required external execution evidence

The source changes have deliberately not been presented as Docker or GitHub
Actions execution. An operator with Docker Desktop and Supabase URLs supplied
through the deployment secret manager may obtain container evidence without a
local database service:

```powershell
Set-Location "C:\\Users\\Subham\\Documents\\Codex\\2026-08-27\\mkdir-references-cd-references-gh-repo\\CASHNET"
$env:COMPOSE_PROJECT_NAME = "cashnet_phase6_validation"
# DATABASE_URL and CASHNET_MIGRATION_DATABASE_URL are injected secrets; do not echo them.
docker compose config
docker compose build --no-cache
docker compose up -d
docker compose ps
Invoke-WebRequest http://127.0.0.1:3000/api/readyz
docker compose restart api
docker compose ps
docker compose logs --tail=200 migrate api
docker compose down
```

The project name isolates the validation volume. `docker compose down` (without
`-v`) preserves it for the restart/idempotency check. A remote GitHub Actions
run must execute the checked-in workflow; a local YAML/source inspection is not
CI execution evidence.

| Component | Status | Actual execution evidence | Remaining limitation |
| --- | --- | --- | --- |
| Migration chain and ledger | OPERATOR_VALIDATED | The authorised PostgreSQL validator completed its first migration pass and second idempotency pass, and verified the complete Phase 0–6 ledger including corrective migrations. | A clean-database replay remains a separate release-evidence gate. |
| PostgreSQL catalog | OPERATOR_VALIDATED | The authorised validator verified all ten Phase 6 tables, indexes, constraints and foreign keys, including the Phase 1 `risk_indicators` compatibility design and Phase 6 expression-index design. | A clean-database replay remains a separate release-evidence gate. |
| PostgreSQL persistence | OPERATIONALLY_CONNECTED | `/api/readyz` returned `database: ok`; the authorised API persisted and returned AML, graph-feature and community records for the controlled case. | Non-empty controlled analytical persistence validation is pending. |
| AML / risk API | OPERATIONALLY_CONNECTED | `POST /api/v1/investigations/{id}/risk-analysis` returned a persisted completed run in 26 ms with zero indicators, explicit `HEURISTIC_SCORE_NOT_PROBABILITY`, and no fabricated finding. | Direct audit/row inspection and a non-empty stored-fact scenario remain pending. |
| Graph / community API | OPERATIONALLY_CONNECTED | Bounded HTTP runs returned persisted graph features in 17 ms and a community run in 10 ms against the controlled empty graph; persisted feature rows now correctly retain `chain: ETHEREUM`. | A non-empty stored graph and direct audit/catalog inspection remain pending. |
| Bitcoin clustering | METHODOLOGY_IMPLEMENTED | Existing clean-room, conservative inference remains Bitcoin-specific and review-required. | No new live Bitcoin collection was available in this task. |
| DeFi / MEV API | OPERATIONALLY_CONNECTED | The authorised API completed stored-fact analysis in 10 ms with zero interactions/candidates and explicitly returned `historicalOnly: true`. | It does not implement real-time mempool monitoring; non-empty persisted-fact validation is pending. |
| Evaluation / calibration | IMPLEMENTED / INSUFFICIENT_GROUND_TRUTH | Metrics, calibration and false-positive utilities are covered by unit tests without treating heuristic scores as probabilities. | No independent held-out corpus was supplied; no accuracy figures are claimed. |
| Reporting API | OPERATIONALLY_CONNECTED_WITH_RBAC_DENIAL | The route correctly denied the investigator with HTTP 403 because report generation is a separate least-privilege permission. | A legitimate case-member supervisor/admin actor was not available to demonstrate successful generation. |
| Bitcoin / Esplora | IMPLEMENTED_PENDING_LIVE_VALIDATION | Adapter, validation, normalisation and provider routing are covered by tests. | No approved endpoint/configuration was available for read-only collection. |
| Ethereum / Etherscan V2 | IMPLEMENTED_PENDING_LIVE_VALIDATION | Adapter and provider error handling are covered by tests. | No credential was available for read-only validation. |
| TRON / TronGrid | IMPLEMENTED_PENDING_LIVE_VALIDATION | Regression test proves transaction lookup uses the shared resilience client. | No credential was available for read-only validation. |
| BNB Chain / Polygon | IMPLEMENTED_PENDING_LIVE_VALIDATION | EVM-compatible provider paths are registered in the six-chain router. | Endpoint semantics and live collection were not independently executed. |
| Solana | IMPLEMENTED_PENDING_LIVE_VALIDATION | `SOLANA_RPC_URL` is explicit; no public default is treated as production configuration. | No approved RPC endpoint was configured. |
| Address-label dataset | DATASET_PENDING_APPROVAL | The governed approved-dataset boundary remains in place. | No approved manifest, terms, integrity record, freshness policy or operator approval was supplied. |
| JWT / OIDC | IMPLEMENTED | Generated-key regression test proves valid RS256 verification and rejection of altered signatures; production maps only a verified subject to CASHNET database roles. | A deployed OIDC issuer/JWKS rotation exercise remains pending. |
| RBAC / case isolation | OPERATIONALLY_CONNECTED | A non-member supervisor received a non-enumerating HTTP 404 for the known case; direct provider lookup rejected absent investigation scope and a chain mismatch with HTTP 400. | Legitimate supervisor membership assignment requires its database UUID through the protected CaseService path and remains to be exercised. |
| HTTP security | OPERATIONALLY_CONNECTED | The actual Express app passed HTTP tests for request ID propagation, security headers, origin rejection, body-size rejection and rate limiting. The limiter now ignores spoofable `X-Forwarded-For` unless a deployment explicitly supplies a trusted-proxy key extractor. | Reverse-proxy/TLS policy requires deployment validation. |
| Audit immutability | OPERATOR_VALIDATED | The authorised validator found the immutable `audit_events` trigger and its real `UPDATE` and `DELETE` mutation probes were both rejected by PostgreSQL. | Backup/restore preservation of the trigger remains a separate drill. |
| Audit and provenance | OPERATIONALLY_CONNECTED_IN_SOURCE | Services emit append-only audit events and retain method, source and provenance fields. | Non-empty controlled persistence and provider-to-PostgreSQL provenance validation remain pending. |
| Docker / Compose | IMPLEMENTED_PENDING_CONTAINER_VALIDATION | Docker entry point, non-root runtime, health paths, Supabase-only environment contract, and one-shot ledger migrator are implemented in source. | No authorised Supabase project/secret context or Docker execution is available to this process. |
| CI/CD | IMPLEMENTED_PENDING_EXTERNAL_EXECUTION | Workflow source exists. | No GitHub Actions execution was available in this task. |
| Observability | OPERATIONALLY_CONNECTED | The authorised API returned `/api/v1/health` 200 (`authorized`), `/api/v1/version` 200, `/api/readyz` 200 with `database: ok`, and Prometheus-style `/api/metrics` 200. Request counters/durations changed after a request and no password, API-key, authorization, case-number, or evidence terms were observed. | Deployment scrape and secret-content inspection of a long-running metric stream remain pending. |
| Backup / restore | IMPLEMENTED_PENDING_EXECUTION | Guarded Windows-safe scripts now require a Supabase migration URL and a distinct disposable Supabase restore endpoint; see [backup-restore.md](backup-restore.md). | No authorised primary and isolated restore Supabase project are available to execute the drill. |
| Performance / bounds | IMPLEMENTED_PENDING_MEASUREMENT | Graph/community limits and repository SQL result limits are implemented and regression tested. | No representative database workload was available for measurement. |

## Validation evidence

- `pnpm run typecheck` — PASS in this corrective branch.
- `pnpm --filter @workspace/api-server run test` — PASS, **56 tests / 0 failed**: actual Express security middleware, production readiness fail-closed behavior, JWT signature rejection, Solana configuration, TronGrid resilience, migration compatibility, provider scope contract, graph-chain provenance and case-approval permission separation.
- `pnpm --filter @workspace/api-spec run codegen` — PASS after the Phase 6 contract was added.
- `pnpm run typecheck` — PASS.
- `pnpm --filter @workspace/api-server run build` — PASS (production bundle built in 577 ms).
- `git diff --check` — PASS.
- Local production HTTP probe — PASS for HSTS, CSP, X-Request-ID, CORS allowlist and safe metrics; `/api/readyz` correctly failed closed with HTTP 503 when this Codex process had no `DATABASE_URL`.
- Authorised runtime HTTP E2E — PASS for case/investigation reads, AML, graph features, communities, historical DeFi/MEV, readiness and metrics. Controlled empty inputs produced zero findings rather than fabricated intelligence.
- Representative controlled measurements — case read 119 ms, investigation read 13 ms, AML 26 ms, graph features 17 ms, communities 10 ms, and historical DeFi/MEV 10 ms. These are local single-request observations, not throughput claims.

## Completed direct PostgreSQL validation

The guarded validator was run in the authorised PowerShell session with
`DATABASE_URL` present. It did not print the connection string and produced the
following real PostgreSQL evidence: first migration pass PASS, idempotency pass
PASS, complete Phase 0–6 ledger, Phase 6 catalog/index/constraint/foreign-key
verification, immutable audit trigger present, and both audit `UPDATE` and
`DELETE` probes rejected.

The repeatable command is:

```powershell
pwsh -File .\scripts\validate-phase6-postgres.ps1
```

Its output remains the required evidence for future environment validation; it must
not be replaced with a claim based solely on source review.

## Controlled non-empty Phase 6 validation

`scripts/validate-phase6-nonempty.ps1` creates a separately numbered, explicitly
marked `VALIDATION_FIXTURE` case only after `-ConfirmCreateValidationFixture` is
supplied. It creates the case and investigation through the authenticated API as a
legitimate supervisor, transitions the case/investigation through the normal service
path, inserts only controlled graph relationship fixtures with
`CONTROLLED_VALIDATION_FIXTURE` provenance, then invokes the real bounded AML,
graph-feature, community, historical DeFi/MEV and privileged-report endpoints. It
also checks the resulting PostgreSQL persistence counts. The script is intentionally
not evidence of live provider data, criminal activity, ownership, or attribution.

```powershell
pwsh -File .\scripts\validate-phase6-nonempty.ps1 -ConfirmCreateValidationFixture
```

## Guarded backup/restore validation

`scripts/validate-phase6-backup-restore.ps1` is the required safe drill for the
authorised PostgreSQL environment. It resolves PostgreSQL client paths safely on
Windows, creates a uniquely named isolated database only after explicit approval,
backs up `cashnet`, verifies the SHA-256 manifest, restores only to that isolated
database, checks the ledger and data families, and proves restored audit immutability.
It neither prints `DATABASE_URL` nor restores over `cashnet`.

```powershell
pwsh -File .\scripts\validate-phase6-backup-restore.ps1 -ConfirmCreateIsolatedRestoreDatabase
```

## Final component distinctions

| Component | Status | Actual execution evidence | Remaining limitation |
| --- | --- | --- | --- |
| Community detection | OPERATIONALLY_CONNECTED_IN_SOURCE | Bounded persisted route and unit coverage are present. | PostgreSQL route execution remains unavailable to this process. |
| BNB Chain | IMPLEMENTED_PENDING_LIVE_VALIDATION | Six-chain router test passed. | No approved endpoint/credential was inherited. |
| Polygon | IMPLEMENTED_PENDING_LIVE_VALIDATION | Six-chain router test passed. | No approved endpoint/credential was inherited. |
| OIDC deployment | IMPLEMENTED_PENDING_EXTERNAL_VALIDATION | JWT verifier performs JWKS `kid` lookup and cryptographic verification in source/tests. | No issuer/JWKS deployment exercise was available. |
| Compose | IMPLEMENTED_PENDING_CONTAINER_VALIDATION | Compose source was reviewed with corrected API entry point and health paths. | Docker CLI/daemon is unavailable. |
| CI/CD | IMPLEMENTED_PENDING_EXTERNAL_EXECUTION | Workflow declares migration replay/idempotency, tests, build, audit and container scan. | No GitHub Actions run was triggered or inspected. |
| Audit immutability | OPERATOR_VALIDATED | The authorised PostgreSQL validator confirmed both real mutation paths are rejected. | Restore-drill verification is still pending. |
| Provenance | OPERATIONALLY_CONNECTED_IN_SOURCE | Provider/analytical repositories persist method/version/source fields; regression tests cover normalisation. | Real provider-to-PostgreSQL path remains pending. |
| Tests | PASS | Full workspace API suite: 54 passed, 0 failed. | PostgreSQL integration suite requires the missing inherited connection environment. |
| Build | PASS | API production bundle built successfully. | Container build is separately pending. |

## Release decision

`v0.6.0-phase6` remains a protected historical checkpoint. No corrective release tag has been created. Phase 6 cannot be called production-ready until clean PostgreSQL replay/idempotency and real persistence flows, audit-trigger exercise, container execution, provider validation where authorised configuration exists, backup/restore drill, CI run, deployment probes, and representative performance measurement have actual evidence. Phase 7 remains **NOT_STARTED**.
