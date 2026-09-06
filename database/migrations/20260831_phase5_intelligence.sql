-- Phase 5: case-scoped, provenance-aware intelligence observations and explainable inferences.
-- None of these tables assert that an address identifies a natural person.
insert into permissions (code, description) values
  ('INTELLIGENCE_READ', 'Read address intelligence and candidate results'),
  ('INTELLIGENCE_EXECUTE', 'Run approved address intelligence lookups'),
  ('CLUSTER_ANALYZE', 'Run bounded Bitcoin clustering inference'),
  ('VASP_ANALYZE', 'Run deterministic VASP candidate analysis'),
  ('VASP_REVIEW', 'Review VASP candidate conclusions'),
  ('EVIDENCE_REVIEW', 'Review intelligence evidence')
on conflict (code) do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in ('INTELLIGENCE_READ', 'INTELLIGENCE_EXECUTE', 'CLUSTER_ANALYZE', 'VASP_ANALYZE', 'VASP_REVIEW', 'EVIDENCE_REVIEW') where r.code in ('ADMIN', 'SUPERVISOR')
on conflict do nothing;
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in ('INTELLIGENCE_READ', 'INTELLIGENCE_EXECUTE', 'CLUSTER_ANALYZE', 'VASP_ANALYZE') where r.code in ('INVESTIGATOR')
on conflict do nothing;
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in ('INTELLIGENCE_READ') where r.code in ('ANALYST', 'VIEWER')
on conflict do nothing;

create table if not exists address_intelligence_observations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  investigation_id uuid not null references investigations(id) on delete cascade,
  chain text not null, address text not null, label text, entity_name text, entity_type text not null check (entity_type in ('EXCHANGE', 'VASP', 'CUSTODIAL_SERVICE', 'DEX', 'BRIDGE', 'MIXER', 'MINING_POOL', 'DEFI', 'SCAM', 'PHISHING', 'SANCTIONED_ENTITY', 'OTHER', 'UNKNOWN')),
  source text not null, source_reference text, source_url text, dataset_name text, dataset_version text, license text, retrieved_at timestamptz not null, last_verified timestamptz, freshness_status text not null check (freshness_status in ('FRESH', 'STALE', 'EXPIRED', 'UNKNOWN')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1), status text not null check (status in ('UNKNOWN', 'ACTIVE', 'STALE', 'CONFLICTING', 'REVIEW_REQUIRED')),
  raw_reference text, raw_data jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists address_intelligence_observation_identity_unique on address_intelligence_observations (case_id, investigation_id, chain, lower(address), source, coalesce(source_reference, ''), coalesce(dataset_version, ''), coalesce(label, ''), coalesce(entity_name, ''));
create index if not exists address_intelligence_observation_lookup_idx on address_intelligence_observations (case_id, investigation_id, chain, lower(address));

