# CASHNET Target Architecture

## Baseline observed

CASHNET is a pnpm workspace. `artifacts/cashnet` is the React/TypeScript investigator UI. `artifacts/api-server` is an Express 5 API. `lib/api-spec/openapi.yaml` is the source contract, generating the React Query client in `lib/api-client-react` and Zod schemas in `lib/api-zod`. `lib/db` is presently a Drizzle scaffold, while `database/schema.sql` defines only `cases` and `audit_logs`.

The current API is deliberately a deterministic, in-memory synthetic graph in `artifacts/api-server/src/routes/cashnet.ts`. Existing routes cover cases, complaints, analysis, fund-flow, wallets, predictions, interventions and reports. `artifacts/api-server/src/providers/interfaces.ts` has initial `BlockchainProvider`, `BankProvider`, `VASPProvider` and event-bus interfaces, but the route does not yet use a concrete provider. `.env.example` defaults `CASHNET_DATA_MODE=synthetic` and names future provider variables. There are no application tests, Dockerfiles or production deployment manifests in CASHNET at this revision.

## Target boundaries

```text
React investigator UI
        | generated client; never provider credentials
Express API / OpenAPI / Zod
        |
Authorization + case gate + audit
        |
Investigation orchestration service
  |        |           |           |
screening  gateway    trace       entity/VASP + risk
  |        |           |           |
fixtures   chain adapters  normalized facts  evidence-backed inferences
        |                 |
raw-response store       PostgreSQL / object storage
```

The synthetic provider remains an implementation of the same service contract. It is not a fallback that silently mixes records with external results.

## Proposed server module layout

This is a target layout for later phases, not a code change in this report.

```text
artifacts/api-server/src/
  routes/investigations.ts              # HTTP only
  services/investigations/              # authorization, orchestration, response assembly
  services/screening/                   # deterministic indicators and explainable scoring
  services/tracing/                     # bounded BFS, path ranking and stop reasons
  gateways/blockchain/                  # provider-neutral ports and chain adapters
    evm/ etherscan-v2.ts
    bitcoin/ esplora.ts
    tron/ trongrid.ts
  intelligence/entities/                # reviewed labels and VASP candidate resolution
  evidence/                             # evidence IDs, hashes, provenance and confidence rules
  persistence/                          # repositories, raw-source references and migrations
  providers/synthetic/                  # existing seeded behaviour preserved as fixtures
  integrations/ncrp/ and integrations/sahyog/ # interfaces + sandbox fixtures only
  audit/
```

## Core invariants

- Deep investigation requires an `APPROVED` case and an authorized actor. Screening can return a deliberately limited result without deep traversal.
- A blockchain fact, analytical inference, entity/service attribution and real-world identity are different data types and render differently in UI/reporting.
- Every external datum retains `provider`, `source_type`, `source_reference`, `retrieved_at`, method and evidence. Recommended `source_type`: `SYNTHETIC`, `API`, `RPC`, `DATASET`, `INFERENCE`, `OTHER` (with `USER_PROVIDED` retained for complaint intake).
- Adapter credentials are server-only environment/secret values. Never forward keys or arbitrary provider URLs from the UI.
- Empty, rate-limited, malformed, partial and unavailable responses are explicit outcomes—not synthetic substitutions.
- Traversal is bounded by `max_depth`, `max_branch_per_node`, global node/edge caps, time range, amount threshold, supported chains and cancellation/time budget.
- No LLM establishes a transaction, entity or attribution relationship. Narrative generation, if later enabled, only summarizes already-cited structured results.

## Normalized model

The persistence/schema work should introduce these concepts: `Case`, `Investigation`, `Wallet`, `BlockchainTransaction`, `TransactionInput`, `TransactionOutput`, `TokenTransfer`, `ContractInteraction`, `WalletRelationship`, `Entity`, `AddressLabel`, `VASPCandidate`, `Evidence`, `RiskIndicator`, `InvestigationEvent`, and `AuditEvent`.

`BlockchainTransaction` is chain-neutral but keeps chain-specific detail in typed child records. Bitcoin must preserve txid, vin/vout, prior txid/output index, satoshis, script/address, UTXO/spend status, block height/hash/time, fee and confirmations. EVM records retain normal/internal/token-transfer distinction, block/index, from/to/value, gas fields, receipt status, input/method/contract details and confirmation/error information. TRON records retain TRX/TRC-20, block, contract and direction data.

`Evidence` should be append-only and contain: ID, subject/claim ID, evidence type, chain, transaction hash or dataset row reference, provider/source URL, raw-response reference/content hash, retrieved time, assertion method, confidence contribution and reviewer state. `VASPCandidate` must contain candidate entity/service—not customer identity—status (`CONFIRMED`, `LIKELY`, `POSSIBLE`, `UNKNOWN`, `INSUFFICIENT_EVIDENCE`), confidence, labels and evidence IDs.

## First endpoint contract

Add `POST /api/v1/investigations/wallet` only after the case gate and normalized service exist. Its request shape is:

```json
{
  "wallet_address": "string",
  "chain": "ETHEREUM | BITCOIN | TRON",
  "case_id": "string",
  "investigation_depth": 1,
  "optional_start_time": "RFC 3339 timestamp",
  "optional_end_time": "RFC 3339 timestamp"
}
```

The response should include wallet profile, blockchain, normalized transactions and token transfers where applicable, counterparties, graph nodes/edges, entity matches, VASP candidates, attribution status, evidence, confidence, status and provenance. It must also return truncation/stop reasons, adapter outcomes and an explicit `data_mode`; an unknown or unavailable provider never becomes an invented result.

## Trace behaviour

Start from the seed, fetch its authorized history, normalize facts, extract eligible counterparties, score relevance deterministically, then BFS only until configured caps are met. Each edge includes its transaction/UTXO proof, chain, timestamp, asset, amount, source and raw reference. Dedupe by chain-aware address and transaction identity. Repeated paths become a graph, not duplicate facts. Label-based priority may affect ordering but may not manufacture edges.

## Security and operation

- Separate environment configuration by adapter (`ETHERSCAN_API_KEY`, an approved Bitcoin endpoint, `TRONGRID_API_KEY`) and validate it at boot without logging secret values.
- Add PostgreSQL migrations/Drizzle tables before storing authorized case evidence; use RLS/tenant case scoping and immutable audit events.
- Store raw payloads in protected object storage or encrypted database records according to retention policy; persist a safe pointer/hash in application tables.
- Add a Docker/VPS plan only after API configuration, migrations, rate limits, health/readiness endpoints, backups and secret injection are tested.
- NCRP and SAHYOG remain interfaces/sandbox fixtures until official access, legal authorization and published API contracts exist.
