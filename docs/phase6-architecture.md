# CASHNET Phase 6 — Architecture

## Existing Architecture (Phase 5 Baseline)

```
Investigator / Supervisor
        ↓
   Express API  (routes/v1/)
        ↓
   Authentication  (DevelopmentActorAuthenticator)
        ↓
   RBAC  (permission checks)
        ↓
   Case isolation  (case_memberships JOIN)
        ↓
   Service layer
        ↓
   ┌──────────────────────────────────────────────┐
   │  Cases │ Investigations │ Evidence │ Audit    │
   │  Graph │ Intelligence │ Collection │ Review   │
   └──────────────────────────────────────────────┘
        ↓
   Repository layer  (postgres-repositories.ts)
        ↓
   PostgreSQL  (Drizzle ORM, raw SQL via sql`...`)
        ↓
   Provider Router → Provider Adapters
        ↓
   ┌─────────┬───────────┬──────────┐
   │ Esplora │ Etherscan │ TronGrid │
   └─────────┴───────────┴──────────┘
```

### Key Interfaces (DO NOT replace)

| Interface | File | Purpose |
|---|---|---|
| `BlockchainFactProvider` | `services/blockchain/types.ts` | Chain provider contract |
| `ProviderRouter` | `services/blockchain/provider-router.ts` | Chain→provider dispatch |
| `RepositoryContext` | `repositories/repository-context.ts` | 9 repository ports |
| `PostgresRepositories` | `repositories/postgres-repositories.ts` | PostgreSQL implementation |
| `CashnetConfig` | `config/index.ts` | Environment configuration |

### Data Model (DO NOT duplicate)

| Schema | File | Chains |
|---|---|---|
| `ChainSchema` | `schemas/models.ts` | Already includes BNB_CHAIN, POLYGON, SOLANA |
| `BlockchainTransactionSchema` | `schemas/models.ts` | Chain-agnostic with chain field |
| `TokenTransferSchema` | `schemas/models.ts` | Chain-agnostic |
| `ContractInteractionSchema` | `schemas/models.ts` | Chain-agnostic |

### Database (DO NOT restructure)

All existing tables use `chain TEXT` columns. New chains are stored in
existing tables without schema changes for core blockchain data.

## Phase 6 Extension Architecture

### Provider Layer Extension

```
                    ProviderRouter
                          │
      ┌───────────┬───────┼────────┬───────────┬──────────┐
      ↓           ↓       ↓        ↓           ↓          ↓
   Bitcoin    Ethereum   TRON    BNB Chain   Polygon    Solana
   (Esplora)  (Etherscan)(TronGrid)(BscScan)(PolygonScan)(RPC)
```

Each provider implements `BlockchainFactProvider`:

```
address validation
      ↓
authorization check (dataMode === "authorized")
      ↓
external HTTP request (http-client.ts)
      ↓
timeout / retry / rate limit
      ↓
response validation
      ↓
chain-specific normalization
      ↓
provenance attachment
      ↓
ProviderResult<T> return
```

### Service Layer Extension

```
Phase 5 services (UNCHANGED)
      │
      ├── AddressIntelligenceService
      ├── BitcoinClusterInferenceService
      ├── VaspCandidateService
      ├── AttributionEvidenceFusionService
      ├── GraphTracingService
      ├── EvidenceService
      ├── BlockchainCollectionService
      └── CaseService

Phase 6 NEW services
      │
      ├── AMLRiskIndicatorService          (6.2)
      ├── RiskTypologyFramework            (6.2)
      ├── GraphFeatureService              (6.3)
      ├── CommunityDetectionService        (6.3)
      ├── ChainSpecificClusteringService   (6.3)
      ├── DeFiInteractionService           (6.4)
      ├── MEVDetectionService              (6.4)
      ├── EvaluationFramework              (6.5)
      ├── CalibrationService               (6.5)
      ├── FalsePositiveAnalyzer            (6.5)
      ├── JWTAuthenticator                 (6.6)
      ├── ReportGenerator                  (6.6)
      └── ObservabilityService             (6.6)
```

### Repository Layer Extension

New repositories added to `RepositoryContext`:

| Repository | Tables |
|---|---|
| `RiskRepository` | `risk_indicators`, `risk_indicator_evidence`, `risk_analysis_runs` |
| `TypologyRepository` | `risk_typologies` |
| `DeFiRepository` | `defi_protocol_interactions`, `mev_candidates` |
| `GraphFeatureRepository` | `graph_features` |
| `ReportRepository` | `forensic_reports` |

Existing repositories remain unchanged. New repositories follow the same
`Executor`-based pattern.

### Normalization Boundaries

| Chain | Normalizer | Provider | Model Mapping |
|---|---|---|---|
| Bitcoin | `bitcoinTransaction()` | Esplora | UTXO inputs/outputs preserved |
| Ethereum | `evmTransaction()` | Etherscan V2 | EVM standard fields |
| TRON | `tronTransaction()` | TronGrid | TRC-20 specific handling |
| BNB Chain | `bnbTransaction()` | BscScan | EVM standard + BNB-specific metadata |
| Polygon | `polygonTransaction()` | PolygonScan | EVM standard + Polygon-specific metadata |
| Solana | `solanaTransaction()` | Solana RPC | signature/slot/instruction model |

BNB and Polygon reuse the EVM normalization pattern but with independent
provider validation. Solana has a completely separate normalizer.

### Authentication Architecture (Phase 6.6)

```
Request
    ↓
┌─────────────────────────────────┐
│ AuthenticationMiddleware        │
│   ↓                             │
│ if (production)                 │
│   → JWTAuthenticator            │
│     ↓ JWKS / OIDC discovery     │
│     ↓ issuer, audience, expiry  │
│     ↓ signature verification    │
│     ↓ role mapping              │
│ else if (development)           │
│   → DevelopmentActorAuth        │
│     (existing, unchanged)       │
└─────────────────────────────────┘
    ↓
  Actor { id, username, roles, permissions }
    ↓
  RBAC permission checks (unchanged)
```

### Database Migration Strategy

All Phase 6 changes are additive migrations in `database/migrations/`:

| Migration | Phase | Content |
|---|---|---|
| `20260901_phase6_multichain.sql` | 6.1 | Chain-specific indexes, new permissions |
| `20260901_phase6_risk.sql` | 6.2 | Risk tables, typology tables |
| `20260901_phase6_graph.sql` | 6.3 | Graph feature tables |
| `20260901_phase6_defi.sql` | 6.4 | DeFi/MEV tables |
| `20260901_phase6_production.sql` | 6.6 | Production RBAC, reporting tables |

No existing migration is modified. Each migration is idempotent
(`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
