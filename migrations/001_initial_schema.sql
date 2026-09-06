-- CASHNET Production Schema Initialization
-- Migrates from synthetic in-memory data to persistent PostgreSQL database

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Cases table - Core case management
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_reference VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  fraud_type VARCHAR(100) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')) DEFAULT 'MEDIUM',
  status VARCHAR(50) NOT NULL CHECK (status IN ('NEW', 'UNDER_ANALYSIS', 'INVESTIGATION', 'RESOLVED', 'SUSPENDED')) DEFAULT 'NEW',
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('NCRP', 'SAHYOG', 'USER_PROVIDED', 'SYNTHETIC', 'VASP', 'BLOCKCHAIN')) DEFAULT 'USER_PROVIDED',
  state VARCHAR(100),
  city VARCHAR(100),
  external_id VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  CONSTRAINT unique_external_ref UNIQUE (source_type, external_id) WHERE external_id IS NOT NULL
);

-- Transactions table - Track all transactions
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  transaction_id VARCHAR(100) UNIQUE NOT NULL,
  source_account VARCHAR(255),
  source_account_type VARCHAR(50),
  destination_account VARCHAR(255),
  destination_account_type VARCHAR(50),
  amount DECIMAL(15, 2),
  currency VARCHAR(10) DEFAULT 'INR',
  transaction_type VARCHAR(50),
  timestamp TIMESTAMP NOT NULL,
  risk_score DECIMAL(3, 2) CHECK (risk_score >= 0 AND risk_score <= 1),
  risk_level VARCHAR(20) CHECK (risk_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  is_conversion BOOLEAN DEFAULT false,
  chain VARCHAR(50),
  channel VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  CONSTRAINT transaction_amount_check CHECK (amount > 0 OR amount IS NULL)
);

-- Entities table - Accounts, wallets, VASPs, persons
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id VARCHAR(100) UNIQUE NOT NULL,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('PERSON', 'ORGANIZATION', 'CRYPTO_WALLET', 'BANK_ACCOUNT', 'VASP', 'MULE_ACCOUNT', 'ATM')),
  name VARCHAR(500),
  identifier VARCHAR(100),
  risk_score DECIMAL(3, 2) CHECK (risk_score >= 0 AND risk_score <= 1),
  category VARCHAR(100),
  indicators TEXT[],
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  jurisdiction VARCHAR(100),
  tags TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

-- Alerts table - Real-time alerts and notifications
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  alert_id VARCHAR(100) UNIQUE NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE')),
  related_entities UUID[],
  related_transactions UUID[],
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP,
  acknowledged_by VARCHAR(100),
  resolved_at TIMESTAMP,
  resolved_by VARCHAR(100),
  resolution_notes TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Audit Trail table - All actions for compliance
CREATE TABLE IF NOT EXISTS audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(100) NOT NULL,
  actor VARCHAR(100),
  target_id VARCHAR(100),
  target_type VARCHAR(50),
  reason TEXT,
  details JSONB DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'FAILED', 'PENDING')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

-- Model Predictions table - Store ML predictions for audit trail
CREATE TABLE IF NOT EXISTS model_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  model_id VARCHAR(50) NOT NULL,
  model_version VARCHAR(20),
  prediction DECIMAL(3, 2),
  confidence DECIMAL(3, 2),
  features JSONB,
  explanation TEXT,
  predicted_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

-- Data Freshness table - Monitor integration lag
CREATE TABLE IF NOT EXISTS data_freshness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL UNIQUE,
  last_sync TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_sync_count INT DEFAULT 0,
  sync_status VARCHAR(50) DEFAULT 'SUCCESS' CHECK (sync_status IN ('SUCCESS', 'PARTIAL', 'FAILED', 'PENDING')),
  error_message TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for performance
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_priority ON cases(priority);
CREATE INDEX idx_cases_source_type ON cases(source_type);
CREATE INDEX idx_cases_created_at ON cases(created_at DESC);
CREATE INDEX idx_cases_amount ON cases(amount);
CREATE INDEX idx_cases_state_city ON cases(state, city);
CREATE INDEX idx_cases_title_search ON cases USING GIN(to_tsvector('english', title));

