import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createVerifiedSupabaseConnectionConfig } from "./supabase-tls";

const { Client } = pg;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrations = [
  ["0000_baseline", path.join(projectRoot, "database", "schema.sql")],
  ["20260827_phase1_foundation", path.join(projectRoot, "database", "migrations", "20260827_phase1_foundation.sql")],
  ["20260828_phase2_persistence_rbac", path.join(projectRoot, "database", "migrations", "20260828_phase2_persistence_rbac.sql")],
  ["20260829_phase3_provider_persistence", path.join(projectRoot, "database", "migrations", "20260829_phase3_provider_persistence.sql")],
  ["20260830_phase4_graph_tracing", path.join(projectRoot, "database", "migrations", "20260830_phase4_graph_tracing.sql")],
  ["20260831_phase5_intelligence", path.join(projectRoot, "database", "migrations", "20260831_phase5_intelligence.sql")],
  ["20260901_phase6_multichain", path.join(projectRoot, "database", "migrations", "20260901_phase6_multichain.sql")],
  ["20260901_phase6_risk", path.join(projectRoot, "database", "migrations", "20260901_phase6_risk.sql")],
  ["20260901_phase6_graph", path.join(projectRoot, "database", "migrations", "20260901_phase6_graph.sql")],
  ["20260901_phase6_defi", path.join(projectRoot, "database", "migrations", "20260901_phase6_defi.sql")],
  ["20260901_phase6_production", path.join(projectRoot, "database", "migrations", "20260901_phase6_production.sql")],
  ["20260902_phase6_operational_compatibility", path.join(projectRoot, "database", "migrations", "20260902_phase6_operational_compatibility.sql")],
  ["20260903_phase6_graph_feature_chain_integrity", path.join(projectRoot, "database", "migrations", "20260903_phase6_graph_feature_chain_integrity.sql")],
  ["20260904_phase6_case_authorization", path.join(projectRoot, "database", "migrations", "20260904_phase6_case_authorization.sql")],
  ["20260905_phase6_dev_seed", path.join(projectRoot, "database", "migrations", "20260905_phase6_dev_seed.sql")],
  ["20260906_phase6_application_role_privileges", path.join(projectRoot, "database", "migrations", "20260906_phase6_application_role_privileges.sql")],
] as const;

if (!process.env.CASHNET_MIGRATION_DATABASE_URL) {
  throw new Error("CASHNET_MIGRATION_DATABASE_URL is required to run migrations; DATABASE_URL is never used as a migration fallback.");
}

// Migrations must use the explicitly provisioned Supabase migration identity.
// The runtime DATABASE_URL is intentionally never used here: silently falling
// back to the least-privilege application role masks a bad migration secret and
// can produce misleading permission failures.
const migrationDatabaseUrl = process.env.CASHNET_MIGRATION_DATABASE_URL;
const client = new Client(createVerifiedSupabaseConnectionConfig(migrationDatabaseUrl));
try {
  await client.connect();
} catch (error) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  if (code === "28P01") {
    throw new Error("CASHNET_MIGRATION_DATABASE_URL authentication failed (PostgreSQL 28P01). Update the Supabase migration credential in the approved secret manager; no credential was logged.");
  }
  throw new Error("Unable to connect using CASHNET_MIGRATION_DATABASE_URL; verify the Supabase endpoint, CA configuration, and migration credential in the approved secret manager.");
}
try {
  await client.query("create table if not exists cashnet_schema_migrations (id text primary key, applied_at timestamptz not null default now())");
  for (const [id, file] of migrations) {
    const applied = await client.query("select 1 from cashnet_schema_migrations where id = $1", [id]);
    if (applied.rowCount) continue;
    const sql = await readFile(file, "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into cashnet_schema_migrations (id) values ($1)", [id]);
      await client.query("commit");
      console.log(`Applied ${id}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}
