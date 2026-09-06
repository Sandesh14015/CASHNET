# Contributing to CASHNET

Thank you for improving CASHNET. The repository is currently through Phase 3; please do not begin a later phase or replace working Phase 0–3 boundaries without an approved issue or design decision.

## Before opening a change

1. Read `CASHNET_COMPLETE_PROJECT_HISTORY.txt`, `docs/PROJECT_STATUS.md`, and the relevant architecture document.
2. Keep the legacy synthetic `/api/*` workflow working.
3. Keep `/api/v1/*` routes thin; business services use repository interfaces rather than SQL directly.
4. Preserve explicit provenance and confidence. Do not invent labels, ownership, VASP attribution, or blockchain results.
5. Never add credentials, private keys, seed phrases, `.env` files, or raw sensitive case data.

## Development checks

Run the following before opening a pull request:

```bash
pnpm run typecheck
pnpm -r --if-present run test
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run build
git diff --check
```

If an API contract changes, update `lib/api-spec/openapi.yaml` first and commit the generated React/Zod artifacts. If a persistence model changes, add an additive ordered migration and update the migration ledger; do not rewrite applied migrations.

## Pull requests

Explain the problem, scope, tests, migration impact, provider/data-provenance impact, and any security implications. Keep changes small and phase-scoped. Do not add a live provider or dataset until its authorization, terms, source provenance, and failure behavior are documented.
