-- Phase 6.6: Production hardening — RBAC extension, reporting, observability.

-- New roles (only when justified by least-privilege requirements)
INSERT INTO roles (code, description) VALUES
  ('SENIOR_INVESTIGATOR', 'Investigator with risk analysis and report generation capabilities'),
  ('REVIEWER', 'Dedicated evidence and candidate review role'),
  ('AUDITOR', 'Read-only audit and report access')
ON CONFLICT (code) DO NOTHING;

-- New permissions
INSERT INTO permissions (code, description) VALUES
  ('REPORT_GENERATE', 'Generate forensic investigation reports'),
  ('REPORT_EXPORT', 'Export forensic reports'),
  ('AUDIT_EXPORT', 'Export audit trails')
ON CONFLICT (code) DO NOTHING;

-- Role→permission assignments (least privilege)
-- SENIOR_INVESTIGATOR: investigator + risk + reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'INTELLIGENCE_READ', 'INTELLIGENCE_EXECUTE', 'CLUSTER_ANALYZE', 'VASP_ANALYZE',
  'RISK_ANALYZE', 'RISK_READ', 'REPORT_GENERATE',
  'COLLECTION_BNB', 'COLLECTION_POLYGON', 'COLLECTION_SOLANA',
  'GRAPH_FEATURES', 'DEFI_ANALYZE'
) WHERE r.code = 'SENIOR_INVESTIGATOR'
ON CONFLICT DO NOTHING;

-- REVIEWER: review-focused permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'INTELLIGENCE_READ', 'RISK_READ', 'VASP_REVIEW', 'EVIDENCE_REVIEW'
) WHERE r.code = 'REVIEWER'
ON CONFLICT DO NOTHING;

-- AUDITOR: read-only audit and report access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'INTELLIGENCE_READ', 'RISK_READ', 'AUDIT_EXPORT', 'REPORT_EXPORT'
) WHERE r.code = 'AUDITOR'
ON CONFLICT DO NOTHING;

-- Grant report/audit permissions to ADMIN and SUPERVISOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'REPORT_GENERATE', 'REPORT_EXPORT', 'AUDIT_EXPORT'
) WHERE r.code IN ('ADMIN', 'SUPERVISOR')
ON CONFLICT DO NOTHING;

-- Forensic reports table
CREATE TABLE IF NOT EXISTS forensic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  investigation_id UUID REFERENCES investigations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  generated_by UUID REFERENCES users(id),
  report_type TEXT NOT NULL CHECK (report_type IN
    ('INVESTIGATION_SUMMARY', 'RISK_ASSESSMENT', 'GRAPH_ANALYSIS', 'FULL_FORENSIC')),
  content JSONB NOT NULL,
  method_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forensic_reports_case
  ON forensic_reports (case_id, created_at DESC);

-- Audit event immutability trigger (prevent UPDATE/DELETE on audit_events)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_audit_mutation') THEN
    CREATE OR REPLACE FUNCTION prevent_audit_mutation_fn() RETURNS TRIGGER AS $fn$
    BEGIN RAISE EXCEPTION 'Audit events are immutable. UPDATE and DELETE are not permitted.'; END;
    $fn$ LANGUAGE plpgsql;
    CREATE TRIGGER prevent_audit_mutation
      BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation_fn();
  END IF;
END $$;
