# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

只有一位使用者：部署這份系統的本人。這個人同時管理多個教會相關的軟體專案，也在主日服事。

- **LINE 端**：隨手把待辦、提醒、筆記、專案進度傳給小秘書，不必先分類。
- **Dashboard**：整理 AI 分類好的記錄，可以補時間、改類型、標完成、刪除。
- **服事表**：查看、編輯自己教會的主日服事排班，也查詢自己近期的服事。

手機和電腦一樣重要：手機上常是從 LINE 點連結進來快速確認；電腦上則是坐下來一次整理一批。

`line-secretary-` 是這個專案的 fork，會給另一位使用者部署一份。那位使用者的角色和本人相同（一人自用），只是專案清單、服事職位和名字不同。

**受眾例外（使用者決定，2026-10-01）**：EmmArk 全域規範要求寫入「使用者含長輩與非技術同工」，但這個專案的兩個頁面都只有部署者本人使用，fork 的使用者也不是長輩或非技術者，所以**不套用**那段受眾描述。

## Product Purpose

讓一個人用最低成本把腦中的事交出去：在 LINE 打一句話，AI 判斷是待辦、提醒、筆記還是專案更新，並抽出專案和時間。到時間會在 LINE 推播提醒，每週五推播一份週報。Dashboard 和服事表是補足 LINE 對話框做不到的事：一覽全部、批次整理、看排班格。

成功的樣子：記錄的動作夠輕，願意一直丟；整理的動作夠快，不會累積成負擔。

## Positioning

入口是 LINE，不是另一個要記得打開的 App。分類交給 AI，使用者不用選欄位。服事表和個人待辦放在同一個系統裡，因為使用者的生活就是這兩件事交錯。

## Operating Context

- **LINE 指令**：一般文字會被分類存檔；另有查今天、查本週、查服事表等指令（`lib/commands.js`）。
- **排程**：每天 08:00（台北）檢查到期提醒並推播；每週五 08:00 推播週報，包含 GitHub 本週活動（`vercel.json`、`api/cron/`）。
- **Dashboard 登入**：輸入環境變數中的 `DASHBOARD_TOKEN` 當密碼；服事表可從網址帶 token 直接進入。
- **已知專案**：Cell Reporter、天父日記、教會入口、資料交換中心、整合型行政系統、PitchPal、小秘書系統（寫在 `lib/classifier.js` 的 prompt 裡）。
- **服事職位**：信息、領會、助唱、鍵盤、吉他、貝斯、鼓、音控、PPT、導播後製、攝影、兒主、招待、服務台等，可在服事表的管理頁增刪。

## Capabilities and Constraints

- **技術棧**：Vercel serverless functions（Node.js）＋ Supabase ＋ LINE Messaging API ＋ Anthropic API。前端是 `public/` 下的靜態 HTML，原生 JS，沒有框架、沒有建置步驟。
- **前端只有兩頁**：`public/index.html`（Dashboard：記錄的列表、篩選、新增、編輯、完成、刪除）和 `public/worship.html`（服事表：格狀表、人員查詢、管理日期與職位）。
- **時區**：一律 Asia/Taipei。
- **語言**：介面與回覆都是繁體中文。
- **改版時不能動的東西**：表單欄位、JS 依賴的 id、API 路徑與參數。
- **教學步驟（EmmArk Rule 15）**：目前兩頁都沒有 `data-tour`，也沒有「？ 教學」按鈕。改版時是否補上，待決定。
- **資料備份（EmmArk Rule 14）**：目前沒有一鍵匯出、離線閱讀器和交接 README。待決定。
- **fork 同步**：`line-secretary-` 會跟著這個 repo 更新，所以個人化內容（專案清單、名字、職位）要盡量放在環境變數或資料庫，不寫死在介面裡。

## Brand Commitments

- 產品名稱：**EmmArk 小秘書**。
- 小秘書的語氣：「有溫度的個人助理」，自然、簡短，不用「好的」「當然」這類套話開頭（見 `lib/classifier.js`）。介面文字應延續這個語氣。

## Evidence on Hand

- LINE Rich Menu 圖：`richmenu_2500x843.png`、`richmenu_v2_2500x843.png`。
- 改版前的視覺基準：`DESIGN.md`。
- 沒有使用者回饋、使用數據或截圖紀錄，不得杜撰。

## Product Principles

1. **記錄要輕，整理要快。** 任何會讓「丟一句話」或「整理一批」變慢的設計都是退步。
2. **一眼看到該做的事。** 未完成、快到期、今天的服事，優先於其他資訊。
3. **兩種情境都要順手。** 手機上要能單手確認、勾完成；電腦上要能一次處理大量記錄。
4. **fork 友善。** 個人化資料不寫死在介面裡，同一份程式碼換一個人部署也能直接用。

## Accessibility & Inclusion

這是使用者明確決定的例外：不套用長輩受眾描述（見 Users）。以下兩條是 EmmArk 規範中的技術約束，仍然保留：

- 所有動畫都要提供 `prefers-reduced-motion: reduce` 的降級版本。
- 動畫不能成為操作的必經路徑：播放期間元素必須已經可以點擊，不得用遮罩或 `pointer-events: none` 擋住互動。
