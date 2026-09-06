# CASHNET current implementation status — 2026-09-01

## Overall status

Phases 0–5 remain historical implementation/release checkpoints. Phase 6 has post-tag corrective work for migration compatibility, persistent analytics, guarded APIs, JWT verification, middleware, observability, and container/runtime configuration. Its authoritative current state is [phase6-final-production-readiness.md](phase6-final-production-readiness.md): it is conditional, not production-ready.

## Repository integration

`CASHNET` remains the root repository. The eight repositories requested by the project plan are present under `references/` for read-only architectural and data-format study: Open-Source-Blockchain-Forensics, chainforensics, am-i-exposed, evidencly-platform, crypto-wallet-address-labels, bitcoin-address-clustering, mev-wallet-cluster-analysis, and dtcch-2025-OpenAML. No source code was copied into CASHNET. In particular, the AGPL ChainForensics code was not incorporated.

## Backend pipeline

The backend now provides versioned Phase 2–5 API boundaries alongside untouched legacy synthetic `/api/*` routes. Phase 5 consumes stored facts/graph links and an explicitly approved local label source only; it surfaces freshness/conflicts, classifies service leads, and keeps cluster output review-required. It makes no person-identity claim and has no default external intelligence source.

## Working verification

The current corrective branch passes TypeScript checking, OpenAPI generation, **56 API/unit tests**, production API build, and `git diff --check`. The authorised running API returned 200 for health/version/readiness/metrics and executed controlled PostgreSQL-backed AML, graph/community and historical DeFi/MEV flows; empty inputs produced zero findings rather than fabricated intelligence. A local production-mode HTTP probe separately verified HSTS, CSP, request IDs, CORS allowlisting, safe metrics, and fail-closed readiness without a database configuration.

## Environment status

Supabase PostgreSQL is now the intended single authoritative CASHNET runtime
database. Current source no longer configures the API, Compose, migrations, or
normal development workflow to use the Windows PostgreSQL service or a local
PostgreSQL container. Actual Supabase connection, replay, and operational
evidence require an authorised project URL supplied through the environment;
none is present in this Codex task context.

The operator's authorised PowerShell session completed the real PostgreSQL validator against `cashnet`: first migration pass, idempotent second pass, complete Phase 0–6 ledger, Phase 6 tables/indexes/constraints/foreign keys, immutable-audit trigger, and real audit `UPDATE`/`DELETE` rejection all passed. This Codex process still does not inherit the secret-bearing connection string, so it does not repeat that command or print the value. Provider credentials/endpoints, Docker CLI/daemon, an approved label dataset, and an independent held-out ground-truth corpus were not supplied to this process; those gates remain precisely classified rather than claimed as passed.

## Next action

Run the guarded non-empty analytical validation from the already authorised PowerShell session: `pwsh -File .\scripts\validate-phase6-nonempty.ps1 -ConfirmCreateValidationFixture`. It creates a separately numbered, explicitly marked validation fixture and exercises privileged reporting plus persisted AML, graph, community and historical DeFi/MEV output. Then run the isolated backup/restore drill and any legitimately configured provider collection flows.
