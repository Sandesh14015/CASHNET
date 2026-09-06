# Phase 5 evidence and confidence model

Every candidate is navigable backwards: candidate → `attribution_evidence` → address observation / graph relationship / cluster inference → Phase 3 normalized fact and provenance. Evidence has a category, polarity, contribution, source metadata, retrieval time, method/version, raw reference, and details.

The deterministic policy is `deterministic-attribution-evidence-fusion` version `1.0.0`:

- fresh approved public service label: 45;
- stored graph proximity: up to 20;
- independent source agreement: 15;
- cautious cluster support: 5;
- stale/expired label: −15;
- conflicting label: −35.

Scores are clamped to 0–100. `UNKNOWN` is returned for missing evidence, conflicts, scores below 30, or contradictions. `LIKELY` requires a score of at least 70 and at least two independent sources. A score never becomes `CONFIRMED`; confirmation requires human review and an explicit institutional evidence policy. Graph contribution is calculated only from relationships touching the candidate address. Chainabuse has no adapter and is `OPTIONAL_NOT_CONFIGURED`. No report is fabricated.
