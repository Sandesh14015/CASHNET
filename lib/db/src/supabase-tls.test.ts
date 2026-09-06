import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createVerifiedSupabaseConnectionConfig } from "./supabase-tls";

const testCertificate = "-----BEGIN CERTIFICATE-----\nCASHNET-TEST-CA\n-----END CERTIFICATE-----\n";

async function withTestCertificate(run: () => void | Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "cashnet-supabase-ca-"));
  const certificatePath = path.join(directory, "supabase-ca.pem");
  const previous = process.env.CASHNET_SUPABASE_CA_CERT_PATH;
  await writeFile(certificatePath, testCertificate, "utf8");
  process.env.CASHNET_SUPABASE_CA_CERT_PATH = certificatePath;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.CASHNET_SUPABASE_CA_CERT_PATH;
    else process.env.CASHNET_SUPABASE_CA_CERT_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

test("Supabase PostgreSQL connections supply an explicit CA and preserve hostname verification", async () => {
  await withTestCertificate(() => {
    const config = createVerifiedSupabaseConnectionConfig(
      "postgresql://cashnet.project:runtime-password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&application_name=cashnet",
    );
    assert.equal(config.ssl && typeof config.ssl !== "boolean" && config.ssl.rejectUnauthorized, true);
    assert.equal(config.ssl && typeof config.ssl !== "boolean" && config.ssl.servername, "aws-0-ap-south-1.pooler.supabase.com");
    assert.equal(config.ssl && typeof config.ssl !== "boolean" && config.ssl.ca, testCertificate);
    assert.ok(config.connectionString?.includes("application_name=cashnet"));
    assert.ok(!config.connectionString?.includes("sslmode="));
  });
});

test("Supabase PostgreSQL configuration rejects local hosts and missing CA material", async () => {
  await assert.rejects(
    async () => createVerifiedSupabaseConnectionConfig("postgresql://cashnet:password@localhost:5432/cashnet"),
    /official Supabase direct or pooler hostname/,
  );

  const previous = process.env.CASHNET_SUPABASE_CA_CERT_PATH;
  delete process.env.CASHNET_SUPABASE_CA_CERT_PATH;
  try {
    assert.throws(
      () => createVerifiedSupabaseConnectionConfig("postgresql://cashnet:password@db.example.supabase.co:5432/postgres?sslmode=verify-full"),
      /CASHNET_SUPABASE_CA_CERT_PATH is required/,
    );
  } finally {
    if (previous !== undefined) process.env.CASHNET_SUPABASE_CA_CERT_PATH = previous;
  }
});

test("Supabase URLs must declare verify-full rather than relying on pg URL defaults", async () => {
  await withTestCertificate(() => {
    assert.throws(
      () => createVerifiedSupabaseConnectionConfig("postgresql://cashnet:password@db.example.supabase.co:5432/postgres?sslmode=require"),
      /must explicitly use sslmode=verify-full/,
    );
  });
});

test("disposable PostgreSQL is limited to an explicit CI test-only loopback mode", () => {
  const previous = {
    mode: process.env.CASHNET_DATABASE_TEST_MODE,
    ci: process.env.CI,
    nodeEnv: process.env.NODE_ENV,
  };
  process.env.CASHNET_DATABASE_TEST_MODE = "disposable-postgres";
  process.env.CI = "true";
  process.env.NODE_ENV = "test";
  try {
    const config = createVerifiedSupabaseConnectionConfig("postgresql://cashnet:test@127.0.0.1:5432/cashnet_test");
    assert.equal(config.ssl, undefined);
    assert.match(config.connectionString ?? "", /127\.0\.0\.1/);
    assert.throws(
      () => createVerifiedSupabaseConnectionConfig("postgresql://cashnet:test@database.example:5432/cashnet_test"),
      /must use a loopback host/,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const environmentKey = key === "mode" ? "CASHNET_DATABASE_TEST_MODE" : key === "ci" ? "CI" : "NODE_ENV";
      if (value === undefined) delete process.env[environmentKey];
      else process.env[environmentKey] = value;
    }
  }
});
