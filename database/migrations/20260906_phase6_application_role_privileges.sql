-- Phase 6: provision only the privileges reached by CASHNET's PostgreSQL
-- repository layer when the application role is not the schema owner.
-- Apply through the schema owner using CASHNET_MIGRATION_DATABASE_URL when
-- necessary. The runtime API continues to use DATABASE_URL as `cashnet`.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cashnet') then
    raise exception 'Required CASHNET application role "cashnet" does not exist';
  end if;
end
$$;

grant usage on schema public to cashnet;

-- The runtime validation probe reads the append-only migration ledger. The
-- application role cannot alter migration history.
grant select on table cashnet_schema_migrations to cashnet;

-- Authentication and RBAC resolution are read-only at runtime.
grant select on table users, roles, permissions, user_roles, role_permissions to cashnet;

-- Case lifecycle and persistent investigation state.
grant select, insert, update on table cases, investigations to cashnet;
grant select, insert on table case_memberships, wallet_subjects, evidence to cashnet;

-- Normalized facts and derived graph state. Wallet and transaction
-- persistence use conflict updates; inputs and outputs are insert-only.
grant select, insert, update on table wallets, blockchain_transactions to cashnet;
grant select, insert on table transaction_inputs, transaction_outputs to cashnet;
grant insert on table token_transfers, contract_interactions to cashnet;
grant select, insert, update on table investigation_graph_relationships to cashnet;

-- Phase 5 intelligence persistence.
grant select, insert, update on table
  address_intelligence_observations, cluster_inferences,
  service_address_assessments, vasp_candidates
to cashnet;
grant select, insert on table attribution_reviews to cashnet;

-- Repository replacement semantics require deletion only for these derived
-- child records. No identity, case, evidence, or audit table gains DELETE.
grant select, insert, delete on table cluster_members, attribution_evidence to cashnet;
grant select, insert on table risk_indicator_evidence, graph_communities to cashnet;

-- Phase 6 analytical persistence. Graph features use an explicit upsert;
-- the remaining result sets are append-only at repository level.
grant select, insert on table risk_analysis_runs, risk_indicators,
  community_analysis_runs, forensic_reports to cashnet;
grant select, insert, update on table graph_features to cashnet;
grant insert on table defi_protocol_interactions, mev_candidates to cashnet;

-- Audit is readable and append-only: UPDATE/DELETE remain absent and the
-- immutable trigger remains authoritative for more-privileged connections.
grant select, insert on table audit_events to cashnet;
