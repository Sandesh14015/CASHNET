import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ClientConfig, PoolConfig } from "pg";

const sslParameters = ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"];

function isSupabaseHost(host: string) {
  const normalized = host.toLowerCase();
  return normalized.endsWith(".supabase.co") || normalized.endsWith(".pooler.supabase.com");
}

function isDisposableCiPostgres() {
  return process.env.CASHNET_DATABASE_TEST_MODE === "disposable-postgres";
}

function createDisposableCiConnectionConfig(databaseUrl: string): ClientConfig & PoolConfig {
  if (process.env.CI !== "true" || process.env.NODE_ENV !== "test") {
    throw new Error("The disposable PostgreSQL compatibility connection is restricted to CI test execution.");
  }
  const parsed = new URL(databaseUrl);
  if (!(["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) {
    throw new Error("The disposable CI PostgreSQL compatibility connection must use a loopback host.");
  }
  return { connectionString: parsed.toString(), connectionTimeoutMillis: 10_000 };
}

function loadSupabaseCa() {
  const certificatePath = process.env.CASHNET_SUPABASE_CA_CERT_PATH;
  if (!certificatePath) {
    throw new Error("CASHNET_SUPABASE_CA_CERT_PATH is required for verified Supabase PostgreSQL TLS.");
  }

  const certificate = readFileSync(resolve(certificatePath), "utf8");
  if (!certificate.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error("CASHNET_SUPABASE_CA_CERT_PATH does not contain a PEM CA certificate.");
  }
  return certificate;
}

/**
 * Returns a pg configuration with explicit Supabase CA and hostname
 * verification. pg reparses `connectionString` and can otherwise let URL
 * `sslmode` settings replace an explicit ssl object, so SSL URL parameters are
 * deliberately removed only from the in-memory copy before passing it to pg.
 */
export function createVerifiedSupabaseConnectionConfig(databaseUrl: string): ClientConfig & PoolConfig {
  // CI deliberately uses an ephemeral, loopback-only PostgreSQL service to
  // replay the ledger. It is never a runtime, Docker, or developer fallback.
  if (isDisposableCiPostgres()) return createDisposableCiConnectionConfig(databaseUrl);

  const parsed = new URL(databaseUrl);
  if (!isSupabaseHost(parsed.hostname)) {
    throw new Error("CASHNET database connections must target an official Supabase direct or pooler hostname.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("CASHNET database connections must use a PostgreSQL URL.");
  }
  if (parsed.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("CASHNET Supabase database URLs must explicitly use sslmode=verify-full.");
  }

  for (const parameter of sslParameters) parsed.searchParams.delete(parameter);

  return {
    connectionString: parsed.toString(),
    connectionTimeoutMillis: 10_000,
    ssl: {
      ca: loadSupabaseCa(),
      rejectUnauthorized: true,
      servername: parsed.hostname,
    },
  };
}
