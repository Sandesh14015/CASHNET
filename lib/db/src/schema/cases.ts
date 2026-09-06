import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export const cases = pgTable("cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseReference: text("case_reference").notNull().unique(),
  title: text("title").notNull(),
  fraudType: text("fraud_type").notNull(),
  reportedAmount: numeric("reported_amount").notNull(),
  status: text("status").notNull().default("OPEN"),
  investigationAuthorizationStatus: text("investigation_authorization_status").notNull().default("PENDING"),
  priority: text("priority").notNull().default("MEDIUM"),
  description: text("description").notNull(),
  sourceType: text("source_type").notNull().default("USER_PROVIDED"),
  createdBy: uuid("created_by").references(() => users.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const caseMemberships = pgTable("case_memberships", {
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("case_memberships_user_idx").on(table.userId), index("case_memberships_case_idx").on(table.caseId)]);
