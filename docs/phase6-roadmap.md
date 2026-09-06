# CASHNET Phase 6 — Roadmap

## Dependency Graph

```
Phase 6.0  Architecture Documents
     ↓
Phase 6.1  Multi-Chain Providers (BNB, Polygon, Solana)
     ↓     HARD VALIDATION CHECKPOINT
Phase 6.2  AML / Risk Intelligence
     ↓     HARD VALIDATION CHECKPOINT
Phase 6.3  Advanced Graph + Clustering
     ↓     HARD VALIDATION CHECKPOINT
Phase 6.4  MEV / DeFi Analytics
     ↓     HARD VALIDATION CHECKPOINT
Phase 6.5  Evaluation + Calibration
     ↓     HARD VALIDATION CHECKPOINT
Phase 6.6  Production Hardening
     ↓     FINAL SECURITY / FORENSICS REVIEW
v0.6.0     Release
```

## Hard Validation Checkpoints

After each phase, verify:

```bash
pnpm run typecheck
pnpm -r --if-present run test
pnpm --filter @workspace/api-server run build
git diff --check
```

All must pass before proceeding to the next phase.

## Milestone Commits

| Milestone | Commit Message Pattern |
|---|---|
| 6.0 | `docs: Phase 6.0 architecture baseline` |
| 6.1 | `feat: Phase 6.1 multi-chain providers (BNB, Polygon, Solana)` |
| 6.2 | `feat: Phase 6.2 AML risk intelligence engine` |
| 6.3 | `feat: Phase 6.3 advanced graph and clustering` |
| 6.4 | `feat: Phase 6.4 DeFi/MEV analytics` |
| 6.5 | `feat: Phase 6.5 evaluation and calibration framework` |
| 6.6 | `feat: Phase 6.6 production hardening` |

Tag `v0.6.0-phase6` is created only after all mandatory release gates pass.

## Phase 6.0 Deliverables

7 architecture documents in `docs/`:

- `phase6-scope.md`
- `phase6-architecture.md`
- `phase6-roadmap.md` (this document)
- `phase6-security-model.md`
- `phase6-data-model.md`
- `phase6-provider-matrix.md`
- `phase6-validation-strategy.md`

## Phase 6.1 Deliverables

| Chain | Provider | Normalizer | Tests | Validation |
|---|---|---|---|---|
| BNB Chain | `bscscan-provider.ts` | `bnb*()` | Unit + integration | LIVE or PENDING |
| Polygon | `polygonscan-provider.ts` | `polygon*()` | Unit + integration | LIVE or PENDING |
| Solana | `solana-provider.ts` | `solana*()` | Unit + integration | LIVE or PENDING |

Plus: migration, config, provider-router extension, graph extension, audit.

## Phase 6.2 Deliverables

- `AMLRiskIndicatorService` with modular indicator plugins
- Risk typology framework
- Risk API endpoints (RBAC-protected)
- Evidence fusion extension
- PostgreSQL migration for risk tables

## Phase 6.3 Deliverables

- Graph feature extraction service
- Advanced path scoring
- Community detection
- Chain-specific clustering extensions
- Bounded execution enforcement

## Phase 6.4 Deliverables

- DeFi interaction identification
- MEV candidate detection (historical only)
- Protocol/router recognition
- PostgreSQL migration for DeFi tables

## Phase 6.5 Deliverables

- Evaluation framework with leakage prevention
- Calibration analysis
- False positive categorization
- Score type labeling

## Phase 6.6 Deliverables

- JWT/OIDC authenticator (provider-neutral)
- Extended RBAC with new roles/permissions
- API security middleware
- Dockerfile + docker-compose
- CI workflow
- Observability (metrics, health probes)
- Backup/restore documentation
- Forensic report generator
