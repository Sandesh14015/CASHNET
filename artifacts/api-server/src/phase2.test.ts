import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { CaseAuthorizationService } from "./auth/case-authorization-service";
import { createConfig } from "./config";
import { NotFoundError } from "./errors/app-error";
import type { AuditRepository } from "./repositories/audit-repository";
import type { CaseRepository } from "./repositories/case-repository";
import type { Actor, AuditEventRecord } from "./repositories/types";

const actor: Actor = { id: "user-a", username: "investigator-a", roles: ["INVESTIGATOR"], permissions: ["CASE_READ"] };

test("development authentication is explicitly disabled by default and in production", () => {
  assert.equal(createConfig({ NODE_ENV: "production", CASHNET_DEV_AUTH_ENABLED: "true" }).developmentAuthEnabled, false);
  assert.equal(createConfig({ NODE_ENV: "development" }).developmentAuthEnabled, false);
});

test("case isolation returns a non-enumerating not-found and appends a denial audit event", async () => {
  const events: Omit<AuditEventRecord, "id" | "createdAt">[] = [];
  const cases: Pick<CaseRepository, "findAccessibleById"> = { findAccessibleById: async () => null };
  const audit: Pick<AuditRepository, "append"> = { append: async (event) => { events.push(event); return { ...event, id: "event", createdAt: new Date().toISOString() }; } };
  const policy = new CaseAuthorizationService(cases as CaseRepository, audit as AuditRepository);
  await assert.rejects(() => policy.requireCaseAccess(actor, "unrelated-case", "CASE_READ", "request-1"), NotFoundError);
  assert.deepEqual(events[0], { caseId: null, actorId: "user-a", action: "UNAUTHORIZED_ACCESS_ATTEMPT", resourceType: "case", resourceId: "unrelated-case", requestId: "request-1", result: "DENIED", metadata: { permission: "CASE_READ", reason: "missing_or_inaccessible" } });
});

test("Phase 2 migration provides identities, isolation, evidence, audit and controlled status constraints", async () => {
  const migration = await readFile(new URL("../../../database/migrations/20260828_phase2_persistence_rbac.sql", import.meta.url), "utf8");
  for (const item of ["create table if not exists users", "roles", "permissions", "user_roles", "case_memberships", "wallet_subjects", "audit_events", "cases_status_check", "investigations_status_check", "evidence_confidence_check"]) assert.match(migration, new RegExp(item));
  assert.match(migration, /revoke update, delete on audit_events/i);
  const runner = await readFile(new URL("../../../lib/db/src/migrate.ts", import.meta.url), "utf8");
  assert.match(runner, /cashnet_schema_migrations/);
});