CREATE INDEX idx_transactions_case_id ON transactions(case_id);
CREATE INDEX idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX idx_transactions_source_account ON transactions(source_account);
CREATE INDEX idx_transactions_destination_account ON transactions(destination_account);
CREATE INDEX idx_transactions_risk_score ON transactions(risk_score DESC);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);

CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_risk ON entities(risk_score DESC);
CREATE INDEX idx_entities_id ON entities(entity_id);
CREATE INDEX idx_entities_first_seen ON entities(first_seen DESC);

CREATE INDEX idx_alerts_case_id ON alerts(case_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

CREATE INDEX idx_audit_action ON audit_trail(action);
CREATE INDEX idx_audit_created_at ON audit_trail(created_at DESC);
CREATE INDEX idx_audit_actor ON audit_trail(actor);

CREATE INDEX idx_model_predictions_transaction ON model_predictions(transaction_id);
CREATE INDEX idx_model_predictions_case ON model_predictions(case_id);
CREATE INDEX idx_model_predictions_model ON model_predictions(model_id);

-- Create Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entities_updated_at BEFORE UPDATE ON entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create audit trigger for compliance
CREATE OR REPLACE FUNCTION audit_action()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_trail (action, target_id, target_type, details)
    VALUES (TG_ARGV[0], NEW.id::text, TG_TABLE_NAME, row_to_json(NEW));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit triggers for critical tables
CREATE TRIGGER audit_case_changes AFTER INSERT OR UPDATE ON cases
    FOR EACH ROW EXECUTE FUNCTION audit_action('CASE_' || TG_OP);

CREATE TRIGGER audit_alert_changes AFTER INSERT ON alerts
    FOR EACH ROW EXECUTE FUNCTION audit_action('ALERT_CREATED');

-- Initialize data freshness tracking
INSERT INTO data_freshness (source_type, sync_status)
VALUES
  ('NCRP', 'PENDING'),
  ('SAHYOG', 'PENDING'),
  ('VASP', 'PENDING'),
  ('BLOCKCHAIN', 'PENDING'),
  ('USER_PROVIDED', 'SUCCESS')
ON CONFLICT (source_type) DO NOTHING;

-- Create views for common queries
CREATE OR REPLACE VIEW critical_cases_view AS
SELECT
    id,
    case_reference,
    title,
    fraud_type,
    amount,
    priority,
    status,
    state,
    city,
    created_at,
    (SELECT COUNT(*) FROM transactions WHERE case_id = cases.id) as transaction_count,
    (SELECT COUNT(*) FROM alerts WHERE case_id = cases.id) as alert_count
FROM cases
WHERE priority IN ('CRITICAL', 'HIGH')
ORDER BY created_at DESC;

CREATE OR REPLACE VIEW high_risk_transactions_view AS
SELECT
    t.id,
    t.transaction_id,
    t.case_id,
    c.case_reference,
    t.source_account,
    t.destination_account,
    t.amount,
    t.risk_score,
    t.timestamp,
    t.created_at
FROM transactions t
JOIN cases c ON t.case_id = c.id
WHERE t.risk_score > 0.7
ORDER BY t.timestamp DESC;

CREATE OR REPLACE VIEW alert_summary_view AS
SELECT
    severity,
    status,
    COUNT(*) as count,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as alerts_24h
FROM alerts
GROUP BY severity, status;

-- Grant permissions (adjust as needed)
-- ALTER ROLE cashnet_app SET search_path = public;
-- GRANT CONNECT ON DATABASE cashnet TO cashnet_app;
-- GRANT USAGE ON SCHEMA public TO cashnet_app;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cashnet_app;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cashnet_app;
