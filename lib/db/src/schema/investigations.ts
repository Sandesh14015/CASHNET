import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cases } from "./cases";
import { users } from "./identity";

export const investigations = pgTable("investigations", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull().references(() => cases.id),
  status: text("status").notNull(),
  chain: text("chain"),
  walletAddress: text("wallet_address"),
  investigationDepth: integer("investigation_depth").notNull().default(1),
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  authorizedBy: uuid("authorized_by").references(() => users.id),
  authorizedAt: timestamp("authorized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("investigations_case_id_idx").on(table.caseId)]);

export const walletSubjects = pgTable("wallet_subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
  chain: text("chain").notNull(),
  walletAddress: text("wallet_address").notNull(),
  label: text("label").notNull().default("UNKNOWN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("wallet_subjects_investigation_idx").on(table.investigationId), index("wallet_subjects_chain_address_idx").on(table.chain, table.walletAddress)]);
