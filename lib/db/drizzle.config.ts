import { defineConfig } from "drizzle-kit";
import path from "path";

const migrationDatabaseUrl = process.env.CASHNET_MIGRATION_DATABASE_URL;

if (!migrationDatabaseUrl) {
  throw new Error("CASHNET_MIGRATION_DATABASE_URL is required; DATABASE_URL is never used as a migration fallback.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: migrationDatabaseUrl,
  },
});
