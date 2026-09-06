-- Phase 4: canonical address/value facts plus an evidence-backed derived graph projection.
-- Relationship rows are reproducible projections, never a replacement for source facts.
alter table blockchain_transactions add column if not exists from_address text;
alter table blockchain_transactions add column if not exists to_address text;
alter table blockchain_transactions add column if not exists value_numeric numeric;
alter table blockchain_transactions add column if not exists execution_status text;
create index if not exists transactions_case_chain_addresses_idx
  on blockchain_transactions (case_id, chain, lower(from_address), lower(to_address));

create table if not exists investigation_graph_relationships (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  chain text not null,
  transaction_hash text not null,
  from_address text not null,
  to_address text not null,
  relationship_type text not null check (relationship_type in ('TRANSFER', 'TOKEN_TRANSFER', 'INTERNAL_TRANSFER', 'CONTRACT_INTERACTION', 'UTXO_SPEND')),
  asset text not null,
  amount_numeric numeric not null,
  token_contract text,
  block_number bigint,
  block_timestamp timestamptz,
  execution_status text,
  derivation_source_type text not null check (derivation_source_type in ('API', 'INFERENCE')),
  provider text,
  source_reference text,
  raw_reference text,
  retrieved_at timestamptz,
  method text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists investigation_graph_relationship_identity_unique
  on investigation_graph_relationships (case_id, chain, transaction_hash, lower(from_address), lower(to_address), relationship_type, asset, amount_numeric, coalesce(token_contract, ''));
create index if not exists investigation_graph_relationship_lookup_idx
  on investigation_graph_relationships (case_id, chain, block_timestamp desc, transaction_hash);
create index if not exists investigation_graph_relationship_from_idx
  on investigation_graph_relationships (case_id, chain, lower(from_address));
create index if not exists investigation_graph_relationship_to_idx
  on investigation_graph_relationships (case_id, chain, lower(to_address));
