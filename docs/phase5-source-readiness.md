# Phase 5 source readiness

**Phase 5 Status: CLOSED / RELEASED** — Tag `v0.5.0-phase5`

All three blockchain providers are `LIVE_VALIDATED`. The label source remains
`DATASET_PENDING_APPROVAL` (governance blocker, not software). External methodology
repositories remain `REFERENCE_ONLY` as recorded in
[phase5-tool-integration-matrix.md](phase5-tool-integration-matrix.md).

## Address intelligence: crypto-wallet-address-labels

The checkout is a candidate, not an approved operational dataset. Its repository
contains an MIT licence, but that licence does not establish rights, freshness,
or provenance for every aggregated label. CASHNET will only read a local JSON
array when `CASHNET_DATA_MODE=authorized`, `CASHNET_LABEL_DATASET_APPROVED=true`,
and path, name, version, and licence configuration are all supplied.

Before approval, an operator must record dataset source and upstream terms,
version, retrieval time, integrity hash where appropriate, supported chains,
inclusion/exclusion policy, retention decision, duplicate/conflict policy, and
last-verification/freshness policy. No dataset path, manifest, or approved
record is configured in this environment; status is `DATASET_PENDING_APPROVAL`.

## Provider readiness

All three providers are `LIVE_VALIDATED` with real blockchain data:

| Provider | Status | Live Validation Evidence |
|---|---|---|
| Etherscan V2 | `LIVE_VALIDATED` | 283 txs + 100 token transfers from Ethereum Foundation address |
| Esplora | `LIVE_VALIDATED` | 25 txs from Bitcoin genesis address via blockstream.info/api |
| TronGrid | `LIVE_VALIDATED` | 200 txs + 100 TRC-20 transfers via api.trongrid.io |

## Evaluation readiness

`evaluate-phase5` accepts a governed independent held-out data set. No such
ground truth, with provenance and an independent source from rule development,
has been supplied. Accuracy and false-positive metrics are therefore
`INSUFFICIENT_GROUND_TRUTH`, not zero or an invented percentage.
