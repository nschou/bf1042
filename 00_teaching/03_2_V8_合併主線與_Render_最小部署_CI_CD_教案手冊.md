# V8 合併主線與 Render 部署調整 CI/CD 教案手冊

本手冊給課堂直接使用，前提是學生已經在 V7 做過第一次 Render 部署。這一份的目標，不是重教整套平台操作，而是讓學生從「V7 已可部署」走到「V8 升級後仍可穩定部署」，並建立標準 release 流程。

教學原則固定如下：

- 先講為什麼（背後邏輯與理論）
- 再講要做什麼（產出與驗收標準）
- 最後才講怎麼做（實際指令）

---

## 0. 教學目標與完成定義

### 為什麼

常把「本機可跑」誤認為「可上線」。真實開發需要主線治理、審查與可回滾能力。

### 要做什麼

在 V8 完成後，依序完成：

1. 分支驗證（品質閘門）
2. PR 與 PM/PO 確認
3. 合併回 main
4. 用 main 觸發 V8 的 Render 部署調整
5. 建立最小 CI/CD

### 完成標準

- `main` 可成功 build 並部署
- 雲端健康檢查端點成功回應
- 至少一支核心 API 在雲端可用
- 資料庫 migration 已正確套用
- PR 有技術審查與 PM/PO 核可紀錄

---

## 1. 流程觀念：為什麼 main 要是唯一部署來源

### 為什麼

- `main` 代表團隊共同真相（single source of truth）
- 可回滾、可追蹤、可審計
- 避免「線上版本其實來自某個 feature branch」

### 要做什麼

建立規範：正式環境只從 `main` 部署，功能分支只能做開發與驗證。

### 怎麼做

把以下規範寫進課堂共識：

1. 功能開發在 `feature/*`
2. 驗證與審查在 PR
3. 只有 merge 後的 `main` 才能部署 production

---

## 2. V8 分支驗證（合併前）

### 為什麼

如果在合併後才發現壞掉，主線會不穩，部署風險與修復成本都更高。

### 要做什麼

在 `feat/v8-drizzle-neon` 先完成最低品質閘門：

- 安裝依賴
- 型別/語法與測試檢查
- build 成功

### 怎麼做

```bash
git checkout feat/v8-drizzle-neon
bun install
bun run build
```

若專案已有對應腳本，再加上：

```bash
bun run lint
bun run test
```

---

## 3. 建立 PR 並加入 PM/PO 確認

### 為什麼

技術上能過不代表商業上可上線。教學應讓理解「技術審查 + 業務核可」是兩條平行必要條件。

### 要做什麼

建立 `feat/v8-drizzle-neon -> main` 的 PR，並在合併前同時滿足：

1. 技術 Reviewer 同意
2. PM/PO 確認可上線

### 怎麼做

在 PR 描述中要求固定欄位：

```md
## 變更摘要

-

## 風險與影響面

-

## 驗證證據

- build:
- API 測試:

## 上線前確認

- [ ] Reviewer approve
- [ ] PM/PO approve
```

---

## 4. 合併前先完成 Render 設定

### 為什麼

因為 Render 會在 `main` 有新 commit 時自動部署，所以 V8 不能先 merge 再回頭補設定。比較穩的做法是先把 Render 的 Build Command 與環境變數準備好，再讓 `main` 觸發這次部署。

### 要做什麼

這一段先做兩件事：

1. 若 `main` 目前仍代表 V7，先保留 `v7-baseline` branch 與 `v7.0.0` tag
2. 先到 Render 把 V8 需要的設定改好，但先不要讓錯誤版本提早部署

補充提醒：

- 若目前 `main` 上其實還是 V7，而 V8 尚未 merge 回來
- 建議先替目前 `main` 留下 `v7-baseline` branch 與 `v7.0.0` tag
- 這樣之後即使 `main` 前進到 V8，也還能清楚回到 V7 基準

### 怎麼做

若現在的 `main` 仍是 V7，進入 V8 前可先做：

```bash
git switch main
git pull origin main
git branch v7-baseline
git tag -a v7.0.0 -m "V7 baseline before V8"
git push origin v7-baseline
git push origin v7.0.0
```

補充提醒：

- 若 Render 的環境變數畫面有 `Save only`，先用 `Save only`
- 若沒有 `Save only`，就先把所有設定一次改完，再進行 merge
- `Auto-Deploy Off` 不建議當成課堂標準步驟，避免學生後續忘記切回 `On Commit` 導致 main 更新卻沒有自動部署；這只適合當成進階保守作法或故障排除手段

---

## 5. Render 部署調整、合併主線與打版本標籤（從 V7 升級到 V8）

### 為什麼

