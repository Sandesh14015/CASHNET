# Phase 5 Bitcoin clustering

`BitcoinClusterInferenceService` operates only on bounded Phase 3 stored Bitcoin transaction inputs and outputs. It records `cluster_inferences` and `cluster_members` as `INFERENCE`-style, review-required analytical records; it never modifies blockchain facts.

Method `bitcoin-common-input-and-cautious-change` version `1.0.0` uses a conservative common-input signal. Equal-value, many-input/many-output CoinJoin-like transactions produce `UNKNOWN`, no members, and an ambiguity reason. Two-output change candidates are retained only as `POSSIBLE_CHANGE` with `CHANGE_OUTPUT_AMBIGUOUS`; they do not establish ownership. Confidence is restricted to `UNKNOWN`, `POSSIBLE`, or `LIKELY`; heuristic output cannot be confirmed automatically.

`bitcoin-address-clustering` is MIT-licensed methodology reference only. No code, historical dataset, or claimed ownership relationship was imported. ChainForensics remains AGPL-3.0 reference only.
