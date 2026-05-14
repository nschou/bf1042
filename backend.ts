import { Elysia } from "elysia";
import { z } from "zod";
import { openapi } from "@elysiajs/openapi";
import { staticPlugin } from "@elysiajs/static";
import { existsSync } from "node:fs";
import { menuItemSchema, orderItemSchema } from "./shared/contracts.ts";
import {
  orderResponseSchema,
  apiErrorResponseSchema,
  toOrderResponse,
  type Order,
  type OrderResponse,
} from "./shared/route-schemas.ts";
import { createStore } from "./store/index.ts";
import { auth, getCurrentUser } from "./auth/better-auth.ts";

// 從環境變量獲取配置
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "*";
const store = createStore({ dataFilePath: "./data/store.json" });
const hasPublicAssets =
  existsSync("./public") && existsSync("./public/index.html");

// ─── Response Envelope Schemas（從 shared/contracts.ts 的業務 schema 組合）──
// 業務核心型別（menuItemSchema, orderResponseSchema 等）
// 定義在 shared/contracts.ts，這裡只組合成各 API 需要的 envelope 結構。

const menuListResponseSchema = z.object({
  data: z.array(menuItemSchema),
});

const menuItemResponseSchema = z.object({
  data: menuItemSchema,
});

const orderListResponseSchema = z.object({
  data: z.array(orderResponseSchema),
});

const orderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema,
});

const nullableOrderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema.nullable(),
});

const healthResponseSchema = z.object({
  status: z.string(),
});

const app = new Elysia();

if (hasPublicAssets) {
  app.use(
    staticPlugin({
      assets: "public",
      prefix: "",
    }),
  );
}

app.use(
  openapi({
    path: "/openapi",
    specPath: "/openapi/json",
    documentation: {
      info: {
        title: "Breakfast Demo API",
        version: "0.2.2",
        description:
          "Breakfast ordering demo API for teaching route schema, contract-first design, and future database/auth upgrades.",
      },
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "menu", description: "Menu management endpoints" },
        { name: "orders", description: "Order query and mutation endpoints" },
        { name: "system", description: "System and health check endpoints" },
      ],
    },
    exclude: {
      staticFile: true,
      paths: ["/openapi", "/openapi/json"],
    },
  }),
);

// 請求記錄中間件
app.onRequest(({ request }) => {
  console.log(
    `[${toTaipeiDateTime(new Date().toISOString())}] ${request.method} ${new URL(request.url).pathname}`,
  );
});

app.options(
  "*",
  ({ request, set }) => {
    const requestOrigin = request.headers.get("origin");
    // Preflight 需要直接在 OPTIONS handler 設 CORS 頭，
    // 因為 onAfterHandle 不保證在 OPTIONS 204 前執行。
    if (allowedOrigin === "*") {
      set.headers["access-control-allow-origin"] = requestOrigin || "*";
    } else if (requestOrigin === allowedOrigin) {
      set.headers["access-control-allow-origin"] = allowedOrigin;
      set.headers["access-control-allow-credentials"] = "true";
    }
    set.headers["access-control-allow-methods"] =
      "GET,POST,PATCH,DELETE,OPTIONS";
    set.headers["access-control-allow-headers"] = "Content-Type, Authorization";
    set.headers.vary = "Origin";
    set.status = 204;
    return "";
  },
  {
    detail: {
      hide: true,
    },
  },
);

