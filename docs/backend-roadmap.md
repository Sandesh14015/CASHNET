# CASHNET Backend Roadmap

## Phase 0 — Inspection complete

Completed in this documentation-only change:

- Inspected CASHNET workspace, API contract, API/UI, database materials, provider seam, environment file, Replit configuration and test/deployment state.
- Cloned and reviewed the eight reference repositories under `references/`.
- Recorded architecture, source/license risks and adoption decisions.

No functional application source, generated contract, dependency, environment value or database schema has changed.

## Phase 1 — Stabilize service boundaries

1. Split `artifacts/api-server/src/routes/cashnet.ts` into routes, synthetic provider, case repository and response-assembly service without changing synthetic response behavior.
2. Replace `unknown`-returning provider interfaces with typed ports and result/error envelopes.
3. Create shared provenance/evidence types; define source-type vocabulary and adapter error taxonomy.
4. Add a test runner and baseline route/service tests around current synthetic behavior.

**Exit criteria:** Existing UI workflow still passes against synthetic mode; generated client/Zod contract is regenerated and typecheck passes.

## Phase 2 — Authorization, persistence and audit — implemented

1. Added PostgreSQL identity/RBAC tables, case memberships, persistent case/investigation/wallet-subject/evidence repositories and append-only security audit events.
2. Added ledger-backed ordered migration runner and Drizzle schema definitions without replacing the existing PostgreSQL mechanism.
3. Added development-only actor authentication, centralized authorization, non-enumerating inaccessible-case responses and atomic creation flows.
4. Added `/api/v1` persistence endpoints. Wallet investigation creation stores only authorized case work; blockchain collection remains deferred.

**Exit criteria:** Cross-case access fails safely and creates auditable denials. Investigation execution requires an approved case; collection remains deferred to later provider phases.

## Phase 3 — Provider abstraction and normalization

1. Add chain-neutral request/result ports, adapter configuration validation, timeout/retry/rate-limit policy and recorded fixture harness.
2. Implement one Bitcoin Esplora adapter, then one EVM explorer adapter, then one TRON adapter—each server-side only.
3. Normalize Bitcoin UTXOs/outpoints and EVM normal/internal/ERC-20 records without lossy UI-oriented formatting.
4. Store raw-response references/hashes and retrieval provenance.

**Exit criteria:** Unit tests cover pagination, rate limiting, timeouts, malformed payloads and empty results for each adapter; no key appears in browser bundle, git, seed data or logs.

## Phase 4 — Wallet investigation endpoint

1. Add OpenAPI and Zod contract for `POST /api/v1/investigations/wallet`.
2. Validate address/chain/time range/depth and enforce case authorization.
3. Return wallet profile, normalized facts, counterparties, source outcomes, evidence and explicit truncation status.
4. Keep a synthetic implementation of the same contract for test/demo mode.

**Exit criteria:** An authorized Ethereum, Bitcoin and TRON fixture produces source-provenanced results; unsupported/unavailable inputs report an explicit status.

## Phase 5 — Bounded graph and trace engine

1. Build deterministic bounded BFS with node/edge/branch/time/amount caps and cancellation.
2. Represent each discovered relationship with its transaction/UTXO evidence, direction, asset, amount, time and provider reference.
3. Add relevance/path-ranking rules that are explainable and versioned.
4. Implement Bitcoin forward/backward tracing and clearly mark clustering/change heuristics as inference.

**Exit criteria:** Tests prove `WA → WB`, `WA → WC`, `WB → WD`, `WC → WE`, enforce depth/branch caps, dedupe paths and retain edge evidence.

## Phase 6 — Entity/VASP intelligence and evidence

1. Create reviewed label-import manifest and entity/address-label schema.
2. Implement label matching, conflict management, expiry/verification and evidence aggregation.
3. Generate VASP candidates with status/confidence/evidence; distinguish service attribution from customer identity.
4. Add Chainabuse only as an optional threat-intelligence adapter with graceful unavailability.

**Exit criteria:** Tests cover known/unknown/conflicting labels, low-confidence and missing-evidence cases. No candidate is presented as fact without supporting evidence.

## Phase 7 — Explainable risk and reporting

1. Implement deterministic first-pass signals: reports, risky labels, velocity, forwarding, fan-in/out and repeated authorized-case appearances.
2. Include inputs, calculations, rule version, provenance and uncertainty in every score.
3. Extend report sections with fact/inference distinction, audit events, evidence citations and limitations.
4. Evaluate OpenAML only through a separately governed research/validation effort.

**Exit criteria:** Risk output is reproducible from retained evidence and never asserts criminality or identity.

## Phase 8 — Frontend and delivery

1. Refine the existing investigator UI to expose data mode, source status, evidence drill-down, case authorization and trace truncation.
2. Regenerate client hooks/schemas whenever OpenAPI changes; preserve the present synthetic workflow.
3. Add Docker/VPS manifests, secret injection, migrations, backups, readiness checks, observability and deployment runbook.
4. Add Sandbox-only NCRP/SAHYOG adapters after official specifications are available.

**Exit criteria:** Deployment has no demo secrets, has a clear synthetic/real operating mode, and communicates unsupported integrations honestly.

## Explicitly deferred

- PS184 is not part of this roadmap and remains a future independent service.
- Live NCRP, SAHYOG, banking and VASP disclosure workflows require external authorization and official contracts.
- AGPL ChainForensics integration requires prior legal approval.
- Production ML scoring requires an approved data-governance, validation and monitoring plan.
