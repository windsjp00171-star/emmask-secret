---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: ["public/worship.html"]
---

# Surface brief: Dashboard + 服事表

Scope: `public/index.html`（Dashboard）與 `public/worship.html`（服事表），共用同一個視覺世界。Mode: Operate。

## Task
- Dashboard：打開就看今天與快到期的事，一鍵勾完成；其次是新增、改類型或時間、刪除。
- 服事表：格狀排班（日期 × 職位）與人員查詢一樣常用；管理頁增刪日期與職位。
- 手機與電腦並重。

## Constraints
- 不可讓資訊密度變低、操作步驟變多、像行銷頁、或跟 LINE 小秘書的感覺脫節（使用者明說）。
- API 路徑與參數不變；token 登入流程不變。
- reduced-motion 降級；動畫不擋操作。
- 不使用 LINE 的商標或 logo；借用的是介面語法，不是品牌。

## Direction contract
THESIS: 網頁就是 LINE 小秘書那個聊天室的「另一面」——用 LINE 聊天列表的密集列語法排出所有記錄，而不是後台儀表板。拒絕：統計卡片＋表格的 admin 版型。

OWN-WORLD: 白底、LINE 綠 (#06C755) 只給行動與完成；未讀紅點紅給過期數。每筆記錄是聊天列表的一列：左邊 40px 圓形類型頭像（線條圖示），中間粗體內容＋灰色一行副標（專案・時間），右邊時間與一顆圓形勾選。日期分隔用置中的灰色膠囊（今天／明天／過期）。頂欄是 LINE 式白色標題列＋底線分頁。新增是底部固定的聊天輸入列。服事表人員是頭像縮寫＋名字的膠囊。系統字體、時間一律 tabular-nums。

STORY: 打開就看到「過期」紅色計數和今天的列；勾一下，那列變成灰色「已完成」並沉到群組底部，就像訊息被讀過。想記新的事，直接在底部輸入列打字送出。

FIRST VIEWPORT: 手機：頂欄（標題、服事表入口、重新整理時間）→ 分頁「待辦｜筆記｜全部」帶數字 → 專案膠囊橫向捲動 → 「過期」分隔膠囊與其列、「今天」分隔膠囊與其列，每列右側勾選圓圈 44px 觸控區 → 底部固定輸入列（文字框＋類型／時間小按鈕＋綠色送出）。電腦：同一列表置中 760px，右側不加側欄；一個視窗至少 10 列。

FORM: LINE 對話原生（IMPECCABLE’S PICK，我的排序第 1 名），seed key 53615646。Signature interaction：勾選完成時圓圈填綠、列在 160ms 內淡成灰並標「已完成」，像訊息變已讀；reduced-motion 時直接切換。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Revisions
- 2026-10-30（使用者回饋）：待辦頁「像迷宮、條列式認知負載過大、資訊過多」，使用者原本想要的是**卡片式**。這跟上面「LINE 聊天列表語法」「不可讓資訊密度變低」有衝突，依較新的決定處理：待辦預設改成**卡片總覽**（跟 LINE 小秘書的海報卡同一個語法），資訊一樣都在，但預設不全部攤開（漸進揭露）。
  - 一個時段一張卡：過期（紅框）、今天、明天、這七天；每張最多 3 筆，點「看全部／還有 N 筆」展開那一區的完整列表，「回總覽」回來。
  - 之後、重複提醒、未排時間收成一排小按鈕；重複提醒（下次不在今明兩天）不跟一次性的事混在一起。
  - 列表檢視保留（搜尋列旁的切換，記在裝置上）；搜尋、專案篩選、改篩選、批次選取時自動用列表。
  - 「全選」只選畫面上看得到的列。
  - 不變：綠色只給行動與完成、勾選圓圈、reduced-motion、`data-tour`。
- 2026-10-30（使用者回饋）：筆記沒有獨立的頁面，要查得從列表一個個翻。新增「筆記」分頁（卡片牆、搜尋、專案按鈕、新增）。筆記＝沒有提醒、待辦、日期的記錄（類型「筆記」＋「專案更新」），已有自己分頁的專案（收藏、詩歌、順序、會議記錄、相簿、週報）不放進來。待辦頁只留「該做的事」「已完成」。暫不做：釘選、後台問筆記、歸檔（使用者目前不需要）。

## Unresolved
- 無。
