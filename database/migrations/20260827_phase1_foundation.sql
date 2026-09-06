-- Phase 1 additive foundation. The synthetic demo remains in-memory until Phase 2 repositories are enabled.
create table if not exists investigations (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id), status text not null,
  requested_by text not null, source_type text not null, provider text, source_reference text,
  raw_reference text, raw_data jsonb, created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists wallets (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id), chain text not null,
  address text not null, source_type text not null, provider text, source_reference text, raw_reference text,
  raw_data jsonb, retrieved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists blockchain_transactions (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id), wallet_id uuid references wallets(id),
  chain text not null, transaction_hash text not null, block_number bigint, block_hash text, block_timestamp timestamptz,
  confirmations integer, source_type text not null, provider text, source_reference text, raw_reference text,
  raw_data jsonb, retrieved_at timestamptz, created_at timestamptz not null default now(), unique (chain, transaction_hash)
);
create table if not exists transaction_inputs (
  id uuid primary key default gen_random_uuid(), transaction_id uuid not null references blockchain_transactions(id) on delete cascade,
  input_index integer not null, address text, value_numeric numeric, previous_transaction_hash text, previous_output_index integer,
  script text, created_at timestamptz not null default now(), unique (transaction_id, input_index)
);
create table if not exists transaction_outputs (
  id uuid primary key default gen_random_uuid(), transaction_id uuid not null references blockchain_transactions(id) on delete cascade,
  output_index integer not null, address text, value_numeric numeric not null, script text, spending_transaction_hash text,
  created_at timestamptz not null default now(), unique (transaction_id, output_index)
);
create table if not exists token_transfers (
  id uuid primary key default gen_random_uuid(), transaction_id uuid references blockchain_transactions(id), chain text not null,
  from_address text not null, to_address text not null, asset text not null, amount_numeric numeric not null, contract_address text,
  source_type text not null, provider text, source_reference text, raw_reference text, raw_data jsonb, retrieved_at timestamptz
);
create table if not exists contract_interactions (
  id uuid primary key default gen_random_uuid(), transaction_id uuid references blockchain_transactions(id), chain text not null,
  contract_address text not null, method_selector text, input_data text, source_type text not null, provider text,
  source_reference text, raw_reference text, raw_data jsonb, retrieved_at timestamptz
);
create table if not exists wallet_relationships (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id), source_wallet_id uuid references wallets(id),
  target_wallet_id uuid references wallets(id), relationship_type text not null, transaction_hash text,
  source_type text not null, provider text, source_reference text, raw_reference text, raw_data jsonb,
  retrieved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists entities (
  id uuid primary key default gen_random_uuid(), name text not null, entity_type text not null, source_type text not null,
  provider text, source_reference text, raw_reference text, raw_data jsonb, retrieved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists address_labels (
  id uuid primary key default gen_random_uuid(), entity_id uuid references entities(id), chain text not null, address text not null,
  label text not null, confidence numeric, source_type text not null, provider text, source_reference text, raw_reference text,
  raw_data jsonb, retrieved_at timestamptz, last_verified_at timestamptz
);
create table if not exists evidence (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id), subject_type text not null, subject_id text not null,
  evidence_type text not null, confidence numeric, source_type text not null, provider text, source_reference text,
  raw_reference text, raw_data jsonb, retrieved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists vasp_candidates (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id), entity_id uuid references entities(id),
  chain text not null, attribution_status text not null, confidence numeric, source_type text not null, provider text,
  source_reference text, raw_reference text, raw_data jsonb, retrieved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists risk_indicators (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id), name text not null, severity text not null,
  explanation text not null, confidence numeric, source_type text not null, provider text, source_reference text,
  raw_reference text, raw_data jsonb, retrieved_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists investigation_events (
  id uuid primary key default gen_random_uuid(), investigation_id uuid references investigations(id), event_type text not null,
  occurred_at timestamptz not null, source_type text not null, provider text, source_reference text, raw_reference text,
  raw_data jsonb, retrieved_at timestamptz
);
create index if not exists investigations_case_id_idx on investigations(case_id);
create index if not exists wallets_case_id_idx on wallets(case_id);
create index if not exists wallets_chain_address_idx on wallets(chain, lower(address));
create index if not exists transactions_chain_hash_idx on blockchain_transactions(chain, transaction_hash);
create index if not exists transactions_block_number_idx on blockchain_transactions(chain, block_number);
create index if not exists wallet_relationships_case_id_idx on wallet_relationships(case_id);
create index if not exists labels_chain_address_idx on address_labels(chain, lower(address));
create index if not exists evidence_case_id_idx on evidence(case_id);