V7 已做過第一次完整部署，因此這一段不再重講 Render 基本操作，而是明確指出「V8 相對 V7 多了哪些調整」。這樣學生比較能養成版本升級時逐項檢查部署差異的習慣。

### 要做什麼

先對照 V7，再依序完成 V8 的變更：

1. 保留 V7 已有的 Render Web Service
2. 更新 Build Command
3. 補上 `STORE_DRIVER=postgres`、`DATABASE_URL`、`DATABASE_URL_MIGRATION` 等 V8 環境變數
4. 設定完成後，再把 `feat/v8-drizzle-neon` merge 回 `main`
5. 由 `main` 觸發部署並驗證健康檢查、核心 API 與 migration
6. 部署成功後，再打 `v8.0.0` tag

### 怎麼做

---

#### 步驟 1：先用 V7 當對照基準

先提醒學生，V7 時已經完成的是：

| 項目          | V7 設定                         |
| ------------- | ------------------------------- |
| Environment   | **Node**                        |
| Branch        | `main`                          |
| Build Command | `bun install && bun run build`  |
| Start Command | `bun run start`                 |

V8 的任務不是重來一次，而是看清楚哪裡和 V7 不同。

補充提醒：

- 在 Render 的 Web Service 畫面裡，`Environment` 可能只有 `Node`
- 這不影響本專案使用 `bun`
- 實務上可直接選 `Node`，並維持 `bun install`、`bun run ...` 這組指令

---

#### 步驟 2：更新服務設定

| 欄位          | V7                             | V8                                                   |
| ------------- | ------------------------------ | ---------------------------------------------------- |
| Environment   | **Node**                       | **Node**（不變）                                     |
| Branch        | `main`                         | `main`（不變）                                       |
| Build Command | `bun install && bun run build` | `bun install && bun run db:migrate && bun run build` |
| Start Command | `bun run start`                | `bun run start`（不變）                              |

> **V8 為什麼只多了 `db:migrate`？**
>
> - `bun install`：下載依賴
> - `bun run db:migrate`：執行 `drizzle-kit migrate`，把 `drizzle/` 資料夾中的 SQL 套用到 Neon（在程式碼上線前先確保 schema 正確）
> - `bun run build`：同時 build 前端（Vite → `public/`）與後端（Bun bundler → `dist/backend.js`）

---

#### 步驟 3：補上 V8 新增的環境變數

在 **Environment → Add Environment Variable** 逐一加入：

| Key                        | V7 | V8 說明                                                                                           |
| -------------------------- | -- | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | 有 | `production`                                                                                      |
| `API_ALLOWED_ORIGIN`       | 有 | V8 初期可先留空；若前後端分站部署，或進入 auth / OAuth 流程，再填明確前端網址                    |
| `STORE_DRIVER`             | 無 | 設成 `postgres`，讓 runtime 實際使用 `PgStore`，而不是 fallback 回 JSON store                    |
| `DATABASE_URL`             | 無 | Neon 連線 URL，格式：`postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require` |
| `DATABASE_URL_MIGRATION`   | 無 | 建議一併設定；若和 `DATABASE_URL` 相同，可先貼同一個值，便於 `db:check` 與部署排錯               |

> **`DATABASE_URL_MIGRATION` 是什麼？**
>
> 本專案的 `drizzle.config.ts` 設計如下：
>
> ```ts
> const migrationUrl =
>   process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
> ```
>
> 如果 migration 用的連線（通常是 Neon **direct connection**）與 runtime 用的連線（Neon **connection pooler**）不同，就另外設定 `DATABASE_URL_MIGRATION`；若相同，`drizzle-kit migrate` 雖然可直接 fallback 到 `DATABASE_URL`，但教學上仍建議先填同一個值，這樣 `bun run db:check`、課堂排錯與之後切換 direct URL 時都比較一致。
>
> Neon 免費帳號的 Direct Connection 與 Pooler URL 可在 Neon Dashboard → Connection Details 各別複製。

補充提醒：

- 若畫面有 `Save only`，這一步先選 `Save only`
- 目的不是立刻部署，而是先把 V8 所需設定準備好
- 等下面真的 merge 到 `main` 時，再讓 Render 用正確設定自動部署
- 其中 `STORE_DRIVER=postgres` 不能漏，否則 runtime 仍可能 fallback 回 JSON store

---

#### 步驟 4：設定完成後，再 merge 到 `main`

合併策略建議使用 squash merge（教學中最容易對照版本變更）。

```bash
git switch main
git pull origin main
git merge --squash feat/v8-drizzle-neon
git commit -m "feat: merge V8 to main for deployment baseline"
git push origin main
```

當 `main` push 完成後，若 Render 綁定的 branch 是 `main` 且 Auto-Deploy 已開啟，就會自動開始部署。

---

#### 步驟 5：確認部署執行順序並立即驗證

