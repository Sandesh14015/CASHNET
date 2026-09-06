# Phase 5 accuracy-evaluation protocol

No operational accuracy percentage has been measured. The current result is **INSUFFICIENT_GROUND_TRUTH** because there is no approved independent label dataset or controlled live database in this environment.

The `@workspace/scripts evaluate-phase5` command accepts a held-out JSON array with `id`, `actual` (`POSITIVE`/`NEGATIVE`), `predicted` (`POSITIVE`/`NEGATIVE`/`UNKNOWN`), and optional ranking fields. It deterministically reports TP, FP, FN, TN, UNKNOWN, precision, recall, F1, false-positive/negative rates, coverage, top-1, top-3, and MRR.

Evaluation data must have independent ground truth, provenance, source version, retrieval date, licence, inclusion criteria, exclusion criteria, and a strict separation from source-data/rule design. Report confidence as a score, never a probability, unless separately calibrated. A 90% target is not an acceptance result.
