import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases";
import { users } from "./identity";

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").references(() => cases.id),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  requestId: text("request_id"),
  result: text("result").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_events_case_time_idx").on(table.caseId, table.createdAt), index("audit_events_actor_time_idx").on(table.actorId, table.createdAt)]);
