import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema.ts";
import * as authSchema from "./auth-schema.ts";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for PostgreSQL store. Set DATABASE_URL or switch STORE_DRIVER=json.",
  );
}

const pool = new Pool({ connectionString: databaseUrl });

export const db = drizzle({
  client: pool,
  schema: { ...schema, ...authSchema },
});
