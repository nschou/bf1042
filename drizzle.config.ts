import { defineConfig } from "drizzle-kit";

const migrationUrl =
  process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "DATABASE_URL_MIGRATION or DATABASE_URL is required for drizzle-kit.",
  );
}

export default defineConfig({
  schema: ["./db/schema.ts", "./db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});
