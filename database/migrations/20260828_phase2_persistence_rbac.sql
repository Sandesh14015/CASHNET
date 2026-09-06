-- Phase 2: persistent users, explicit RBAC, case isolation and immutable audit events.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists roles (
  id uuid primary key default gen_random_uuid(), code text not null unique, description text,
  created_at timestamptz not null default now()
);
create table if not exists permissions (
  id uuid primary key default gen_random_uuid(), code text not null unique, description text,
  created_at timestamptz not null default now()
);
create table if not exists user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, role_id)
);
create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

insert into roles (code, description) values
  ('ADMIN', 'System administrator'), ('SUPERVISOR', 'Case supervisor'), ('INVESTIGATOR', 'Case investigator'), ('ANALYST', 'Case analyst'), ('VIEWER', 'Read-only case viewer')
on conflict (code) do nothing;
insert into permissions (code, description) values
  ('CASE_CREATE', 'Create cases'), ('CASE_READ', 'Read cases'), ('CASE_UPDATE', 'Update cases'), ('CASE_CLOSE', 'Close or archive cases'), ('CASE_ASSIGN', 'Assign case members'),
  ('INVESTIGATION_CREATE', 'Create investigations'), ('INVESTIGATION_READ', 'Read investigations'), ('INVESTIGATION_EXECUTE', 'Authorize or execute investigations'),
  ('EVIDENCE_CREATE', 'Create evidence'), ('EVIDENCE_READ', 'Read evidence'), ('EVIDENCE_EXPORT', 'Export evidence'),
  ('REPORT_READ', 'Read reports'), ('REPORT_CREATE', 'Create reports'), ('REPORT_EXPORT', 'Export reports'),
  ('AUDIT_READ', 'Read audit events'), ('USER_MANAGE', 'Manage users'), ('ROLE_MANAGE', 'Manage roles')
on conflict (code) do nothing;
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.code = 'ADMIN'
on conflict do nothing;
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in ('CASE_READ', 'CASE_UPDATE', 'CASE_CLOSE', 'CASE_ASSIGN', 'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'INVESTIGATION_EXECUTE', 'EVIDENCE_CREATE', 'EVIDENCE_READ', 'EVIDENCE_EXPORT', 'REPORT_READ', 'REPORT_CREATE', 'REPORT_EXPORT', 'AUDIT_READ')
where r.code = 'SUPERVISOR'
on conflict do nothing;
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in ('CASE_CREATE', 'CASE_READ', 'CASE_UPDATE', 'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'EVIDENCE_CREATE', 'EVIDENCE_READ', 'REPORT_READ', 'REPORT_CREATE')
where r.code = 'INVESTIGATOR'
on conflict do nothing;
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in ('CASE_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ', 'REPORT_READ')
where r.code = 'ANALYST'
on conflict do nothing;
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in ('CASE_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ', 'REPORT_READ')
where r.code = 'VIEWER'
on conflict do nothing;
insert into users (username) values ('demo.investigator'), ('demo.supervisor')
on conflict (username) do nothing;
insert into user_roles (user_id, role_id)
select u.id, r.id from users u join roles r on (u.username = 'demo.investigator' and r.code = 'INVESTIGATOR') or (u.username = 'demo.supervisor' and r.code = 'SUPERVISOR')
on conflict do nothing;

alter table cases add column if not exists created_by uuid references users(id);
alter table cases add column if not exists assigned_to uuid references users(id);
alter table cases add column if not exists closed_at timestamptz;
alter table cases add column if not exists investigation_authorization_status text not null default 'PENDING';
update cases set status = case status when 'NEW' then 'OPEN' when 'UNDER_ANALYSIS' then 'IN_PROGRESS' else status end;
alter table cases alter column status set default 'OPEN';
alter table cases drop constraint if exists cases_status_check;
alter table cases add constraint cases_status_check check (status in ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'ARCHIVED')) not valid;
alter table cases validate constraint cases_status_check;
alter table cases add constraint cases_investigation_authorization_check check (investigation_authorization_status in ('PENDING', 'APPROVED', 'REJECTED')) not valid;
alter table cases validate constraint cases_investigation_authorization_check;

create table if not exists case_memberships (
  case_id uuid not null references cases(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (case_id, user_id)
);
create index if not exists case_memberships_user_idx on case_memberships(user_id);
create index if not exists case_memberships_case_idx on case_memberships(case_id);
create index if not exists cases_created_at_idx on cases(created_at desc);

alter table investigations add column if not exists chain text;
alter table investigations add column if not exists wallet_address text;
alter table investigations add column if not exists investigation_depth integer not null default 1;
alter table investigations add column if not exists start_time timestamptz;
alter table investigations add column if not exists end_time timestamptz;
alter table investigations add column if not exists created_by uuid references users(id);
alter table investigations add column if not exists authorized_by uuid references users(id);
alter table investigations add column if not exists authorized_at timestamptz;
alter table investigations add column if not exists updated_at timestamptz not null default now();
alter table investigations add constraint investigations_depth_check check (investigation_depth between 1 and 10) not valid;
alter table investigations validate constraint investigations_depth_check;
alter table investigations add constraint investigations_status_check check (status in ('CREATED', 'AUTHORIZED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')) not valid;
alter table investigations validate constraint investigations_status_check;

create table if not exists wallet_subjects (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade,
  investigation_id uuid not null references investigations(id) on delete cascade,
  chain text not null, wallet_address text not null,
  label text not null default 'UNKNOWN' check (label in ('REPORTED', 'SUSPECT', 'SUBJECT', 'OBSERVED', 'UNKNOWN')),
  created_at timestamptz not null default now(), unique (investigation_id, chain, wallet_address)
);
create index if not exists wallet_subjects_investigation_idx on wallet_subjects(investigation_id);
create index if not exists wallet_subjects_chain_address_idx on wallet_subjects(chain, lower(wallet_address));

alter table evidence add column if not exists investigation_id uuid references investigations(id);
alter table evidence add column if not exists source_url text;
alter table evidence add column if not exists observed_at timestamptz;
alter table evidence add column if not exists collected_at timestamptz;
alter table evidence add column if not exists method text;
alter table evidence add column if not exists content_hash text;
alter table evidence add column if not exists description text;
alter table evidence add column if not exists created_by uuid references users(id);
alter table evidence add constraint evidence_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)) not valid;
alter table evidence validate constraint evidence_confidence_check;
alter table evidence add constraint evidence_source_type_check check (source_type in ('SYNTHETIC', 'USER_PROVIDED', 'API', 'RPC', 'DATASET', 'INFERENCE', 'OTHER', 'MODEL_INFERENCE')) not valid;
alter table evidence validate constraint evidence_source_type_check;
create index if not exists evidence_investigation_id_idx on evidence(investigation_id);
create index if not exists evidence_content_hash_idx on evidence(content_hash) where content_hash is not null;

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(), case_id uuid references cases(id), actor_id uuid references users(id),
  action text not null, resource_type text not null, resource_id text, request_id text,
  result text not null check (result in ('SUCCESS', 'DENIED', 'FAILURE')),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_events_case_time_idx on audit_events(case_id, created_at desc);
create index if not exists audit_events_actor_time_idx on audit_events(actor_id, created_at desc);
revoke update, delete on audit_events from public;