app.onAfterHandle(({ request, set }) => {
  const requestOrigin = request.headers.get("origin");

  if (allowedOrigin === "*") {
    set.headers["access-control-allow-origin"] = requestOrigin || "*";
    // allowedOrigin=* 時不能同時設 credentials（瀏覽器規範禁止）
  } else if (requestOrigin === allowedOrigin) {
    set.headers["access-control-allow-origin"] = allowedOrigin;
    // 明確 origin 才能允許 credentials（session cookie 所需）
    set.headers["access-control-allow-credentials"] = "true";
  } else {
    return;
  }

  set.headers.vary = "Origin";
  set.headers["access-control-allow-methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
  set.headers["access-control-allow-headers"] = "Content-Type, Authorization";
});

// API 路由

// ─── Better Auth Handler ──────────────────────────────────────────────────────
// 所有 /api/auth/* 的請求（sign-up, sign-in, get-session, sign-out 等）
// 全部交給 Better Auth 處理。
// Elysia 1.4.x 中，明確的 get()/post() 路由優先順序高於 get("*") SPA fallback，
// 因此必須分別定義 GET 和 POST，確保路由在 SPA wildcard 之前被捕捉。
app.get("/api/auth/*", ({ request }) => auth.handler(request));
app.post("/api/auth/*", ({ request }) => auth.handler(request));

// ─── Sign-out Proxy ───────────────────────────────────────────────────────────
// Better Auth 的 /api/auth/sign-out 有 CSRF origin 驗證（比對 trustedOrigins）。
// production 環境若 BETTER_AUTH_URL 設定錯誤（如仍是 localhost），
// 瀏覽器送出的 Origin（正式網址）不在白名單，導致 sign-out 回 403 但前端不知道，
// 造成「看似登出，實際 session 仍在」的假登出。
//
// 解法：在 Elysia 層加一個 proxy，以 server 信任的 baseURL 當 Origin 轉發給 Better Auth。
// 安全性：session 識別仍靠 cookie，CSRF bypass 只在 server 端發生，不降低安全性。
app.post("/api/sign-out", async ({ request }) => {
  const baBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  // 複製原始 headers，強制覆寫 origin 為 Better Auth 信任的 baseURL
  const proxiedHeaders = new Headers(request.headers);
  proxiedHeaders.set("origin", baBaseUrl);

  const proxiedRequest = new Request(`${baBaseUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: proxiedHeaders,
  });

  const res = await auth.handler(proxiedRequest);
  if (!res.ok) {
    const body = await res
      .clone()
      .text()
      .catch(() => "(unreadable)");
    console.error(`[sign-out proxy] Better Auth returned ${res.status}:`, body);
  }
  return res;
});

// 菜單路由
app.get("/api/menu", () => ({ data: [...store.getMenu()] }), {
  detail: {
    tags: ["menu"],
    summary: "List menu items",
    description: "Return all available breakfast menu items.",
  },
  response: {
    200: menuListResponseSchema,
  },
});

app.post(
  "/api/menu",
  async ({ body, set }) => {
    const newMenuItem = await store.createMenuItem(body);
    set.status = 201;
    return { data: newMenuItem };
  },
  {
    body: z.object({
      name: z.string().min(1),
      price: z.number().int().min(0),
      category: z.string().min(1),
      description: z.string().min(1),
      image_url: z.string().min(1),
    }),
    detail: {
      tags: ["menu"],
      summary: "Create a menu item",
      description: "Add a new menu item into the breakfast menu.",
    },
    response: {
      201: menuItemResponseSchema,
    },
  },
);

app.patch(
  "/api/menu/:id",
  async ({ params, body, set }) => {
    const menuId = parseInt(params.id);
    const menuItem = await store.updateMenuItem(menuId, body);

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: menuItem };
  },
  {
    params: z.object({
      id: z.string().regex(/^[0-9]+$/),
    }),
    body: z.object({
      name: z.string().min(1).optional(),
      price: z.number().int().min(0).optional(),
      category: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      image_url: z.string().min(1).optional(),
    }),
    detail: {
      tags: ["menu"],
      summary: "Update a menu item",
      description: "Update fields of an existing menu item.",
    },
    response: {
      200: menuItemResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/menu/:id",
  async ({ params, set }) => {
    const menuId = parseInt(params.id);
    const removedMenuItem = await store.deleteMenuItem(menuId);

    if (!removedMenuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: removedMenuItem };
  },
  {
    params: z.object({
      id: z.string().regex(/^[0-9]+$/),
    }),
    detail: {
      tags: ["menu"],
      summary: "Delete a menu item",
      description: "Remove a menu item by id.",
    },
    response: {
      200: menuItemResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 訂單列表路由
app.get(
  "/api/orders",
  () => ({
    data: store.getOrders().map(toOrderResponse),
  }),
  {
    detail: {
      tags: ["orders"],
      summary: "List all orders",
      description: "Return all orders stored in the demo backend.",
    },
    response: {
      200: orderListResponseSchema,
    },
  },
);

// 取得使用者目前進行中的訂單
app.get(
  "/api/orders/current",
  async ({ request, set }) => {
    const user = await getCurrentUser(request);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const currentOrder = store.getCurrentOrderByUserId(user.id);
    return { data: currentOrder ? toOrderResponse(currentOrder) : null };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get current order",
      description:
        "Return the current pending order of a user, or null if none exists.",
    },
    response: {
      200: nullableOrderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 取得使用者歷史訂單
app.get(
  "/api/orders/history",
  async ({ request, set }) => {
    const user = await getCurrentUser(request);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    return {
      data: store.getOrderHistoryByUserId(user.id).map(toOrderResponse),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get order history",
      description: "Return submitted orders belonging to a user.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 創建新訂單
app.post(
  "/api/orders",
  async ({ request, set }) => {
    const user = await getCurrentUser(request);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const existingOrder = store.getCurrentOrderByUserId(user.id);
    if (existingOrder) {
      return { data: toOrderResponse(existingOrder) };
    }

    const newOrder = await store.createOrder({ userId: user.id });
    set.status = 201;
    return { data: toOrderResponse(newOrder) };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Create or reuse current order",
      description:
        "Create a new pending order, or return the existing pending order for the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      201: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 獲取單筆訂單
app.get(
  "/api/orders/:id",
  async ({ params, request, set }) => {
    const user = await getCurrentUser(request);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const orderId = parseInt(params.id, 10);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (order.userId !== user.id) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    return { data: toOrderResponse(order) };
  },
  {
    params: z.object({
      id: z.string().regex(/^[0-9]+$/),
    }),
    detail: {
      tags: ["orders"],
      summary: "Get order by id",
      description:
        "Return a single order when it belongs to the requested user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 更新訂單項目
app.patch(
  "/api/orders/:id",
  async ({ params, body, request, set }) => {
    const user = await getCurrentUser(request);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const orderId = parseInt(params.id);
    const result = await store.updateOrderItem(orderId, {
      userId: user.id,
      itemId: body.itemId,
      qty: body.qty,
    });

    if (!result.ok && result.code === "ORDER_NOT_FOUND") {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!result.ok && result.code === "MENU_ITEM_NOT_FOUND") {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    if (!result.ok && result.code === "ORDER_NOT_OWNED") {
      set.status = 403;
      return { error: "Forbidden" };
    }

    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") {
      set.status = 409;
      return { error: "Order is not editable" };
    }

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: z.object({
      id: z.string().regex(/^[0-9]+$/),
    }),
    body: z.object({
      itemId: z.number().int().min(1),
      qty: z.number().min(0),
    }),
    detail: {
      tags: ["orders"],
      summary: "Update order item quantity",
      description: "Set the quantity of a menu item within a pending order.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 送出訂單
app.post(
  "/api/orders/:id/submit",
  async ({ params, request, set }) => {
    const user = await getCurrentUser(request);
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const orderId = parseInt(params.id, 10);
    const result = await store.submitOrder(orderId, { userId: user.id });

    if (!result.ok && result.code === "ORDER_NOT_FOUND") {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!result.ok && result.code === "ORDER_NOT_OWNED") {
      set.status = 403;
      return { error: "Forbidden" };
    }

    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") {
      set.status = 409;
      return { error: "Order already submitted" };
    }

    if (!result.ok && result.code === "EMPTY_ORDER") {
      set.status = 400;
      return { error: "Empty order cannot be submitted" };
    }

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: z.object({
      id: z.string().regex(/^[0-9]+$/),
    }),
    detail: {
      tags: ["orders"],
      summary: "Submit order",
      description: "Submit a pending order that belongs to the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 健康檢查路由
app.get("/health", () => ({ status: "ok" }), {
  detail: {
    tags: ["system"],
    summary: "Health check",
    description: "Return API health status.",
  },
  response: {
    200: healthResponseSchema,
  },
});

// SPA fallback，只有在前端 build 產物存在時才提供靜態頁面。
if (hasPublicAssets) {
  app.get(
    "*",
    async ({ request }) => {
      const pathname = new URL(request.url).pathname;

      // API 路徑不走 SPA fallback（包含 Better Auth 的 /api/auth/*）
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
    },
    {
      detail: {
        hide: true,
      },
    },
  );
}

// 全局錯誤處理
app.onError(({ error, set, code }) => {
  if (code === "VALIDATION") {
    set.status = 400;
    return {
      error: "Validation failed",
      message: "Please check your request parameters",
    };
  }

  set.status = 500;
  return { error: "Internal server error" };
});

// 啟動服務器
await store.init();

app.listen(port, () => {
  console.log(`🍳 早餐店 API 運行在 http://${host}:${port}`);
  console.log(`🌐 Web App: http://${host}:${port}`);
  console.log(`📋 菜單 API: http://${host}:${port}/api/menu`);
  console.log(`📦 訂單 API: http://${host}:${port}/api/orders`);
  console.log(`💚 健康檢查: http://${host}:${port}/health`);
  console.log(`🔐 CORS Origin: ${allowedOrigin}`);
  if (!hasPublicAssets) {
    console.log(
      "⚠️ public/ 不存在，目前只提供 API。若要提供前端頁面，先執行 bun run build:frontend",
    );
  }
});
