-- Phase 6.3: Graph features and advanced analysis.

INSERT INTO permissions (code, description) VALUES
  ('GRAPH_FEATURES', 'Compute graph features for investigation addresses')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'GRAPH_FEATURES'
WHERE r.code IN ('ADMIN', 'SUPERVISOR', 'INVESTIGATOR')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS graph_features (
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
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_features_lookup
  ON graph_features (case_id, investigation_id, chain, lower(address));

CREATE UNIQUE INDEX IF NOT EXISTS graph_features_case_insensitive_unique
  ON graph_features (case_id, investigation_id, chain, lower(address), feature_type, method, method_version);
