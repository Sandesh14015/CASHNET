# Phase 5 address intelligence

Phase 5 adds a case-scoped, read-only address-intelligence layer. An observation is a sourced statement about an address, never proof of wallet ownership or a natural-person identity.

`GET /api/v1/investigations/:id/address-intelligence/:chain/:address` first returns persisted observations. If none exist, it may read the local `ApprovedDatasetAddressIntelligenceProvider` only when all of the following are set: authorized data mode, an approved dataset path, dataset name, version, and licence. The default is `NOT_CONFIGURED`; no reference dataset is silently imported.

Each observation preserves chain/address, label/entity type, source/reference/URL, dataset name/version/licence, retrieval and verification timestamps, freshness, confidence, status, raw reference, and optional raw data. A label becomes `FRESH`, `STALE`, `EXPIRED`, or `UNKNOWN` according to verification age. Different entity names remain visible as a conflict rather than being collapsed to one answer.

The local `crypto-wallet-address-labels` repository was inspected: its repository licence is MIT, but its aggregate data has upstream sources. It is a **source candidate only** until a dataset-level licence, version, provenance, freshness, retention policy, and explicit operator approval are recorded.
