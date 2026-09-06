-- Phase 6.2: AML Risk Intelligence — deterministic, explainable risk indicators and typologies.
-- Every risk indicator is versioned, evidence-linked, and case-scoped.
-- A risk indicator is NOT proof of criminal activity.

-- Permissions
INSERT INTO permissions (code, description) VALUES
  ('RISK_ANALYZE', 'Execute AML risk analysis on investigation subjects'),
  ('RISK_READ', 'Read risk indicators and typology results')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('RISK_ANALYZE', 'RISK_READ')
WHERE r.code IN ('ADMIN', 'SUPERVISOR')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('RISK_ANALYZE', 'RISK_READ')
WHERE r.code IN ('INVESTIGATOR')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('RISK_READ')
WHERE r.code IN ('ANALYST', 'VIEWER')
ON CONFLICT DO NOTHING;

-- Risk analysis runs (one per address per investigation execution)
CREATE TABLE IF NOT EXISTS risk_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL')),
  indicator_count INTEGER NOT NULL DEFAULT 0,
  total_risk_score NUMERIC CHECK (total_risk_score >= 0 AND total_risk_score <= 100),
  created_by UUID REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_runs_lookup
  ON risk_analysis_runs (case_id, investigation_id, chain, lower(address));

-- Phase 1 already owns risk_indicators. Evolve that released table instead of
-- attempting to create a second incompatible meaning for the same table.
-- New columns remain nullable so legacy Phase 1 rows remain valid and intact.
ALTER TABLE risk_indicators
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES risk_analysis_runs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS investigation_id UUID REFERENCES investigations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS chain TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
  ADD COLUMN IF NOT EXISTS indicator_type TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS rule_version TEXT,
  ADD COLUMN IF NOT EXISTS score_contribution NUMERIC,
  ADD COLUMN IF NOT EXISTS score_semantics TEXT,
  ADD COLUMN IF NOT EXISTS confidence_level TEXT,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS method_version TEXT,
  ADD COLUMN IF NOT EXISTS provenance JSONB;

ALTER TABLE risk_indicators
  DROP CONSTRAINT IF EXISTS risk_indicators_score_contribution_check;
ALTER TABLE risk_indicators
  ADD CONSTRAINT risk_indicators_score_contribution_check
  CHECK (score_contribution IS NULL OR score_contribution >= 0);

CREATE INDEX IF NOT EXISTS idx_risk_indicators_run
  ON risk_indicators (run_id, severity, score_contribution DESC)
  WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_risk_indicators_case
  ON risk_indicators (case_id, investigation_id, indicator_type);

-- Evidence supporting each risk indicator
CREATE TABLE IF NOT EXISTS risk_indicator_evidence (
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

CREATE INDEX IF NOT EXISTS idx_risk_indicator_evidence_indicator
  ON risk_indicator_evidence (indicator_id);

-- Risk typology definitions (versioned rule templates)
CREATE TABLE IF NOT EXISTS risk_typologies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT NOT NULL,
  indicator_types TEXT[] NOT NULL,
  min_indicators INTEGER NOT NULL DEFAULT 1,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

-- Seed default typology definitions
INSERT INTO risk_typologies (code, name, description, version, indicator_types, min_indicators, severity) VALUES
  ('RAPID_MOVEMENT', 'Rapid Fund Movement', 'Funds received and sent within a short time window, suggesting pass-through behavior.', '1.0.0', ARRAY['RAPID_IN_OUT', 'HIGH_VELOCITY'], 1, 'MEDIUM'),
  ('STRUCTURING', 'Structuring-Like Behavior', 'Multiple transactions of similar amounts that may indicate deliberate structuring. Contextual — not proof of illegality.', '1.0.0', ARRAY['ROUND_NUMBER_PATTERN', 'BURST_ACTIVITY', 'SIMILAR_AMOUNTS'], 2, 'MEDIUM'),
  ('LAYERING', 'Layering-Like Pattern', 'Complex multi-hop transaction paths with diminishing values, suggesting layering behavior.', '1.0.0', ARRAY['PEEL_CHAIN', 'FAN_OUT', 'MULTI_HOP_DIMINISHING'], 2, 'HIGH'),
  ('HIGH_RISK_EXPOSURE', 'High-Risk Service Exposure', 'Significant interaction with addresses flagged by intelligence sources.', '1.0.0', ARRAY['SERVICE_EXPOSURE', 'SANCTIONED_INTERACTION'], 1, 'HIGH'),
  ('CONCENTRATION', 'Counterparty Concentration', 'Disproportionate transaction volume with a small number of counterparties.', '1.0.0', ARRAY['COUNTERPARTY_CONCENTRATION', 'FAN_IN'], 1, 'LOW')
ON CONFLICT (code, version) DO NOTHING;
