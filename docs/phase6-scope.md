# CASHNET Phase 6 — Scope

**Baseline:** v0.5.0-phase5 (immutable)

## Goal

Extend CASHNET from a 3-chain forensic investigation platform into an
industry-grade multi-chain blockchain forensics / cyber-cell system with
deterministic AML risk intelligence, advanced graph analysis, DeFi/MEV
analytics, independent evaluation, and production-grade security.

## Capability Boundaries

### In Scope

| Area | Deliverable |
|---|---|
| Multi-chain providers | BNB Chain, Polygon, Solana |
| AML risk intelligence | Deterministic, versioned, explainable risk indicators and typologies |
| Advanced graph | Multi-hop scoring, path diversity, temporal analysis, community detection |
| Clustering | Chain-specific methodology for Bitcoin, EVM, Solana, TRON |
| DeFi/MEV | DEX interaction, swap recognition, sandwich candidates, arbitrage candidates |
| Evaluation | Precision, recall, F1, calibration, false-positive analysis framework |
| Production auth | Generic OIDC/JWT verification (provider-neutral) |
| RBAC | Extended roles, least-privilege permissions |
| Deployment | Dockerfile, docker-compose, CI, health/readiness probes |
| Observability | Structured logs, metrics, provider health |
| Reporting | Forensic report generation with provenance chain |

### Not In Scope (Phase 7+)

| Item | Reason |
|---|---|
| Real-time mempool monitoring | Requires separate infrastructure; Phase 6 uses historical data only |
| Cross-chain identity resolution | Requires validated methodology and governance |
| Graph neural networks (GNN) | Requires independent evaluation, governance, and calibration |
| Private key handling | Never in scope for a forensic investigation platform |
| Transaction broadcast | Not an investigation function |
| Person attribution | A candidate is not a person identification |
| PS184/Travel Rule | Requires regulatory framework |
| Chainabuse commercial API | Requires procurement and contract |
| "All major chains" | Only BNB, Polygon, Solana added in Phase 6 |

## Evidence Classification Hierarchy

Every automated output must be classified:

```
FACT            — observed on-chain, provider-verified
OBSERVATION     — derived from facts with provenance
INFERENCE       — heuristic-derived, method-versioned
ASSESSMENT      — scored candidate with evidence fusion
CANDIDATE       — review-required attribution candidate
REVIEWED        — human-reviewed conclusion
```

No automated output may claim person identity or criminal activity.

## Phase 5 Preservation

Phase 5 functionality is preserved unchanged:

- 3 live-validated providers (Bitcoin, Ethereum, TRON)
- Address intelligence boundary
- Bitcoin clustering
- Evidence fusion
- VASP candidate generation
- Human review
- Audit
- RBAC
- Case isolation
- 32/32 tests

Phase 6 extends Phase 5 through additive changes only.
No Phase 5 migration may be modified.
No Phase 5 tag may be rewritten.