create table if not exists cluster_inferences (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade, investigation_id uuid not null references investigations(id) on delete cascade,
  cluster_key text not null, chain text not null check (chain = 'BITCOIN'), method text not null, method_version text not null,
  confidence_level text not null check (confidence_level in ('UNKNOWN', 'POSSIBLE', 'LIKELY')), numeric_score numeric not null check (numeric_score >= 0 and numeric_score <= 100),
  review_status text not null check (review_status in ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED')), ambiguity_reason text, evidence jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists cluster_inference_identity_unique on cluster_inferences (case_id, investigation_id, cluster_key, method, method_version);
create index if not exists cluster_inference_lookup_idx on cluster_inferences (case_id, investigation_id, created_at desc);

create table if not exists cluster_members (
  cluster_id uuid not null references cluster_inferences(id) on delete cascade, chain text not null, address text not null, membership_type text not null check (membership_type in ('COMMON_INPUT', 'POSSIBLE_CHANGE', 'CONSOLIDATION')), evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), primary key (cluster_id, chain, address, membership_type)
);

create table if not exists service_address_assessments (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade, investigation_id uuid not null references investigations(id) on delete cascade,
  chain text not null, address text not null, classification text not null check (classification in ('EXCHANGE_ENTITY', 'EXCHANGE_HOT_WALLET', 'EXCHANGE_DEPOSIT_ADDRESS', 'CUSTODIAL_WALLET', 'VASP', 'OTHER_SERVICE', 'UNKNOWN')),
  confidence_level text not null check (confidence_level in ('UNKNOWN', 'POSSIBLE', 'LIKELY')), numeric_score numeric not null check (numeric_score >= 0 and numeric_score <= 100),
  status text not null check (status in ('PENDING_REVIEW', 'CONFLICTING_EVIDENCE', 'INSUFFICIENT_EVIDENCE')), signals jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists service_address_assessment_identity_unique on service_address_assessments (case_id, investigation_id, chain, lower(address));

-- Phase 1 already owns the vasp_candidates relation for legacy /api data.  Evolve
-- it in place: legacy rows do not have a wallet address or investigation scope and
-- must remain readable, while Phase 5 rows are constrained by the check below.
alter table vasp_candidates add column if not exists investigation_id uuid references investigations(id) on delete cascade;
alter table vasp_candidates add column if not exists address text;
alter table vasp_candidates add column if not exists entity_name text;
alter table vasp_candidates add column if not exists entity_type text check (entity_type in ('EXCHANGE', 'VASP', 'CUSTODIAL_SERVICE', 'DEX', 'BRIDGE', 'MIXER', 'MINING_POOL', 'DEFI', 'SCAM', 'PHISHING', 'SANCTIONED_ENTITY', 'OTHER', 'UNKNOWN'));
alter table vasp_candidates add column if not exists confidence_level text check (confidence_level in ('UNKNOWN', 'POSSIBLE', 'LIKELY', 'CONFIRMED'));
alter table vasp_candidates add column if not exists numeric_score numeric check (numeric_score >= 0 and numeric_score <= 100);
alter table vasp_candidates add column if not exists status text check (status in ('PENDING_REVIEW', 'CONFLICTING_EVIDENCE', 'INSUFFICIENT_EVIDENCE', 'CONFIRMED_BY_REVIEW'));
alter table vasp_candidates add column if not exists reason text;
alter table vasp_candidates add column if not exists contradictions jsonb not null default '[]'::jsonb;
alter table vasp_candidates add column if not exists method text;
alter table vasp_candidates add column if not exists method_version text;
alter table vasp_candidates add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vasp_candidates_phase5_record_check' and conrelid = 'vasp_candidates'::regclass) then
    alter table vasp_candidates add constraint vasp_candidates_phase5_record_check check (
      investigation_id is null or (
        case_id is not null and address is not null and entity_type is not null and confidence_level is not null and
        numeric_score is not null and status is not null and reason is not null and method is not null and method_version is not null
      )
    );
  end if;
end $$;

create unique index if not exists vasp_candidate_identity_unique on vasp_candidates (case_id, investigation_id, chain, lower(address), coalesce(entity_name, ''), method, method_version)
  where investigation_id is not null and address is not null;
create index if not exists vasp_candidate_lookup_idx on vasp_candidates (case_id, investigation_id, numeric_score desc, created_at desc);

create table if not exists attribution_evidence (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade, investigation_id uuid not null references investigations(id) on delete cascade,
  candidate_id uuid references vasp_candidates(id) on delete cascade, category text not null check (category in ('DIRECT_BLOCKCHAIN_FACT', 'GRAPH_EVIDENCE', 'ADDRESS_INTELLIGENCE', 'CLUSTER_INFERENCE', 'ABUSE_INTELLIGENCE', 'SOURCE_AGREEMENT', 'SOURCE_QUALITY')),
  evidence_type text not null, subject_type text not null, subject_id text not null, polarity text not null check (polarity in ('SUPPORTING', 'NEGATIVE', 'CONTRADICTORY')),
  contribution numeric not null, source text, source_reference text, source_url text, retrieved_at timestamptz, method text not null, method_version text not null, raw_reference text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists attribution_evidence_candidate_idx on attribution_evidence (candidate_id, created_at);

create table if not exists abuse_intelligence_observations (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade, investigation_id uuid not null references investigations(id) on delete cascade,
  chain text not null, address text not null, report_type text, category text, source text not null, source_url text, reported_at timestamptz, retrieved_at timestamptz not null, confidence numeric not null check (confidence >= 0 and confidence <= 1), evidence jsonb not null default '{}'::jsonb, raw_reference text, created_at timestamptz not null default now()
);
create unique index if not exists abuse_intelligence_observation_identity_unique on abuse_intelligence_observations (case_id, investigation_id, chain, lower(address), source, coalesce(raw_reference, ''));

create table if not exists attribution_reviews (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references cases(id) on delete cascade, investigation_id uuid not null references investigations(id) on delete cascade,
  candidate_id uuid not null references vasp_candidates(id) on delete cascade, reviewer_id uuid references users(id), decision text not null check (decision in ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'CONFIRMED')),
  rationale text, created_at timestamptz not null default now()
);
create index if not exists attribution_reviews_candidate_idx on attribution_reviews (candidate_id, created_at desc);
