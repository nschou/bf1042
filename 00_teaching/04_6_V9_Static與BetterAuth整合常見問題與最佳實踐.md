# V9 Static 靜態檔案與 Better Auth 整合：常見問題與最佳實踐

## 問題發現

在檢視 `backend.ts` v9-clean-better-auth-v2 分支時，發現了幾個與官方最佳實踐不符的架構問題：

### 1. 靜態檔案處理重複

**問題點**：同時使用 `staticPlugin` 和手動 SPA fallback，造成功能重疊

```ts
// 第 35-42 行：使用 staticPlugin
if (hasPublicAssets) {
  app.use(staticPlugin({
    assets: "public",
    prefix: "",  // ⚠️ 空字串可能導致未定義行為
  }));
}

// 第 529-556 行：又手動實作完整的 SPA fallback
app.get("*", async ({ request }) => {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const staticFile = Bun.file(`./public${pathname}`);
  if (pathname !== "/" && (await staticFile.exists())) {
    return staticFile;
  }
  return Bun.file("./public/index.html");
});
```

**影響**：
- 路由邏輯重複，維護困難
- 效能浪費（請求可能經過兩層處理）
- 路由優先順序混淆

### 2. Better Auth 路由掛載方式

**目前做法**：分別定義 GET 和 POST 兩個路由

```ts
app.get("/api/auth/*", ({ request }) => auth.handler(request));
app.post("/api/auth/*", ({ request }) => auth.handler(request));
```

**問題**：需維護多個路由定義，不符合官方推薦的 `.mount()` 方式

### 3. Session 認證邏輯重複

**目前狀況**：7 個受保護的路由都重複以下程式碼：

```ts
const user = await getCurrentUser(request);
if (!user) {
  set.status = 401;
  return { error: "Unauthorized" };
}
```

**問題**：大量重複程式碼，難以統一管理認證邏輯

### 4. CORS 手動實作

**目前做法**：手動實作 OPTIONS handler 和 onAfterHandle

```ts
app.options("*", ({ request, set }) => {
  // 手動設定 CORS headers
});

app.onAfterHandle(({ request, set }) => {
  // 再次手動設定 CORS headers
});
```

**問題**：程式碼量大、邏輯散亂，應該使用 `@elysia/cors` plugin

---

## Elysia Static Plugin 重要限制與注意事項

### 核心配置參數

| 參數 | 說明 | 注意事項 |
|------|------|---------|
| `assets` | 靜態資源目錄 | 預設 `public` |
| `prefix` | URL 前綴 | **不要用空字串**，應明確設為 `/` 或 `/assets` |
| `indexHTML` | SPA fallback | 啟用後自動回傳 `index.html` |
| `staticLimit` | 效能門檻 | 超過此值改用 lazy 加載到 router |
| `alwaysStatic` | 強制全部註冊 | 小型站點可用，大型專案慎用 |
| `ignorePatterns` | 排除路徑 | 用正則排除 API 路徑避免被靜態檔案誤吃 |

### 常見陷阱

#### 1. 前綴不一致導致 404

```ts
// ❌ 錯誤：前端假設資源在根目錄，但 plugin 掛在 /public
app.use(staticPlugin({
  assets: "public",
  prefix: "/public",  // 檔案從 /public/logo.png 存取
}));
// 前端 HTML: <img src="/logo.png" /> ← 404
```

```ts
// ✅ 正確：prefix 與前端資源路徑一致
app.use(staticPlugin({
  assets: "public",
  prefix: "/",  // 明確設為根目錄
}));
// 前端 HTML: <img src="/logo.png" /> ← 正確
```

#### 2. SPA 路由 fallback 缺失

```ts
// ❌ 錯誤：直接訪問 /dashboard/settings 會 404
app.use(staticPlugin({
  assets: "dist",
  prefix: "/",
}));
```

```ts
// ✅ 正確：啟用 indexHTML 讓所有未命中路由回傳 index.html
app.use(staticPlugin({
  assets: "dist",
  prefix: "/",
  indexHTML: true,  // SPA fallback
}));
```

