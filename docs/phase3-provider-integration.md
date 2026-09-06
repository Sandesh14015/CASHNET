# CASHNET Phase 3 — live blockchain provider integration

## Scope

Phase 3 adds server-side, authorized read-only collection for Ethereum, Bitcoin, and TRON. It preserves all existing Phase 1 and Phase 2 code and does not modify the legacy `/api/*` synthetic routes or redesign the frontend.

## Provider configuration

Set `CASHNET_DATA_MODE=authorized` only in an approved server environment, then configure the needed provider values. `ETHERSCAN_API_KEY`, `TRONGRID_API_KEY`, and credentials for a private Esplora deployment are secrets and must not be committed. `BITCOIN_ESPLORA_BASE_URL` must be an approved HTTPS endpoint. Optional tuning is `CASHNET_PROVIDER_TIMEOUT_MS` and `CASHNET_PROVIDER_MAX_RETRIES`.

The initial target chain is Ethereum mainnet (`ETHERSCAN_CHAIN_ID=1`). BNB Chain, Polygon and Solana remain explicit unsupported placeholders; no adapter is silently substituted for them.

## Collection and authorization

1. Create a persistent case and add the authorized actor as a case member.
2. Create a wallet investigation.
3. A supervisor updates the case authorization to `APPROVED` and transitions the investigation to `AUTHORIZED`.
4. An actor with `INVESTIGATION_EXECUTE` calls `POST /api/v1/investigations/{id}/collect`.

The service validates the subject address, collects provider responses, normalizes data, and performs wallet/transaction/child-record persistence in a PostgreSQL transaction. It records started, successful, and failed collection audit events. Direct wallet and transaction lookup routes are authenticated development-boundary routes; the investigation collection route is the case-isolated persistence path.

## Normalization and provenance

Ethereum maps native, ERC-20, internal, and contract-call metadata where the source provides it. Bitcoin preserves transaction inputs, outputs, fee, confirmation and UTXO semantics; it does not flatten Bitcoin into an account balance model. TRON maps account activity and TRC-20 transfer facts. If a token-transfer page references a transaction missing from the native page, collection retrieves that transaction before attaching and persisting the transfer. Each normalized item carries provider name, retrieval time, method, source reference, raw reference, and raw provider payload.

The database uses `chain + transaction_hash` as a global transaction identity and Phase 3 unique indexes for case-wallet and child facts. Conflict updates only refresh retrieval/confirmation information and retain existing raw observations instead of silently replacing them.

## Explicitly excluded

No VASP attribution, exchange attribution, blockchain graph tracing, clustering, ML/GNN, PS184, private-key handling, transaction broadcasting, or client-side provider credentials is included.
