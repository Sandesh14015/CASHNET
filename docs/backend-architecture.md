# CASHNET Backend Architecture

## Purpose and boundary

Phase 1 turns the existing Express API into a modular foundation without changing the synthetic investigator workflow. It does not add live blockchain access, tracing, VASP attribution, ML, PS184, external authentication, or a frontend redesign.

```text
HTTP routes -> controllers/services -> ports -> adapters/repositories
                  |                    |
                  +-> schemas          +-> synthetic fixtures (Phase 1)
                                       +-> authorized external adapters (future)
```

Business services do not call Etherscan, Bitcoin explorers, TronGrid, Chainabuse or any other external endpoint directly. Future integrations implement `services/blockchain/provider.ts` and are invoked through a provider selection/composition service.

## Modules

| Location | Responsibility |
| --- | --- |
| `config/` | Parses non-secret configuration and exposes whether an adapter is configured, never the secret value. |
| `errors/` | Maps validation, provider, rate-limit, timeout, unavailable, not-found, authorization and unexpected errors to one API shape. |
| `schemas/` | Zod schemas for normalized facts, inference, provenance and raw references. |
| `services/blockchain/` | Provider port and synthetic implementation only; no network calls. |
| `services/normalization/` | Future chain-data normalization boundary. |
| `services/graph/` | Future graph relationship boundary. |
| `services/intelligence/` | Future entity/label/evidence boundary. |
| `services/attribution/` | Future VASP candidate boundary. It must not identify customers. |
| `services/risk/` | Future explainable risk-indicator boundary. |
| `services/investigation/` | Case-facing orchestration; currently owns the migrated synthetic fixture service. |
| `services/reporting/` | Future report/audit projection boundary. |
| `repositories/` | Persistence ports. Database-backed implementations are deferred to Phase 2. |
| `routes/` | HTTP validation/response wiring only. Legacy routes remain at `/api`; v1 starts at `/api/v1`. |

## Data and provenance

All normalized schemas carry `Provenance`: source type, provider, source URL/reference, retrieval time, method, optional confidence, raw reference and optional raw data. The available source types explicitly distinguish `SYNTHETIC`, `API`, `RPC`, `DATASET`, `INFERENCE` and `OTHER`, while retaining legacy user/model source types.

Synthetic fixtures remain separate and marked `SYNTHETIC`. A missing real adapter returns an explicit service/provider outcome in future phases; it never triggers a silent synthetic substitution.

`database/migrations/20260827_phase1_foundation.sql` is additive. It creates normalized persistence tables and indexes for case ID, wallet chain/address, transaction chain/hash, chain/block number and entity-label chain/address. It is not executed by the demo.

## Phase 2 persistence and security

Phase 2 adds a PostgreSQL-backed v1 boundary without changing the legacy `/api/*` synthetic workflow. The database uses `users`, `roles`, `permissions`, `user_roles`, `role_permissions` and `case_memberships` for explicit access control. New case data is isolated through a central authorization service plus scoped repository queries; an inaccessible case returns `NOT_FOUND` and appends an `UNAUTHORIZED_ACCESS_ATTEMPT` audit event without confirming its existence.

`cases` retains its original storage identity and now separates lifecycle (`OPEN`, `IN_PROGRESS`, `ON_HOLD`, `CLOSED`, `ARCHIVED`) from `investigation_authorization_status` (`PENDING`, `APPROVED`, `REJECTED`). `wallet_subjects` represents an investigator-provided address without asserting criminality. `audit_events` is append-only and distinct from legacy `audit_logs`.

Run migrations in order with `pnpm --filter @workspace/db migrate`. The ledger table `cashnet_schema_migrations` prevents a migration from being applied twice. `drizzle-kit push` remains development-only.

Persistent `/api/v1` routes use only a development identity boundary: set `CASHNET_DEV_AUTH_ENABLED=true` outside production and send `X-Cashnet-Dev-Actor`. The actor must map to an active database user. Production rejects this mechanism; a production identity provider is deliberately out of scope. No v1 route accepts a client-supplied role or case ownership claim.

## API and errors

Legacy `/api/*` routes are preserved for the current React generated client. New foundation metadata endpoints are:

- `GET /api/v1/health`
- `GET /api/v1/version`

Persistent route groups below `/api/v1` include cases, investigations, evidence and case audit. Wallet investigation creation persists only the investigation/wallet subject/audit transaction; it performs no blockchain lookup. Errors use `{ "error": { "code", "message", "requestId", "details?" } }`. Pino logs redact cookies, authorization/API-key headers, the development actor header and common secret-bearing request fields.

## Testing strategy

The API package uses Node's built-in test runner through the existing workspace `tsx` tool; no test dependency was added. `foundation.test.ts` covers configuration, normalized schemas/provenance, the synthetic provider contract, health/error behavior, legacy route compatibility and required migration records. Later provider adapters need recorded authorized fixtures plus pagination, timeout, rate-limit, malformed-response and empty-result tests.
