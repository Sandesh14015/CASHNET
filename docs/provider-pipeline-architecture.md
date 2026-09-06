# Provider pipeline architecture

Phase 3 uses one server-side data path for authorized chain facts:

`HTTP route -> authenticated actor -> investigation/case authorization -> BlockchainService or collection service -> ProviderRouter -> chain adapter -> external API -> runtime validation/normalization -> PostgreSQL repository transaction -> audit event`.

The first supported adapters are Ethereum through Etherscan V2, Bitcoin through an approved Blockstream Esplora-compatible endpoint, and TRON through TronGrid. Each adapter implements the same typed capabilities: address validation, wallet profile, transaction history, individual transaction, token transfers, internal transactions, and block lookup. A capability that is not meaningful for a provider returns a typed `UNSUPPORTED_CAPABILITY` result; it never returns made-up data.

`CASHNET_DATA_MODE=authorized` is required before the router selects a live adapter. `synthetic` stays the default and preserves the legacy workflow. Routes are thin. Provider keys are read only by server adapters, never returned by configuration, logs, errors, audit payloads, or OpenAPI.

Provider calls use bounded timeouts, retry/backoff for transient failures, 429 mapping, and explicit malformed-response handling. Raw source payloads are retained as provenance in database JSON columns while API responses expose normalized fields. This is collection infrastructure, not attribution, tracing, graph expansion, ML, or a compliance decision engine.
