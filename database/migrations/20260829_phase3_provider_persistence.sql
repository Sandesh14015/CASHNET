-- Phase 3: idempotent, provenance-preserving provider collection records.
-- Existing Phase 1 tables remain authoritative; this only adds conflict keys and query indexes.
create unique index if not exists wallets_case_chain_address_unique
  on wallets (case_id, chain, lower(address)) where case_id is not null;
create index if not exists blockchain_transactions_case_wallet_idx
  on blockchain_transactions (case_id, wallet_id, created_at desc);
create unique index if not exists token_transfers_transaction_identity_unique
  on token_transfers (transaction_id, chain, from_address, to_address, asset, amount_numeric, coalesce(contract_address, ''));
create unique index if not exists contract_interactions_transaction_identity_unique
  on contract_interactions (transaction_id, chain, contract_address, coalesce(method_selector, ''), coalesce(input_data, ''));
create index if not exists token_transfers_transaction_idx on token_transfers (transaction_id);
create index if not exists contract_interactions_transaction_idx on contract_interactions (transaction_id);
