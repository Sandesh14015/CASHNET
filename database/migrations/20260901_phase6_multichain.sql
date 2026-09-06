-- Phase 6.1: Multi-chain provider support (BNB Chain, Polygon, Solana)
-- No new tables needed — existing blockchain_transactions, token_transfers,
-- contract_interactions, and investigation_graph_relationships already use
-- chain TEXT columns. Only additive indexes and permissions.

-- Chain-specific partial indexes for query performance
CREATE INDEX IF NOT EXISTS idx_transactions_bnb_chain
  ON blockchain_transactions (case_id, from_address, to_address)
  WHERE chain = 'BNB_CHAIN';

CREATE INDEX IF NOT EXISTS idx_transactions_polygon
  ON blockchain_transactions (case_id, from_address, to_address)
  WHERE chain = 'POLYGON';

CREATE INDEX IF NOT EXISTS idx_transactions_solana
  ON blockchain_transactions (case_id, transaction_hash)
  WHERE chain = 'SOLANA';

CREATE INDEX IF NOT EXISTS idx_graph_bnb_chain
  ON investigation_graph_relationships (case_id, from_address, to_address)
  WHERE chain = 'BNB_CHAIN';

CREATE INDEX IF NOT EXISTS idx_graph_polygon
  ON investigation_graph_relationships (case_id, from_address, to_address)
  WHERE chain = 'POLYGON';

CREATE INDEX IF NOT EXISTS idx_graph_solana
  ON investigation_graph_relationships (case_id, from_address, to_address)
  WHERE chain = 'SOLANA';

CREATE INDEX IF NOT EXISTS idx_token_transfers_bnb_chain
  ON token_transfers (chain, from_address, to_address)
  WHERE chain = 'BNB_CHAIN';

CREATE INDEX IF NOT EXISTS idx_token_transfers_polygon
  ON token_transfers (chain, from_address, to_address)
  WHERE chain = 'POLYGON';

CREATE INDEX IF NOT EXISTS idx_token_transfers_solana
  ON token_transfers (chain, from_address, to_address)
  WHERE chain = 'SOLANA';

-- Phase 6.1 collection permissions for new chains
INSERT INTO permissions (code, description) VALUES
  ('COLLECTION_BNB', 'Collect BNB Chain blockchain data'),
  ('COLLECTION_POLYGON', 'Collect Polygon blockchain data'),
  ('COLLECTION_SOLANA', 'Collect Solana blockchain data')
ON CONFLICT (code) DO NOTHING;

-- Grant collection permissions to ADMIN and SUPERVISOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('COLLECTION_BNB', 'COLLECTION_POLYGON', 'COLLECTION_SOLANA')
WHERE r.code IN ('ADMIN', 'SUPERVISOR')
ON CONFLICT DO NOTHING;

-- Grant collection permissions to INVESTIGATOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('COLLECTION_BNB', 'COLLECTION_POLYGON', 'COLLECTION_SOLANA')
WHERE r.code IN ('INVESTIGATOR')
ON CONFLICT DO NOTHING;
