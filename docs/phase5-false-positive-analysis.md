# Phase 5 false-positive analysis

No live false-positive count exists yet because no independent evaluation set has been approved. Each future incorrect result must record case/investigation, address, expected entity/service, predicted candidate, evidence IDs, source versions, graph path, method versions, decision, and reviewer outcome.

Use one of: `SOURCE_ERROR`, `GRAPH_ERROR`, `CLUSTERING_ERROR`, `LABEL_ERROR`, `SCORING_ERROR`, `INSUFFICIENT_DATA`, `CONFLICT`, or `TEMPORAL_ERROR`. Conflicting labels and stale labels are retained as negative/contradictory evidence; they are not overwritten. CoinJoin-like and ambiguous change behavior remain `UNKNOWN` or review-required inference to minimize false ownership claims.

Produce a confusion matrix and ranked-candidate error table only from the held-out dataset. Never describe an unmeasured fixture result as field accuracy.
