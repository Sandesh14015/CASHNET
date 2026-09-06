-- Phase 6 operational compatibility and persistence additions.
-- Safe to apply after an earlier/partial Phase 6 deployment and harmless on a
-- clean replay. This preserves all Phase 1 legacy risk indicator rows.

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

CREATE INDEX IF NOT EXISTS idx_risk_indicators_run
  ON risk_indicators (run_id, severity, score_contribution DESC)
  WHERE run_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS graph_features_case_insensitive_unique
  ON graph_features (case_id, investigation_id, chain, lower(address), feature_type, method, method_version);

CREATE TABLE IF NOT EXISTS community_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  max_nodes INTEGER NOT NULL,
  max_edges INTEGER NOT NULL,
  max_runtime_ms INTEGER NOT NULL,
  total_nodes INTEGER NOT NULL DEFAULT 0,
  total_edges INTEGER NOT NULL DEFAULT 0,
  community_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_community_runs_lookup
  ON community_analysis_runs (case_id, investigation_id, chain, created_at DESC);

CREATE TABLE IF NOT EXISTS graph_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES community_analysis_runs(id) ON DELETE CASCADE,
  community_key TEXT NOT NULL,
  members JSONB NOT NULL,
  member_count INTEGER NOT NULL,
  edge_count INTEGER NOT NULL,
  chains TEXT[] NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('STRUCTURAL', 'INFERRED')),
  explanation TEXT NOT NULL,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, community_key)
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  investigation_id UUID REFERENCES investigations(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  ground_truth_status TEXT NOT NULL CHECK (ground_truth_status IN ('VERIFIED', 'INSUFFICIENT_GROUND_TRUTH')),
  metrics JSONB NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
