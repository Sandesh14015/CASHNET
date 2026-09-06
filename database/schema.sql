-- Portable PostgreSQL baseline. Apply all files through `pnpm --filter @workspace/db migrate`.
create extension if not exists pgcrypto;
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  case_reference text unique not null,
  title text not null,
  fraud_type text not null,
  reported_amount numeric not null,
  status text not null default 'NEW',
  priority text not null default 'MEDIUM',
  description text not null,
  source_type text not null default 'USER_PROVIDED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id),
  actor text not null,
  action text not null,
  source_type text not null,
  model_version text,
  created_at timestamptz not null default now()
);
create index if not exists cases_status_idx on cases(status);
create index if not exists audit_case_idx on audit_logs(case_id, created_at desc);