#### 3. API 路徑被靜態檔案誤吃

```ts
// ❌ 錯誤：若 public 下有 api 資料夾，會干擾 API 路由
app.use(staticPlugin({
  assets: "public",
  prefix: "/",
  indexHTML: true,
}));
app.get("/api/menu", ...);  // 可能被靜態檔案優先處理
```

```ts
// ✅ 正確：明確排除 API 路徑
app.use(staticPlugin({
  assets: "public",
  prefix: "/",
  indexHTML: true,
  ignorePatterns: [
    /^\/api\//,      // 排除所有 /api/* 路徑
    /^\/openapi/,    // 排除 OpenAPI 文件
  ]
}));
```

---

## Better Auth 整合 Gmail OAuth 注意事項

### 必須正確配置的項目

#### 1. `basePath` 與 mount 路徑的疊加邏輯

```ts
// Better Auth 預設 basePath = "/api/auth"
export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  // basePath 預設 "/api/auth"，不需明確設定
});

// Elysia 掛載
app.mount('/auth', auth.handler);

// 最終路徑：/auth + /api/auth = /auth/api/auth
```

**重要**：`basePath` **不能設為空字串或 `/`**，必須接受至少一層子路徑。

#### 2. Google OAuth Callback URL

在 Google Cloud Console 必須註冊：

```
開發環境：
http://localhost:3000/api/auth/callback/google

生產環境：
https://your-domain.com/api/auth/callback/google
```

⚠️ **Production 強制 HTTPS**（localhost 除外）

#### 3. CORS + Credentials 設定

```ts
// ❌ 錯誤：allowedOrigin="*" 時不能設 credentials
app.use(cors({
  origin: "*",
  credentials: true,  // ← 瀏覽器會拒絕
}));
```

```ts
// ✅ 正確：明確 origin 才能開 credentials
app.use(cors({
  origin: "http://localhost:5173",  // Vite dev server
  credentials: true,  // session cookie 必須
}));
```

#### 4. trustedOrigins 白名單

```ts
// ✅ 必須包含所有合法來源
const trustedOrigins = [
  process.env.BETTER_AUTH_URL,     // backend 自己
  process.env.API_ALLOWED_ORIGIN,  // 前端 dev server
].filter(Boolean);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,  // CSRF 保護白名單
  // ...
});
```

#### 5. Session 取得方式

```ts
// ✅ 正確：從 request headers 取得 session
const session = await auth.api.getSession({ 
  headers: request.headers 
});

if (!session?.user) {
  // 未登入處理
}
```

#### 6. Sign-out CSRF Origin 問題

**問題場景**：Production 環境若 `BETTER_AUTH_URL` 設定錯誤（如仍是 localhost），瀏覽器送出的 Origin（正式網址）不在 `trustedOrigins`，導致 sign-out 被 CSRF 保護擋下回 403，但前端不知道，造成假登出。

**解法**：在 Elysia 層加 proxy，以 server 信任的 baseURL 當 Origin 轉發

```ts
app.post("/api/sign-out", async ({ request }) => {
  const baBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  
  const proxiedHeaders = new Headers(request.headers);
  proxiedHeaders.set("origin", baBaseUrl);  // 強制覆寫 origin
  
  const proxiedRequest = new Request(`${baBaseUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: proxiedHeaders,
  });
  
  return await auth.handler(proxiedRequest);
});
```

---

## 推薦修正方案（v9-clean-better-auth-v3 實作版本）

基於實作經驗，我們採用了以下方案組合：

### 方案 A：優化 staticPlugin 配置（✅ 已實作）

**優點**：簡潔、利用官方優化、自動處理 SPA

```ts
if (hasPublicAssets) {
  app.use(staticPlugin({
    assets: "public",
    prefix: "/",           // 明確設為根路徑
    indexHTML: true,       // 自動 SPA fallback
    staticLimit: 1024,     // 控制效能門檻（KB）
    ignorePatterns: [
      /^\/api\//,          // 排除所有 API 路徑
      /^\/openapi/,        // 排除 OpenAPI 文件
    ]
  }));
}

