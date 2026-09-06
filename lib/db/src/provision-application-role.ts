import pg from "pg";
import { createVerifiedSupabaseConnectionConfig } from "./supabase-tls";

const { Client } = pg;

const runtimeDatabaseUrl = process.env.DATABASE_URL;
const migrationDatabaseUrl = process.env.CASHNET_MIGRATION_DATABASE_URL;

if (!runtimeDatabaseUrl || !migrationDatabaseUrl) {
  throw new Error("DATABASE_URL and CASHNET_MIGRATION_DATABASE_URL are required to provision the CASHNET application role.");
}

const runtimeUrl = new URL(runtimeDatabaseUrl);
const runtimeUsername = decodeURIComponent(runtimeUrl.username);
// Supavisor session URLs encode the tenant as `cashnet.<project-ref>` while
// PostgreSQL still resolves the database role as `cashnet`. Direct URLs use
// just `cashnet`.
const applicationRole = runtimeUsername.split(".", 1)[0];
const applicationPassword = decodeURIComponent(runtimeUrl.password);

// The role name is intentionally fixed: allowing an arbitrary identifier here
// would turn a deployment setting into a privilege-escalation surface.
if (applicationRole !== "cashnet" || applicationPassword.length === 0) {
  throw new Error("DATABASE_URL must identify the CASHNET application role with a non-empty password.");
}

const admin = new Client(createVerifiedSupabaseConnectionConfig(migrationDatabaseUrl));
await admin.connect();
try {
  await admin.query("begin");
  const existing = await admin.query("select 1 from pg_roles where rolname = $1", [applicationRole]);
  if (existing.rowCount === 0) {
    // PostgreSQL utility statements do not accept a bind parameter in PASSWORD.
    // Keep the secret server-side in a transaction-local setting, then quote it
    // in the server; it is never written to stdout, a file, or a command line.
    await admin.query("select set_config('cashnet.bootstrap_password', $1, true)", [applicationPassword]);
    await admin.query(`
      do $provision$
      begin
        execute 'create role cashnet login nosuperuser nocreatedb nocreaterole noinherit password '
          || quote_literal(current_setting('cashnet.bootstrap_password'));
      end
      $provision$;
    `);
    console.log("Provisioned the least-privilege CASHNET application role.");
  } else {
    console.log("CASHNET application role already exists; its credentials and attributes were not changed.");
  }
  await admin.query("commit");
} catch (error) {
  await admin.query("rollback");
  throw error;
} finally {
  await admin.end();
}
