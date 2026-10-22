# EmmArk 小秘書（emmask-secret）

個人 LINE Bot 助理。在 LINE 上隨手講一句話，Claude 自動分類成待辦／提醒／筆記／
專案更新存進資料庫，並定時推播提醒與週報。

**這個專案是 12 個專案的「管理層」——它是唯一一個橫跨所有其他專案的工具。**
別的專案壞了是那個專案的事；這個壞了，你會失去對全部專案的追蹤。

## 技術架構

- **Runtime**：Node.js（CommonJS，`require` 不是 `import`）
- **平台**：Vercel Serverless Functions（`api/` 底下每個檔案是一個 endpoint）
- **資料庫**：Supabase（用 **service key**，繞過 RLS）
- **AI**：Anthropic Claude（`lib/classifier.js`）
- **通訊**：LINE Messaging API（`@line/bot-sdk`）

## 專案結構

```
api/
  webhook.js          # LINE Webhook 進入點（所有對話從這裡進來）
  cron/remind.js      # 每天推播到期提醒
  cron/weekly.js      # 每週五推播週報
  worship/schedule.js # 服事表查詢
  worship/config.js   # 服事表設定
  dashboard/notes.js  # 給外部 dashboard 用的 REST API（token 驗證）
  setup/richmenu.js   # 一次性：建立 LINE 圖文選單
lib/
  classifier.js       # ★ Claude 分類 + 生成回覆（含已知專案清單）
  commands.js         # 指令路由與各指令實作
  worship.js          # 服事表邏輯
  github.js           # GitHub 活動查詢
  line.js             # LINE 回覆/推播封裝
  supabase.js         # Supabase client
vercel.json           # cron 排程設定
```

## 排程（`vercel.json`）

| 路徑 | cron（UTC） | 台北時間 | 做什麼 |
|------|------------|---------|--------|
| `/api/cron/remind` | `0 0 * * *` | 每天 08:00 | 掃 `due_date` 已到且未提醒未完成的項目，逐則推播 |
| `/api/cron/weekly` | `0 0 * * 5` | **每週五 08:00** | 推播週報 |

⚠️ **cron 寫的是 UTC，不是台北時間。** `0 0 * * 5` 是 UTC 週五 00:00 = 台北週五 08:00。
要改時間記得換算（台北 = UTC+8，往前推 8 小時；跨過午夜的話星期幾也要跟著改）。

## 週報內容（`api/cron/weekly.js`）

1. 本週完成幾件、待辦積壓幾件
2. **⚠️ 停滯超過 7 天的專案**（有過 `project_update` 但近 7 天沒有新的）
3. 各專案本週更新（每個專案最多列 3 條）
4. GitHub 本週動態（近 7 天有 push 的 repo，最多 12 個，各列 commit 數與最新訊息）

## 底線原則

### 1. 已知專案清單必須跟實際專案同步

`lib/classifier.js` 的 SYSTEM_PROMPT 裡有一份**已知專案列表 + 別名對照**。
分類器靠它把「美食獵人加了分享卡」對應到 `project = '美食獵人'`。

**清單漏掉某個專案 → 那個專案的更新 `project` 會是空的 → 不會進週報的各專案摘要，
也不會被「停滯超過 7 天」偵測到。** 這是靜默失效，不會有任何錯誤訊息。

⚠️ **新開一個專案時，第一件事就是回來這裡加一行。**
（2026-07 曾經漏掉 5 個專案沒加，週報等於半盲。）

### 2. `project` 判斷不出來就留空，不要硬猜

prompt 裡明確要求這件事。硬猜會讓週報的專案歸屬失真，比留空更糟——
留空至少你看得出來「這條沒歸到專案」，猜錯則會安靜地記到別的專案底下。

### 3. 有時間詞的句子絕對不是 note

prompt 裡的硬規則：只要出現時間詞（今天、明天、下週、幾月幾號、早上、晚上……），
一律分類為 `task` 或 `reminder` 並填 `due_date`。分成 `note` 就永遠不會被提醒到。

### 4. service key 不能外流

`lib/supabase.js` 用的是 `SUPABASE_SERVICE_KEY`，**繞過所有 RLS**。
這是 serverless 後端，沒有前端會拿到它，所以可以這樣用。
但因此：**任何新增的 `api/` endpoint 都必須自己做驗證**，
不要假設「反正沒人知道網址」。參考 `api/dashboard/notes.js` 的 `authCheck()`（`DASHBOARD_TOKEN`）。

`api/cron/*` 目前沒有額外驗證，靠的是 Vercel cron 的呼叫。
若要對外暴露更多 endpoint，先想清楚驗證怎麼做。

## 技術眉角

### CommonJS，不是 ESM
全部用 `require` / `module.exports`。`package.json` 沒有 `"type": "module"`，
不要混用 `import`。

### 時區處理
台北時間一律用 `toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })`。
`api/cron/weekly.js` 裡的 `new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))`
是為了算出「台北的今天是星期幾」，動這段之前先確認你知道它在做什麼。

### GitHub 查詢是全帳號範圍
`lib/github.js` 的 `getWeeklyActivity()` 打 `/user/repos?per_page=100&type=all`，
撈的是**整個帳號**近期有 push 的 repo（取前 12 個），不是寫死的清單。
所以新開 repo 會自動出現在週報，不需要另外設定——
**但這也表示 12 個以上的活躍 repo 會被截斷**，repo 再變多時要處理這個上限。

### 沒有測試
這個專案沒有測試套件。改 `classifier.js` 的 prompt 後，最快的驗證方式是
`vercel dev` 起本地環境，或直接在 LINE 上實測幾句話看分類對不對。

## 環境變數

```
ANTHROPIC_API_KEY=              # Claude 分類器
LINE_CHANNEL_ACCESS_TOKEN=      # LINE 回覆與推播
LINE_USER_ID=                   # 推播對象（個人助理，只推給你自己）
SUPABASE_URL=
SUPABASE_SERVICE_KEY=           # ★ service key，繞過 RLS
GITHUB_TOKEN=                   # 週報的 GitHub 動態（沒設就跳過這段）
DASHBOARD_TOKEN=                # /api/dashboard/notes 的存取 token
```

## 本地開發

```bash
npm install
npm run dev        # vercel dev
```

## LINE 指令

| 輸入 | 功能 |
|------|------|
| `今天` | 今日待辦與提醒 |
| `本週` | 本週項目 |
| `筆記` | 最近的筆記 |
| `專案` | 各專案更新摘要 |
| `完成 <關鍵字>` | 標記完成 |
| `刪除 <關鍵字>` | 刪除項目 |
| `服事表` / `我的服事` | 查服事表 |
| `7/5` 之類的日期 | 查該日服事表 |
| 其他任何句子 | 交給 Claude 分類並存檔 |

## 資料表（Supabase）

| 表 | 重點欄位 |
|----|---------|
| `notes` | `type`(task/reminder/note/project_update)、`content`、`project`、`due_date`、`is_done`、`is_reminded` |
| `worship_schedule` | `service_date`、`role`、人員 |

## 跟其他專案的關係

這個專案**不共用任何其他專案的程式碼**，它們的關係是「管理者 vs 被管理者」：
其他 11 個專案的進度靠你在 LINE 上口述 + GitHub 活動自動抓，匯總進週報。

12 個專案的完整清冊放在 **CLAUDE-DESIGN** repo 的 `PROJECTS.md`。
那份清冊跟這裡的已知專案清單要保持一致。
