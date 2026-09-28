# 🤖 讓 AI 帶你部署

不想自己讀完 README？把這份 repo 交給 AI 助理（ChatGPT、Claude、Gemini 都可以），貼上下面的提示詞，它會一步一步帶你完成。

- **一般聊天型 AI**（網頁版 ChatGPT / Claude）：AI 會告訴你每一步去哪個網站、按哪裡，你照做、把畫面或錯誤訊息貼回去給它看。
- **會執行指令的 AI**（例如 Claude Code、Codex）：除了帶你操作網站，還能直接幫你跑 Vercel CLI 部署、設定環境變數。

> 申請帳號、登入各個網站、按「建立」這些事，一定要你本人做。AI 不會、也不應該拿到你的密碼。

---

## 複製這段貼給 AI

```
我想部署一個開源的 LINE 聊天機器人「EmmArk 小秘書」，給我自己一個人用。
程式碼在：https://github.com/windsjp00171-star/emmask-secret
請先讀 repo 裡的 AI_SETUP.md（下半部「給 AI 的部署規格」）和 README.md，再開始帶我。

我不會寫程式，請：
1. 一次只給我一個步驟，等我說「好了」再給下一步。
2. 每一步告訴我：要打開哪個網址、按哪個按鈕、要複製什麼。
3. 拿到的金鑰請提醒我先存在記事本，不要貼在公開的地方。
4. 我卡住時，我會貼截圖或錯誤訊息給你。
5. 部署完成後，用 /setup.html 設定精靈確認每一項都是綠色。
```

---

## 給 AI 的部署規格

> 以下是寫給 AI 助理看的精簡規格。人類讀者請看 [README.md](README.md)。

### 架構

- Vercel Serverless（Node.js）：`api/*.js` 是函式，`public/` 是靜態頁面
- Supabase（Postgres + Storage）：資料
- Google Gemini API：AI 分類、圖片辨識、讀 PDF
- LINE Messaging API：聊天介面
- cron-job.org：每 5 分鐘呼叫提醒端點（Vercel Hobby 方案的 cron 一天只能一次）

### 使用者要申請的 4 個服務（都免費，必須本人操作）

| 服務 | 產出 | 詳細步驟 |
|---|---|---|
| LINE 官方帳號 + Messaging API | `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN` | README 第 2 節 |
| Supabase 專案 | `SUPABASE_URL`、`SUPABASE_SERVICE_KEY`（必須是 service_role） | README 第 3 節 |
| Google AI Studio | `GEMINI_API_KEY` | README 第 4 節 |
| Vercel（用 GitHub 登入） | 部署網址 `https://<project>.vercel.app` | README 第 5 節 |

另外由使用者自己取：`DASHBOARD_TOKEN`（後台密碼）、`CRON_SECRET`（建議，亂碼即可）。

### 部署順序

1. **LINE**：建立官方帳號 → 啟用 Messaging API → 回應設定：關閉「自動回應訊息」、開啟「Webhook」→ 到 LINE Developers 拿 Channel secret，並 Issue 一組 long-lived Channel access token。
2. **Supabase**：建立專案（Region 選 Tokyo 或 Singapore）→ 在 SQL Editor 執行 `supabase/schema.sql`（可重複執行）→ 從 Project Settings 拿 Project URL 和 service_role key。
3. **Gemini**：到 https://aistudio.google.com/apikey 建立 API key。
4. **部署**：
   - 圖形介面：用 README 第 5 節的 Deploy 按鈕，或 fork 後在 Vercel 匯入，並填入 6 個環境變數。
   - CLI（會執行指令的 AI 適用）：
     ```bash
     npm i -g vercel
     vercel login                 # 使用者本人完成登入
     vercel link                  # 建立或連結專案
     for k in LINE_CHANNEL_SECRET LINE_CHANNEL_ACCESS_TOKEN SUPABASE_URL SUPABASE_SERVICE_KEY GEMINI_API_KEY DASHBOARD_TOKEN CRON_SECRET; do
       vercel env add $k production   # 逐一請使用者貼上值
     done
     vercel --prod
     ```
5. **設定精靈**：打開 `https://<部署網址>/setup.html`，輸入 `DASHBOARD_TOKEN`，依序處理：
   - Webhook：按「一鍵設定 Webhook」（會自動填入 `<部署網址>/api/webhook` 並測試）
   - 資料庫：如果還沒建表，按「複製建表 SQL」→ 到 SQL Editor 執行
   - 圖文選單：按「建立圖文選單」
6. **設定主人**：使用者加 bot 好友、傳任何一句話 → bot 回覆以 `U` 開頭的 userId（設定精靈第 5 張卡也會顯示）→ 設定環境變數 `LINE_USER_ID`（CLI：`vercel env add LINE_USER_ID production`）→ 重新部署（Vercel 後台 Redeploy，或 `vercel --prod`）。
7. **提醒排程**：在 cron-job.org 建立排程，URL 用設定精靈第 8 張卡顯示的網址（`<部署網址>/api/cron/remind?token=<CRON_SECRET>`），頻率 Every 5 minutes。
8. **驗收**：設定精靈 8/8 綠色。在 LINE 傳「明天早上九點開會」，應該回覆已建立提醒。

### 驗證方式

- `GET /api/setup/status`（header `x-dashboard-token: <DASHBOARD_TOKEN>`）會回傳每一項檢查的 JSON，可以直接判斷哪一步沒完成。
- 本機測試：`npm ci && npm test`（不需要任何金鑰）。

### 常見錯誤對照

| 症狀 | 原因 | 處理 |
|---|---|---|
| 傳訊息完全沒反應 | 沒設 Webhook 或 Use webhook 沒開 | 設定精靈按「一鍵設定 Webhook」；LINE Developers → Messaging API → 打開 Use webhook |
| 收到罐頭回覆 | 自動回應訊息沒關 | LINE Official Account Manager → 回應設定 → 關閉自動回應訊息 |
| 設定精靈「資料庫」紅色 | 還沒執行 schema.sql | 在 SQL Editor 執行 `supabase/schema.sql` |
| 圖片存檔失敗 | `SUPABASE_SERVICE_KEY` 填成 anon key | 換成 service_role key 後 Redeploy |
| 改了環境變數沒生效 | 沒有重新部署 | Vercel → Deployments → Redeploy |
| bot 不理我，但會回 userId | 還沒設 `LINE_USER_ID` | 見步驟 6 |
| 提醒沒有準時 | cron-job.org 沒設或網址錯 | 設定精靈第 8 張卡會顯示最後一次執行時間 |

### 請不要

- 不要要求使用者把金鑰貼到公開的地方（GitHub issue、公開聊天室）。
- 不要把金鑰寫進程式碼或 commit，一律放在 Vercel 環境變數。
- 不要修改 `supabase/schema.sql` 以外的資料表結構，程式碼會依賴目前的欄位。
