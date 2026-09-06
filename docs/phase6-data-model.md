# CASHNET Phase 6 — Data Model

## Existing Tables (Phase 1–5, UNCHANGED)

| Table | Phase | Purpose |
|---|---|---|
| `users` | 1 | User accounts |
| `roles` | 1 | Role definitions |
| `permissions` | 1 | Permission definitions |
| `user_roles` | 1 | User→role assignments |
| `role_permissions` | 1 | Role→permission assignments |
| `cases` | 1 | Investigation cases |
| `case_memberships` | 1 | Case→user access |
| `investigations` | 1 | Investigation records |
| `wallet_subjects` | 1 | Investigation subjects |
| `wallets` | 2 | Persisted wallet profiles |
| `evidence` | 2 | Evidence records with provenance |
| `audit_events` | 2 | Append-only audit trail |
| `blockchain_transactions` | 3 | Normalized transactions (all chains) |
| `transaction_inputs` | 3 | Bitcoin UTXO inputs |
| `transaction_outputs` | 3 | Bitcoin UTXO outputs |
| `token_transfers` | 3 | Token transfers (all chains) |
| `contract_interactions` | 3 | Contract interactions (all chains) |
| `investigation_graph_relationships` | 4 | Graph edges with provenance |
| `address_intelligence_observations` | 5 | Address label observations |
| `cluster_inferences` | 5 | Clustering results |
| `cluster_members` | 5 | Cluster membership |
| `service_address_assessments` | 5 | Service address analysis |
| `vasp_candidates` | 1+5 | VASP/service candidates (evolved) |
| `attribution_evidence` | 5 | Evidence fusion records |
| `abuse_intelligence_observations` | 5 | Abuse report schema (unused) |
| `attribution_reviews` | 5 | Human review decisions |

## Phase 6 New Tables

### Phase 6.1 — Multi-Chain

No new tables for blockchain data storage. Existing `blockchain_transactions`,
`token_transfers`, `contract_interactions` already use `chain TEXT`.

```sql
-- Chain-specific indexes for query performance
CREATE INDEX IF NOT EXISTS idx_transactions_bnb
  ON blockchain_transactions (case_id, from_address, to_address)
  WHERE chain = 'BNB_CHAIN';

CREATE INDEX IF NOT EXISTS idx_transactions_polygon
  ON blockchain_transactions (case_id, from_address, to_address)
  WHERE chain = 'POLYGON';

CREATE INDEX IF NOT EXISTS idx_transactions_solana
  ON blockchain_transactions (case_id, transaction_hash)
  WHERE chain = 'SOLANA';
```

New permissions for chain-specific collection authorization.

### Phase 6.2 — AML Risk

```sql
CREATE TABLE risk_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','PARTIAL')),
  indicator_count INTEGER NOT NULL DEFAULT 0,
  total_risk_score NUMERIC CHECK (total_risk_score >= 0 AND total_risk_score <= 100),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES risk_analysis_runs(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  address TEXT,
  transaction_hash TEXT,
  indicator_type TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN
    ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  score_contribution NUMERIC NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN
    ('LOW','MEDIUM','HIGH')),
  description TEXT NOT NULL,
  explanation TEXT NOT NULL,
  observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_indicator_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES risk_indicators(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  value TEXT,
  source TEXT,
  source_reference TEXT,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_typologies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL,
  indicator_types TEXT[] NOT NULL,
  min_indicators INTEGER NOT NULL DEFAULT 1,
  severity TEXT NOT NULL CHECK (severity IN
    ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Phase 6.3 — Graph Features

```sql
CREATE TABLE graph_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  scope_description TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, investigation_id, chain, lower(address), feature_type, method, method_version)
);
```

### Phase 6.4 — DeFi/MEV

```sql
CREATE TABLE defi_protocol_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  protocol_name TEXT,
  protocol_address TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN
    ('SWAP','LIQUIDITY_ADD','LIQUIDITY_REMOVE','BORROW','REPAY','FLASH_LOAN','BRIDGE','OTHER')),
  token_in TEXT, amount_in TEXT,
  token_out TEXT, amount_out TEXT,
  router_address TEXT,
  method TEXT NOT NULL, method_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mev_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  mev_type TEXT NOT NULL CHECK (mev_type IN
    ('SANDWICH','ARBITRAGE','LIQUIDATION','OTHER')),
  confidence_level TEXT NOT NULL CHECK (confidence_level IN
    ('CANDIDATE','LIKELY','REVIEW_REQUIRED')),
  front_run_hash TEXT, victim_hash TEXT, back_run_hash TEXT,
  pool_address TEXT, profit_estimate TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  method TEXT NOT NULL, method_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Phase 6.6 — Production

```sql
CREATE TABLE forensic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID REFERENCES investigations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  generated_by UUID REFERENCES users(id),
  report_type TEXT NOT NULL CHECK (report_type IN
    ('INVESTIGATION_SUMMARY','RISK_ASSESSMENT','GRAPH_ANALYSIS','FULL_FORENSIC')),
  content JSONB NOT NULL,
  method_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Migration Policy

- Every migration is additive and idempotent
- `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`
- No existing migration is modified
- Migration ordering is deterministic (timestamp prefix)
- Clean database replay produces identical schema
- Each migration is independently testable
