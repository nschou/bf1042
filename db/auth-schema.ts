import { boolean, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

// ─── Auth Schema 設計原則 ─────────────────────────────────────────────────────
// 1. 這是 Better Auth 的 DB 層定義，屬於「資料落地」層，不是 API contract。
// 2. 欄位結構遵循 Better Auth 1.x 規格（https://better-auth.com/docs/concepts/database）。
// 3. 與業務表（menu_items / orders / order_items）並存於同一 db/schema，
//    但放在獨立的 auth-schema.ts，保持職責清晰、方便閱讀對照。
// 4. pgSchema 從 PG_SCHEMA 環境變數取值，與業務 schema 一致（共用 bf_v9）。
//
// 對照 shared/contracts.ts：
//   SessionUser { id, email, name }  ← 只取這三欄對外暴露（auth/better-auth.ts 負責轉換）
//   password、emailVerified、image 等欄位屬於 DB 層，不進入 API contract。
// ─────────────────────────────────────────────────────────────────────────────

const appSchema = pgSchema(process.env.PG_SCHEMA ?? "public");

// ─── user ─────────────────────────────────────────────────────────────────────
// Better Auth 主表，存放使用者基本資料。
// id 由 Better Auth 自動產生（預設為 UUID-like 字串）。
export const user = appSchema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// ─── session ─────────────────────────────────────────────────────────────────
// 每次登入產生一個 session，存放 token 與過期時間。
export const session = appSchema.table("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// ─── account ─────────────────────────────────────────────────────────────────
// 儲存 email/password 認證資料（password hash 放在這裡）。
// 未來接 Google OAuth 時，同一個 user 可有多個 account（providerId 不同）。
export const account = appSchema.table("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// ─── verification ─────────────────────────────────────────────────────────────
// 用於 email 驗證流程（V9 第一階段若不啟用 email 驗證可暫不用，但表需存在）。
export const verification = appSchema.table("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
