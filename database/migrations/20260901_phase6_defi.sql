-- Phase 6.4: DeFi/MEV analytics.

INSERT INTO permissions (code, description) VALUES
  ('DEFI_ANALYZE', 'Execute DeFi/MEV analysis on investigation data')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'DEFI_ANALYZE'
WHERE r.code IN ('ADMIN', 'SUPERVISOR', 'INVESTIGATOR')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS defi_protocol_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  protocol_name TEXT,
  protocol_address TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN
    ('SWAP', 'LIQUIDITY_ADD', 'LIQUIDITY_REMOVE', 'BORROW', 'REPAY', 'FLASH_LOAN', 'BRIDGE', 'OTHER')),
  token_in TEXT, amount_in TEXT,
  token_out TEXT, amount_out TEXT,
  router_address TEXT,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_defi_interactions_lookup
  ON defi_protocol_interactions (case_id, investigation_id, chain, protocol_address);

CREATE TABLE IF NOT EXISTS mev_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  mev_type TEXT NOT NULL CHECK (mev_type IN
    ('SANDWICH', 'ARBITRAGE', 'LIQUIDATION', 'OTHER')),
  confidence_level TEXT NOT NULL CHECK (confidence_level IN
    ('CANDIDATE', 'LIKELY', 'REVIEW_REQUIRED')),
  front_run_hash TEXT,
  victim_hash TEXT,
  back_run_hash TEXT,
  pool_address TEXT,
  profit_estimate TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mev_candidates_lookup
  ON mev_candidates (case_id, investigation_id, chain, mev_type);
