import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
// Import the concrete module entry point.  A bare directory import is handled
// by some bundlers, but Node's ESM resolver rejects it at runtime.
import * as schema from "./schema/index";
import { createVerifiedSupabaseConnectionConfig } from "./supabase-tls";

const { Pool } = pg;

export type CashnetDatabase = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Creates the existing PostgreSQL/Drizzle access layer on demand. Keeping the
 * connection lazy lets the legacy synthetic demo start without a database.
 */
export function createDatabase(databaseUrl = process.env.DATABASE_URL): {
  pool: pg.Pool;
  db: CashnetDatabase;
} {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set before persistent API routes can be used.");
  }

  const pool = new Pool(createVerifiedSupabaseConnectionConfig(databaseUrl));
  return { pool, db: drizzle(pool, { schema }) };
}

let connection: ReturnType<typeof createDatabase> | undefined;

export function getDatabase(): ReturnType<typeof createDatabase> {
  connection ??= createDatabase();
  return connection;
}

/**
 * Returns only connection identity fields through the same singleton Drizzle
 * executor used by repositories. It intentionally never exposes a connection
 * string, password, or other credential material.
 */
export async function getDatabaseRuntimeIdentity() {
  const result = await getDatabase().db.execute(sql`
    select
      current_database() as database_name,
      current_user as database_user,
      inet_server_addr()::text as server_address,
      inet_server_port() as server_port,
      version() as server_version
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("PostgreSQL runtime identity query returned no row.");
  return {
    databaseName: String(row.database_name),
    databaseUser: String(row.database_user),
    serverAddress: row.server_address == null ? null : String(row.server_address),
    serverPort: row.server_port == null ? null : Number(row.server_port),
    serverVersion: String(row.server_version),
  };
}

export * from "./schema/index";