// ❌ 已刪除手動的 app.get("*", ...) wildcard handler
```

### 方案 B：改用 @elysia/cors plugin（✅ 已實作）

**優點**：簡化 CORS 邏輯，官方維護

```ts
import { cors } from '@elysia/cors';

app.use(cors({
  origin: process.env.API_ALLOWED_ORIGIN === "*" 
    ? "*" 
    : process.env.API_ALLOWED_ORIGIN || "http://localhost:5173",
  credentials: process.env.API_ALLOWED_ORIGIN !== "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ❌ 已刪除手動的 app.options() 和 onAfterHandle CORS 邏輯
```

### 方案 C：Better Auth 改用 mount + requireUser helper（✅ 已實作，簡化版）

**實際採用方案**：由於 Elysia macro 系統的類型限制，我們採用了更簡單但同樣有效的方案：

```ts
// 1. Better Auth 使用 mount 統一掛載
const betterAuthPlugin = new Elysia({ name: "better-auth" }).mount(
  "/api/auth",
  auth.handler,
);

app.use(betterAuthPlugin);

// 2. 創建簡化的 helper 函數
async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

// 3. 保護路由使用 helper（統一認證邏輯）
app.get("/api/orders/current", async ({ request }) => {
  const user = await requireUser(request); // 一行搞定認證 + 401 處理
  const currentOrder = store.getCurrentOrderByUserId(user.id);
  return { data: currentOrder ? toOrderResponse(currentOrder) : null };
}, {
  detail: { tags: ["orders"], ... },
  response: { ... }
});
```

**優點**：
- 統一認證邏輯，不需每個路由重複 `if (!user)` 判斷
- 比原版少約 6 行 × 7 個路由 = 42 行重複程式碼
- 程式碼清晰，沒有複雜的 macro/derive/guard 類型問題
- 符合 TypeScript 類型安全

**為何不用 macro**：
Elysia 的 macro 系統主要設計用於可選的行為模式，而非注入必需的上下文屬性。雖然官方範例展示了 macro 用法，但在實際生產環境中，簡單的 helper 函數更易維護且類型安全。

---

## 實作檢查清單（v9-clean-better-auth-v3）

### Phase 1：靜態檔案處理（必做）

- [x] 決定使用 staticPlugin（已採用）
- [x] 設定 `prefix: "/"`（明確根路徑）
- [x] 啟用 `indexHTML: true`（SPA fallback）
- [x] 設定 `ignorePatterns` 排除 `/api/` 和 `/openapi`
- [x] 刪除手動的 `app.get("*", ...)` wildcard handler

### Phase 2：CORS 簡化（建議）

- [x] 安裝 `@elysia/cors`
- [x] 改用 cors plugin
- [x] 刪除手動的 `app.options()` handler
- [x] 刪除 `onAfterHandle` 中的 CORS 邏輯

### Phase 3：Better Auth 整合優化（已簡化實作）

- [x] 改用 `.mount('/api/auth', auth.handler)`
- [x] 刪除分開的 `app.get("/api/auth/*")` 和 `app.post("/api/auth/*")`
- [x] 創建 `requireUser()` helper 統一認證邏輯
- [x] 重構所有受保護路由（7 個）使用統一 helper

**實際採用**：使用 `requireUser()` helper 取代複雜的 macro，簡化且類型安全。

### Phase 4：部署前檢查

- [ ] 確認 `BETTER_AUTH_URL` 環境變數正確
- [ ] Google Cloud Console 已註冊正確的 callback URL
- [ ] `trustedOrigins` 包含所有合法來源
- [ ] Production 環境使用 HTTPS
- [ ] 測試 Gmail OAuth 登入流程
- [ ] 測試 sign-out（含 CSRF proxy）

---

## 路由優先順序總結

Elysia 路由匹配順序（由高到低）：

1. **Explicit routes**：明確定義的 `app.get("/api/menu")` 
2. **Static plugin**：`staticPlugin` 註冊的靜態檔案路由
3. **Wildcard routes**：`app.get("*")` 等萬用路由

**因此**：
- API 路由要在靜態檔案之前定義（或用 `ignorePatterns` 排除）
- SPA fallback wildcard 要放在最後
- 不要同時用 staticPlugin 和手動 wildcard，會造成混淆

---

## V3 實作經驗：靜態檔案處理的最佳解

### 發現的問題

在實作 v9-clean-better-auth-v3 時，發現 `@elysiajs/static` plugin 存在路由優先級問題：

1. **即使使用 `ignorePatterns`，API 路由仍可能被攔截**
   - 測試發現：`/health` 路由返回 HTML 而非 JSON
   - 原因：`staticPlugin` 的內部實作可能在打包後行為不一致

2. **端口衝突導致測試失敗**
   - 症狀：即使修改代碼，測試結果仍然錯誤
   - 原因：其他 Bun 進程佔用了 port 3000
   - 檢查方式：`lsof -i :3000` 或 `netstat -tlnp | grep 3000`

3. **Drizzle pgSchema 不能使用 "public"**
   - 錯誤：`You can't specify 'public' as schema name`
   - 原因：Postgres 的 `public` schema 應該直接用 `pgTable()`，不需要 `pgSchema()`
   - 解決：預設值改為 `"bf_v9"`，並檢查禁止使用 `"public"`

### 最終解決方案

**完全移除 staticPlugin，改用手動 wildcard 路由**：

```ts
// ❌ 移除：不再使用 staticPlugin
// import { staticPlugin } from "@elysiajs/static";
// app.use(staticPlugin({ ... }));

// ✅ 採用：完全手動控制路由優先級
if (hasPublicAssets) {
  app.get("*", async ({ request }) => {
    const pathname = new URL(request.url).pathname;

    // API 路徑返回 404
    if (pathname.startsWith("/api/") || pathname.startsWith("/openapi")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 嘗試回傳對應的靜態檔案
    const staticFile = Bun.file(`./public${pathname}`);
    if (pathname !== "/" && (await staticFile.exists())) {
      return staticFile;
    }

    // SPA fallback: 回傳 index.html
    return Bun.file("./public/index.html");
  });
}
```

**修正 pgSchema 預設值**：

```ts
// db/schema.ts 和 db/auth-schema.ts
const schemaName = process.env.PG_SCHEMA || "bf_v9";
if (schemaName === "public") {
  throw new Error(
    'PG_SCHEMA cannot be "public". Use a custom schema name or leave it unset to use the default "bf_v9".',
  );
}
const appSchema = pgSchema(schemaName);
```

### 優點

1. **路由優先級完全可控**
   - 明確的 API 路由（如 `/health`）優先於 wildcard
   - 沒有 plugin 黑盒行為造成的意外

2. **打包後行為一致**
   - 開發模式和打包模式表現相同
   - 沒有環境差異造成的困惑

3. **代碼簡潔易懂**
   - 20 行代碼取代 plugin 配置
   - 邏輯集中，易於調試和維護

### 測試驗證

```bash
# 開發模式
bun backend.ts

# 測試 API
curl http://localhost:3000/health       # → {"status":"ok"}
curl http://localhost:3000/api/menu     # → {"data":[...]}

# 測試 SPA
curl http://localhost:3000/             # → <!doctype html>...

# 打包模式
bun run build:backend
bun dist/backend.js
# 再次測試，行為一致
```

---

## 參考資源

- [Elysia Static Plugin 官方文件](https://elysiajs.com/plugins/static)
- [Elysia Fullstack Dev Server 範例](https://elysiajs.com/patterns/fullstack-dev-server)
- [Better Auth Elysia 整合指南](https://www.better-auth.com/docs/integrations/elysia)
- [Better Auth CSRF Protection](https://www.better-auth.com/docs/concepts/security)
- [Drizzle pgSchema 文件](https://orm.drizzle.team/docs/schemas)

---

## 版本歷程

- **v9-clean-better-auth-v2**：初始 Better Auth 整合（含架構問題）
- **v9-clean-better-auth-v3**：修正靜態檔案處理、CORS、session 注入邏輯，移除 staticPlugin 改用手動路由