更新設定後重新部署，Render 會依序執行：

```
1. bun install
2. bun run db:migrate    ← 套用 drizzle/ SQL 到 Neon
3. bun run build         ← 產生 dist/backend.js
4. bun run start         ← 啟動 dist/backend.js，監聽 process.env.PORT
```

部署完成後立即驗證：

```bash
# 健康檢查
curl -i https://<your-render-domain>.onrender.com/health
# 預期：{"status":"ok"}

# 核心 API
curl -i https://<your-render-domain>.onrender.com/api/menu
```

若課堂已有資料庫相關 API，也建議再補一個與資料庫有關的驗證，避免只驗到靜態頁面與既有讀取路徑。

---

#### 步驟 6：部署成功後再打 `v8.0.0` tag

```bash
git switch main
git pull origin main
git tag -a v8.0.0 -m "V8 baseline before V9"
git push origin v8.0.0
```

這樣 `v8.0.0` 才會明確代表「已成功部署並驗證過的 V8 基準」。

---

#### 常見問題排查

| 症狀                           | 可能原因                                                        | 解法                                                                                 |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Build 成功但資料仍寫進 JSON    | 少了 `STORE_DRIVER=postgres`，runtime 仍使用 JSON store         | 在 Render 補上 `STORE_DRIVER=postgres`，重新部署後再驗證                             |
| `DATABASE_URL is not set`      | 環境變數未設定                                                  | 補上 `DATABASE_URL`                                                                  |
| `drizzle-kit migrate` 失敗     | Neon URL 格式錯誤，或 SSL 未啟用                                | 確認 URL 包含 `?sslmode=require`                                                     |
| migration 卡住或連不到資料庫 | `DATABASE_URL_MIGRATION` 貼錯，或 direct / pooled URL 用反      | 優先回到 Neon Dashboard 重新比對兩條 URL                                             |
| Build 成功但啟動失敗         | `PORT` 未由 Render 傳入，或 start 指令未對準正式輸出檔          | 確認仍使用 `bun run start`，且 `backend.ts` 讀取 `process.env.PORT`                  |
| 前端資源 404                 | `public/` 未正確 serve                                          | 確認 `@elysiajs/static` plugin 已掛載，且 build 有產生 `public/`                     |
| 首次請求很慢（~30 秒）       | Free plan 閒置後會 spin down                                    | 預期行為，正式環境需付費計劃                                                         |

補充提醒：

- 若是 V7 時就出現過的前端同步或 `localStorage` 問題，請先回去用 V7 的排查思路判讀
- V8 這一份主要新增的是資料庫與 migration 的排查，不要把舊問題和新問題混成同一類

---

## 6. 為什麼這時候要教 CI/CD（而且只教最小版）

### 為什麼

剛完成「分支 -> 主線 -> 部署」閉環，最適合立刻補上自動化檢查，建立工程習慣。

### 要做什麼

先做最小 CI/CD：

1. PR 觸發：build（可選 lint/test）
2. merge 到 main 後：由 Render 自動部署
3. 部署後：人工驗證健康檢查與核心 API

### 怎麼做

建立 GitHub Actions 檔案 `.github/workflows/ci.yml`：

```yaml
name: ci

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bun run build
```

---

## 7. 課堂時間建議（90 分鐘）

1. 0-15 分：主線治理觀念（為什麼 main 是唯一部署來源）
2. 15-30 分：V8 分支驗證
3. 30-50 分：PR、Reviewer、PM/PO 核可
4. 50-65 分：merge 回 main + tag
5. 65-80 分：V8 部署調整與雲端驗證
6. 80-90 分：建立最小 CI 並回顧

---

## 8. 教學重點句（可直接口頭使用）

1. 功能完成不等於可上線，合併治理才是上線起點。
2. 正式環境只看 main，feature branch 不直接進 production。
3. 合併前要有兩種確認：技術可行與業務可上線。
4. V7 先學完整部署，V8 起就只補部署差異。

---

## 9. 下一步銜接

完成本手冊後，再進入 V9：`Better Auth + Google provider`。到時也建議延續同一節奏，在 V9 完成後再補一次 auth 版的部署調整。

---

## 10. 課堂配套附件（建議同時使用）

### 為什麼

若只有流程手冊，仍可能不知道「PR 要寫到什麼程度」與「助教如何評分」。

### 要做什麼

搭配以下兩份附件一起執行：

1. `03_3_GitHub_PR_模板與審查清單.md`
2. `03_4_V8_合併與部署_課堂評分Rubric.md`

### 怎麼做

1. 發 PR 時，直接套用 PR 模板欄位
2. Demo 與驗收時，依 Rubric 五大面向提交證據
3. 小組回饋時，以 Rubric 的扣分點做下一輪改進清單
