# CASHNET — Project Status

## Current Phase: 6 — CORRECTIVE FOLLOW-UP, CONDITIONAL

## Release History

| Version | Tag | Date | Status |
|---|---|---|---|
| v0.3.0-phase3 | ✅ Tagged | 2026-08-29 | Released |
| v0.4.0-phase4 | ✅ Tagged | 2026-08-30 | Released |
| v0.5.0-phase5 | ✅ Tagged | 2026-08-31 | **CLOSED / RELEASED** |
| v0.6.0-phase6 | ✅ Tagged | 2026-09-01 | Historical checkpoint; corrective commits follow it |

## Phase 5 Final Gate Summary

- **Software gates**: 35/37 PASS (all software requirements met)
- **Non-software gates**: 2 governance/data blockers (not software defects)
  - `DATASET_PENDING_APPROVAL` — address-label dataset requires human governance approval
  - `INSUFFICIENT_GROUND_TRUTH` — no independent held-out evaluation corpus exists
- **Providers**: the Phase 5 checkpoint records live validation for Esplora, Etherscan V2, and TronGrid; those historical results were not independently re-executed in the current corrective session because this process inherited no provider configuration. Current Phase 6 provider status is recorded in [phase6-final-production-readiness.md](phase6-final-production-readiness.md).
- **Tests**: 32/32 PASS
- **Typecheck**: 4/4 workspace projects PASS
- **Build**: 2.1MB production bundle
- **Security defects found and fixed**: 2

## Phase 6

### Supabase infrastructure remediation

Supabase PostgreSQL is the intended sole CASHNET runtime database. The current
Compose deployment no longer contains a PostgreSQL service, volume, local host
port, or `postgres:5432` runtime dependency. `DATABASE_URL` is reserved for
the least-privilege `cashnet` runtime login and
`CASHNET_MIGRATION_DATABASE_URL` for the privileged Supabase migration and
backup path. This infrastructure change is not itself Supabase execution
evidence: a supplied, authorised Supabase project must still complete the
ledger replay, idempotency, audit-trigger, readiness and non-empty validation
gates. See [supabase-database-operations.md](supabase-database-operations.md).

The post-tag corrective implementation adds Phase 6 persistence/API wiring, migration compatibility, JWT signature verification, scoped provider lookups, security middleware, metrics, Docker/Compose corrections, and backup/restore scripts. The authorised API has executed controlled PostgreSQL-backed AML, graph/community, and historical DeFi/MEV flows. The authorised PostgreSQL validator has now passed migration replay/idempotency, ledger/catalog inspection, and real audit immutability probes; the graph-chain provenance and case-authorisation repairs are applied. The authoritative current gate is [phase6-final-production-readiness.md](phase6-final-production-readiness.md).

- `IMPLEMENTED` source is not equivalent to production readiness.
- Clean-replay evidence, non-empty persisted analytical validation, container execution, CI execution, provider live validation, and backup/restore drill remain release-evidence gates.
- Phase 7 is **NOT_STARTED**.
