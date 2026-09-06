import { index, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases";
import { users } from "./identity";
import { investigations } from "./investigations";

export const evidence = pgTable("evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").references(() => cases.id),
  investigationId: uuid("investigation_id").references(() => investigations.id),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  evidenceType: text("evidence_type").notNull(),
  sourceType: text("source_type").notNull(),
  provider: text("provider"),
  sourceReference: text("source_reference"),
  sourceUrl: text("source_url"),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
  method: text("method"),
  confidence: numeric("confidence"),
  rawReference: text("raw_reference"),
  rawData: jsonb("raw_data"),
  contentHash: text("content_hash"),
  description: text("description"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("evidence_case_id_idx").on(table.caseId), index("evidence_investigation_id_idx").on(table.investigationId)]);
