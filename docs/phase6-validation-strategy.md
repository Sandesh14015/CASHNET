# CASHNET Phase 6 — Validation Strategy

## Hard Validation Checkpoints

After each sub-phase, the following MUST pass before proceeding:

```bash
pnpm run typecheck          # All workspace projects
pnpm -r --if-present run test  # All tests (0 failures)
pnpm --filter @workspace/api-server run build  # Production bundle
git diff --check            # Clean whitespace
```

## Provider Validation Levels

| Level | Meaning | Evidence |
|---|---|---|
| `LIVE_VALIDATED` | Full runtime path executed with real chain data | Case → collection → persistence → graph → audit |
| `IMPLEMENTED_PENDING_LIVE_VALIDATION` | Software complete, credentials unavailable | Unit tests pass, integration tests pass with fixtures |
| `IMPLEMENTED` | Code exists, not yet runtime-tested | Unit tests pass |

### Live Validation Procedure (per chain)

1. Create a legitimate investigation case
2. Add case membership for the authenticated actor
3. Authorize the investigation
4. Select the target chain and a known public address
5. Execute collection via the provider adapter
6. Validate provider response against Zod schema
7. Persist normalized data to PostgreSQL
8. Verify database records exist with correct chain, provenance, timestamps
9. Derive graph relationships from persisted transactions
10. Query graph to confirm edges exist
11. Verify audit events were created
12. Mark `LIVE_VALIDATED` only if all 11 steps succeed

If any step fails due to missing credentials/access:

- Mark `IMPLEMENTED_PENDING_LIVE_VALIDATION`
- Document the specific blocker
- Continue all other software work

Never fabricate live validation.

## Test Categories

### Unit Tests (every component)

| Category | Coverage |
|---|---|
| Provider response parsing | Valid, malformed, empty responses |
| Normalizer functions | Each chain's wallet, transaction, token transfer |
| Address validation | Valid, invalid, edge-case addresses per chain |
| Risk indicators | Fixture transactions → expected indicator output |
| Graph features | Known graph topologies → expected feature values |
| Typology rules | Indicator combinations → expected typology match |
| Evaluation metrics | Known predictions/labels → expected metric values |

### Integration Tests

| Category | Coverage |
|---|---|
| Provider router | Chain dispatch, unsupported chain error |
| Rate limiting | Retry after 429, backoff behavior |
| Timeout handling | Provider timeout → explicit error state |
| RBAC | Permission check enforcement per endpoint |
| Case isolation | Cross-case query returns empty, not error |
| Audit | Material actions produce audit events |
| Provenance | Every persisted record has valid provenance |

### Database Tests

| Category | Coverage |
|---|---|
| Migration replay | Clean database → all migrations → schema valid |
| Idempotency | Migrations run twice → no errors |
| Constraint enforcement | Invalid data → rejected by CHECK constraints |
| Index usage | Key queries use expected indexes |

### Negative Tests

| Category | Coverage |
|---|---|
| Malformed input | Invalid JSON, missing fields, wrong types |
| Unauthorized access | Missing auth, wrong role, wrong case |
| Provider failures | Timeout, 500, 429, malformed response |
| Boundary violations | Graph depth > max, result count > max |

## Evaluation Framework Validation

### Leakage Prevention

| Leakage Type | Prevention |
|---|---|
| Label leakage | Labels never in feature computation |
| Temporal leakage | Train set strictly before test set in time |
| Address leakage | No address appears in both train and test |
| Transaction leakage | No transaction in both train and test |
| Case leakage | No case in both train and test |

### Metrics Validation

Each metric function is tested with known inputs:

| Metric | Test |
|---|---|
| Precision | Known TP/FP → expected value |
| Recall | Known TP/FN → expected value |
| F1 | Harmonic mean of precision/recall |
| FPR | Known FP/TN → expected value |
| Balanced accuracy | Known per-class accuracy → expected value |
| Top-K | Known ranked list → expected hit rate |
| MRR | Known ranked list → expected reciprocal rank |
| Brier score | Known probabilities/outcomes → expected value |
| ECE | Known calibration bins → expected error |

### Evaluation Data Governance

| Rule | Enforcement |
|---|---|
| No fabricated ground truth | `INSUFFICIENT_GROUND_TRUTH` until independent corpus exists |
| No fabricated accuracy | Metrics report `null` without evaluation data |
| No fabricated calibration | Calibration reports `UNCALIBRATED` without held-out data |
| Dataset versioning | Every evaluation dataset has manifest, version, hash |
| Dataset provenance | Source, license, retrieval time, schema |

## Calibration Validation

If CASHNET displays confidence scores:

| Score Type | Label | Calibration Required |
|---|---|---|
| Ordinal confidence | `ORDINAL` | No (just ordering) |
| Ranking score | `RANKING` | No (just relative position) |
| Heuristic score | `HEURISTIC` | No, but must not claim probability |
| Calibrated probability | `CALIBRATED` | Yes — held-out data required |

Scores are explicitly labeled with their type.
A heuristic 87/100 score is NEVER called "87% probability".

## Security Validation

### Pre-Release Checks

| Check | Tool/Method |
|---|---|
| No hardcoded secrets | `grep -rn` for API keys, passwords, tokens |
| No committed .env | `.gitignore` verification |
| Dependency audit | `pnpm audit` |
| RBAC enforcement | Negative tests for every protected endpoint |
| Case isolation | Cross-case access tests |
| Input validation | Malformed input tests for every endpoint |
| Provider URL safety | Only allowlisted hostnames |

## Performance Baselines

| Operation | Target | Measured On |
|---|---|---|
| Provider request | < 10s (timeout) | Development environment |
| Database query | < 1s (statement timeout 30s) | Development environment |
| Graph traversal | < 5s for bounded depth | Development environment |
| Risk analysis | < 10s per address | Development environment |
| Build time | < 30s | Development environment |

Performance claims are qualified by measurement environment.
No "production-scale" claims from localhost benchmarks.

## Release Gate

Phase 6 tag `v0.6.0-phase6` is created only when:

1. All tests pass (0 failures)
2. All workspace projects typecheck
3. Production bundle builds
4. Git history is clean (no force-push, Phase 5 tags intact)
5. All 7 architecture documents are current
6. Security validation passes
7. No known critical defects

Items that may remain as documented limitations:

- `IMPLEMENTED_PENDING_LIVE_VALIDATION` (credential-dependent)
- `INSUFFICIENT_GROUND_TRUTH` (evaluation-data-dependent)
- `DATASET_PENDING_APPROVAL` (governance-dependent)
