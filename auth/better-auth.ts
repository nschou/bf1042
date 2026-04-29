import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client.ts";
import * as schema from "../db/auth-schema.ts";
import type { SessionUser } from "../shared/contracts.ts";

// ─── Startup guard ────────────────────────────────────────────────────────────
// BETTER_AUTH_SECRET 必須在啟動時存在且不為佔位值，
// 否則 session 簽名金鑰會不安全，讓問題在啟動期明確報錯而非靜默失敗。
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret === "replaceme") {
  throw new Error(
    "BETTER_AUTH_SECRET is required and must not be 'replaceme'. " +
      "Generate one with: bun -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// ─── Better Auth instance ─────────────────────────────────────────────────────
// V9 第一階段：只啟用 email/password，Google OAuth 放第二階段。
// auth tables（user / session / account / verification）存在 bf_v9 schema 下，
// 與業務 tables（menu_items / orders / order_items）並存於同一 DB。
export const auth = betterAuth({
  baseURL,
  secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
});

// ─── Session helper ───────────────────────────────────────────────────────────
// 從 Request headers 取出 session，轉換成 contracts.ts 定義的 SessionUser。
// DB 層的 Better Auth user 欄位（emailVerified / image / createdAt 等）
// 不對外暴露，只取 contracts.ts 中定義的三個欄位。
export async function getCurrentUser(
  request: Request,
): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  // DbUser → SessionUser 轉換（延續 02_4 講義的分層原則）
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}
