# V7 Render 首次部署教案手冊

本手冊放在 V7 結尾、V8 之前使用。目標不是一次教很多平台細節，而是先讓學生完成第一次完整雲端部署，建立 Render 的基本操作感與驗證習慣。

教學原則固定如下：

- 先講為什麼先在 V7 部署
- 再講這次部署的完成標準
- 最後才進入 Render 的實際設定

---

## 0. 教學目標與完成定義

### 為什麼

V7 還沒有資料庫，環境變數與外部服務最少，最適合第一次教部署。這樣學生可以先把注意力放在 Render 的基本流程，而不是同時處理資料庫、migration 與 auth。

### 要做什麼

在 V7 完成後，依序完成：

1. 確認 `backend.ts` 已是正式入口
2. 在本機完成 build 驗證
3. 在 Render 建立 Web Service
4. 成功部署並驗證健康檢查與核心 API

### 完成標準

- Render 成功 build 並啟動服務
- `/health` 可正常回應
- `/api/menu` 可正常回應
- 學生能說出這次部署用到的 `Build Command` 與 `Start Command`

---

## 1. 為什麼第一次部署要放在 V7

### 為什麼

V7 是目前正式入口收斂版，`README`、scripts、build 與 start 都已經對準 `backend.ts`。這時候先部署，有三個教學好處：

1. 學生先學會平台流程，不會被資料庫設定分散注意力
2. 可以先建立「本機可跑 ≠ 雲端可用」的觀念
3. 後面到 V8 時，只要補講部署差異，不必整套重教

### 要做什麼

把 V7 定位成「首次完整部署版」。

### 怎麼做

課堂上固定說清楚：

1. V7 教完整部署
2. V8 起只教部署調整
3. 後續每版完成後，都補一段「本版部署差異」

---

## 2. 部署前檢查

### 為什麼

若本機 build 都沒先確認，到了 Render 才排錯，學生很容易把本機問題誤判成平台問題。

### 要做什麼

先在本機完成最低限度檢查：

- 安裝依賴
- build 成功
- 確認正式入口就是 `backend.ts`

### 怎麼做

```bash
bun install
bun run build
```

若 build 成功，代表至少已產生：

- `public/`：前端靜態資產
- `dist/backend.js`：後端正式啟動檔

---

## 3. Render 首次部署

### 為什麼

實際在 Render 建立 Web Service 時，介面上不一定會看到 `Bun` 選項；常見情況是只有 `Node`。但就本專案的實測結果來看，只要 `Build Command` 與 `Start Command` 直接使用 `bun`，仍可正常部署，設定也比 Docker 少，適合課堂第一次上雲。

### 要做什麼

依序完成以下四項：

1. 建立 Web Service 並連 GitHub repo
2. 在 Render 的 `Node` 環境中使用 `bun` 指令
3. 填入正確的 Build / Start 指令
4. 完成首次部署

### 怎麼做

#### 步驟 1：建立帳號並連結 repo

1. 前往 <https://render.com>，以 GitHub 帳號登入
2. 點擊 **New +** → **Web Service**
3. 選擇對應 repo

#### 步驟 2：設定服務基本資訊

| 欄位          | 值                              |
| ------------- | ------------------------------- |
| Name          | `breakfast-api`（可自訂）       |
| Region        | `Singapore`（距台灣較近）       |
| Branch        | `main`                          |
| Environment   | **Node**                        |
| Build Command | `bun install && bun run build`  |
| Start Command | `bun run start`                 |
| Plan          | Free                            |

補充提醒：

- 目前 Render 的 Web Service 介面中，`Environment` 常只看得到 `Node`
- 不需要因為沒有 `Bun` 選項就停下來
- 選 `Node` 後，`Build Command` 與 `Start Command` 仍可直接填 `bun ...`

這次最重要的是記住：

- `Build Command`：`bun install && bun run build`
- `Start Command`：`bun run start`

也就是先安裝依賴，再 build 前後端，最後啟動 `dist/backend.js`。

#### 步驟 3：設定環境變數

V7 沒有資料庫，因此不需要設定 `DATABASE_URL`。

可先只保留最小設定：

| Key                  | 說明                                              |
| -------------------- | ------------------------------------------------- |
| `NODE_ENV`           | `production`                                      |
| `API_ALLOWED_ORIGIN` | 初期可先留空；若前後端分站部署，再填部署後實際前端網址 |

#### 步驟 4：建立服務並等待首次部署

點擊 **Create Web Service** 後，Render 會依序執行：

```text
1. bun install
2. bun run build
3. bun run start
```

---

## 4. 部署後立即驗證

### 為什麼

部署成功不代表功能可用。一定要用可重現的方式驗證。

### 要做什麼

至少檢查兩件事：

1. 健康檢查是否正常
2. 核心 API 是否可回應

### 怎麼做

```bash
curl -i https://<your-render-domain>.onrender.com/health
curl -i https://<your-render-domain>.onrender.com/api/menu
```

預期結果：

- `/health` 回 `200` 與 `{"status":"ok"}`
- `/api/menu` 回 `200` 並帶回菜單 JSON

---

## 5. V7 常見排查重點

| 症狀                           | 可能原因                                                        | 解法                                                                                 |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Build 失敗                     | 依賴未安裝完整或 script 設錯                                    | 先在本機跑 `bun install`、`bun run build`                                            |
| 前端資源 404                   | `public/` 未正確產生或未正確 serve                              | 確認 build 有產生 `public/`，且後端已掛 `@elysiajs/static`                           |
| 重新整理後頁面異常             | SPA fallback 或靜態資源路徑設定有問題                           | 回頭對照 V4 的部署修正版脈絡                                                         |
| 加入購物車失敗但重新登入後正常 | 瀏覽器 `localStorage` 保留舊 `userId`，目前資料源查不到該使用者 | 先登出再登入；前端在 `/api/orders` 收到 `401/403/404` 時應清理登入狀態並提示重新登入 |
| 首次請求很慢（~30 秒）         | Free plan 閒置後 spin down                                      | 屬於免費方案預期行為                                                                 |

---

## 6. 進入 V8 時只需要補哪些部署差異

V8 不用把整套 Render 流程重教一次，只要明確指出與 V7 相比多了什麼：

1. `Build Command` 從 `bun install && bun run build`
   改成 `bun install && bun run db:migrate && bun run build`
2. 新增 `STORE_DRIVER=postgres`，讓 runtime 真正切到 PostgreSQL store
3. 新增 `DATABASE_URL`，並建議同步設定 `DATABASE_URL_MIGRATION`
4. 驗證時除了 `/health` 與 `/api/menu`，還要確認資料庫 migration 已套用成功

這樣學生就會知道：

- 平台流程其實一樣
- 版本升級時，主要是補部署差異
- 之後每一版都應照這種方式檢查

---

## 7. 固定教學節奏建議

從這份手冊開始，後續版本都建議固定用同一個收尾節奏：

1. 版本功能完成
2. 補一小節：本版部署差異
3. 固定檢查三件事：
   - `Build Command` 有沒有改
   - `Start Command` 有沒有改
   - 環境變數 / 外部服務有沒有新增

這樣部署就不會被學生理解成「課程最後才做一次的特例」，而會變成每次迭代都要順手確認的工程習慣。
