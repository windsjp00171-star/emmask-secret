---
name: 小秘書 Dashboard
description: LINE 小秘書聊天室的另一面：用聊天列表的密集列語法整理待辦、筆記與服事排班。
colors:
  green: "#06c755"
  green-btn: "#06893d"
  green-press: "#057433"
  green-ink: "#04833a"
  green-tint: "#e2f6e9"
  red: "#c81e33"
  red-tint: "#fbe4e7"
  ink: "#111111"
  ink-2: "#5f6469"
  ink-3: "#62676c"
  line: "#dcdfe3"
  fill: "#e2e5e8"
  bg: "#f0f2f4"
  surface: "#f9fafb"
  fill-hover: "#d8dbdf"
  row-hover: "#e8eaed"
  next-wash: "#e6e8eb"
  check-ring: "#858a8f"
  disabled: "#c9ccd0"
  t-reminder: "#c25e00"
  t-reminder-bg: "#fff3e0"
  t-note: "#3f67a8"
  t-note-bg: "#eaf0fa"
  t-project: "#6b46c1"
  t-project-bg: "#f1ecfb"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "21px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "17px"
    fontWeight: 700
  row-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  sub:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 600
    fontFeature: "\"tnum\" 1"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  sheet: "16px"
  pill: "9999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.green-btn}"
    textColor: "{colors.bg}"
    rounded: "{rounded.lg}"
    padding: "0 18px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.green-press}"
  button-ghost:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 18px"
    height: "46px"
  button-danger:
    backgroundColor: "{colors.red-tint}"
    textColor: "{colors.red}"
    rounded: "{rounded.lg}"
    padding: "0 18px"
    height: "46px"
  send-button:
    backgroundColor: "{colors.green-btn}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
    size: "40px"
  chip:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
  date-separator:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  date-separator-overdue:
    backgroundColor: "{colors.red-tint}"
    textColor: "{colors.red}"
  composer-input:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  field-input:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  person-pill:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 10px 0 3px"
    height: "30px"
  badge-overdue:
    backgroundColor: "{colors.red}"
    textColor: "{colors.bg}"
    rounded: "{rounded.pill}"
    height: "18px"
---

# Design System: 小秘書 Dashboard

## Overview

**Creative North Star: "LINE 對話原生"**

網頁不是另一個後台，而是 LINE 小秘書那個聊天室的「另一面」。每一筆記錄都排成 LINE 聊天列表的一列：左邊 40px 圓形類型頭像，中間粗體內容加一行灰色副標，右邊時間與一顆圓形勾選。日期用置中的灰色膠囊分隔（過期／今天／明天），頂欄是白色標題列加底線分頁，新增是固定在底部的聊天輸入列。使用者從 LINE 點連結進來，應該覺得還在同一個地方。

密度是這個世界的核心：白底、細分隔線、沒有卡片、沒有統計方塊、沒有表格式後台版型。內容欄置中 760px，電腦上兩側只有一條細線，不加側欄；一個視窗至少容得下 10 列。顏色極少，LINE 綠只出現在「做事」與「做完」的那一刻，紅色只屬於過期。

動作語法借自「訊息已讀」：勾一下，圓圈填綠、列淡成灰並標「已完成」，接著沉進底部折疊的已完成群組。借用的是 LINE 的介面語法，不是 LINE 的商標或 logo。

**Key Characteristics:**
- 聊天列表列語法：圓形頭像＋粗體標題＋灰副標＋右側時間與勾選。
- 白底、1px 淺灰分隔線、平面；只有底部 sheet 帶陰影。
- 綠色只給行動與完成，紅色只給過期，「下一次」用墨色標示。
- 系統字體，時間與數字一律 tabular-nums。
- 線條 SVG 圖示（1.75 stroke），不用 emoji。
- 唯一的招牌互動是勾選完成；所有動畫在 reduced-motion 下關閉。

## Colors

白紙加墨色的聊天介面，一抹 LINE 綠負責行動，一抹警示紅負責過期，其餘交給灰階。

### Primary
- **LINE 亮綠 (green)**：品牌亮綠，用在 focus ring、輸入框聚焦時的邊框、勾選圓圈的 hover 邊框。對白字對比不足，所以不當實心按鈕底色。
- **行動綠 (green-btn)**：實心行動元素的底色：主要按鈕、圓形送出鍵、完成後的勾選圓圈。為了白字對比而比品牌綠深。
- **按下綠 (green-press)**：行動綠的 hover／按下狀態。
- **完成綠字 (green-ink)**：綠色文字：列右側的「已完成」標記、輸入列被切換開啟的圖示鍵、排班格「＋」的 hover。
- **淡綠底 (green-tint)**：文字選取底色、輸入列已開啟圖示鍵的底。

### Secondary
- **過期紅 (red)**：只用於過期：分頁上的未讀式紅點計數、副標中逾期的時間、錯誤訊息、刪除的 hover。
- **過期淡紅 (red-tint)**：「過期」分隔膠囊的底、危險按鈕的底。

### Tertiary
- **類型色 (t-reminder / t-note / t-project 及其 -bg)**：只用在類型頭像的線條圖示與淡底：提醒是琥珀、筆記是藍、專案更新是紫。待辦頭像刻意用中性灰底深灰圖示，不用綠。服事表人員縮寫頭像另用一組五色淡底輪替（藍、琥珀、紫、紅、青），由名字決定，僅作辨識。

### Neutral
- **墨色 (ink)**：主文字、選中分頁的底線、選中膠囊與分段按鈕的實心底、「下一次」服事日的標記。
- **次灰 (ink-2)**：副標、分隔膠囊文字、欄位標籤、空狀態說明。
- **淡灰字 (ink-3)**：時間、計數、未選分頁、placeholder。值與 ink-2 幾乎相同，是為了對比而收斂的結果；兩者的層級靠字重與字級區分，不靠色差。
- **分隔線 (line)**：所有 1px 分隔線與輸入框邊框。
- **填色灰 (fill)**：膠囊、搜尋框、輸入框、ghost 按鈕、圖示鍵 hover 的底。
- **白底 (bg)**：內容欄與 sheet 的底；電腦寬螢幕的外圍是 fill 灰。
- **列 hover (row-hover)**、**下一次底 (next-wash)**、**勾選環 (check-ring)**、**停用灰 (disabled)**：列 hover、服事表下一次那一欄的淡底、未勾選圓圈的 2px 邊、送出鍵停用。

### 底色與深色模式
- **淡灰底**（#f0f2f4）：頁面與標題列的底色，不用純白，避免長時間看螢幕刺眼。面板、輸入框聚焦時用略亮的 surface（#f9fafb）。
- **深色模式**：跟著系統設定（`prefers-color-scheme: dark`）自動切換，所有顏色都是 `public/app.css` 的變數，深色值寫在同一檔的 media 區塊。底 #16181b、面板 #1f2226、文字 #e9ebee；綠色按鈕維持 #06893d 白字。
- **面板**（`.panel`）：列表、日曆、清單、服事表格線一律放進 surface 色、1px 邊框、16px 圓角的面板，讓內容從淡灰底上浮出來。列之間的分隔線從頭像右側開始（LINE 列表的做法）。
- 新增元件一律用變數（`--bg`、`--surface`、`--fill`、`--ink`、`--on-ink`…），不要寫死色碼，否則深色模式會破。

### Named Rules
**The 綠色只給行動 Rule.** LINE 綠只出現在行動（送出、主要按鈕、聚焦）與完成（勾選填綠、「已完成」字）。「下一次／即將」一律用墨色標示，不准用綠；狀態、類型、裝飾都不准用綠。

**The 紅色只給過期 Rule.** 紅色只表示過期或破壞性動作的警示。不要用紅色做強調或裝飾。

## Typography

**Body Font:** 系統字體堆疊（-apple-system, BlinkMacSystemFont, PingFang TC, Noto Sans TC, Microsoft JhengHei, Segoe UI, sans-serif）

**Character:** 和 LINE 本身一樣用作業系統原生字體，讓網頁讀起來像 App 的延伸。層級靠字重（700／600／400）和小幅字級差撐起，不靠展示字體。

### Hierarchy
- **Title**（700，21px，letter-spacing -0.01em）：頂欄頁面標題。下方 12px ink-3 一行說明（未完成數、更新時間）。
- **Headline**（700，17px）：sheet 標題、服事表格欄頭的日期數字。
- **Row Title**（600，15px，line-height 1.35）：列表每一列的內容，最多兩行截斷；完成後降為 400、ink-3。
- **Body**（400，15px，line-height 1.45）：基礎內文、輸入框文字、分頁（分頁用 600）。
- **Sub**（400，13px）：列副標（專案・時間），單行省略；欄位標籤用 13px 600。
- **Label**（600，12px）：分隔膠囊、計數、星期、紅點徽章（11px 700）。

### Named Rules
**The 表格數字 Rule.** 所有時間、日期、計數都套 tabular-nums，讓整欄數字對齊不跳動。

## Layout

單欄聊天列表。內容欄最大 760px 置中，白底、最小高 100vh；800px 以上兩側加 1px 分隔線，外圍是 fill 灰。頂欄 sticky：標題列（左右 16px）→ 底線分頁（44px 高）→ 可橫向捲動的專案膠囊列；800px 以上搜尋框移到標題列右側（300px）。

列的節奏：左內距 16px、上下 6px、元素間距 12px；頭像 40px、勾選觸控區 40px。分隔膠囊上 6px 下 2px，貼著它的群組。Dashboard 主區底部預留 96px 給固定輸入列；輸入列與內容欄同寬（760px）並沿用兩側分隔線，底部加 safe-area。

服事表改用全寬（`.app.wide`）：日期 × 職位的格狀表，職位欄 sticky 在左（88px），日期列 sticky 在上；800px 以上每欄最小 236px，橫向捲動時職位欄出現一道柔和邊陰影提示。管理頁在 900px 以上分成兩欄（日期／職位）。

間距階梯：4、6、8、12、16、20px。

## Elevation & Depth

平面為主。層次靠 1px 分隔線、fill 灰底和 hover 時的極淡底色表達，不用卡片陰影。只有浮在內容之上的元素有陰影：底部 sheet，以及排班格橫捲時 sticky 職位欄的邊緣提示。

### Shadow Vocabulary
- **Sheet（手機）**（`box-shadow: 0 -8px 32px rgba(0,0,0,.12)`）：從底部升起的編輯 sheet。
- **Sheet（640px 以上置中對話框）**（`box-shadow: 0 12px 40px rgba(0,0,0,.18)`）：同一個 sheet 在寬螢幕置中時。
- **Sticky 欄邊緣**（`box-shadow: 6px 0 8px -6px rgba(0,0,0,.22)`）：只在格狀表已橫向捲動時出現。

### Named Rules
**The 沒有卡片 Rule.** 記錄是列，不是卡片。不要把列包進帶陰影或圓角邊框的容器，也不要加統計方塊。

## Shapes

圓是這個世界的主要形狀：頭像、勾選、送出鍵、圖示鍵都是正圓；膠囊（分隔、專案篩選、人員、輸入列文字框、類型選單）是全圓角。矩形元件用柔和圓角：小輸入 8px、欄位與搜尋框與分段按鈕 10px、按鈕 12px、sheet 上緣 16px。服事表的日期頭像是 44px 方形 12px 圓角，與圓形人員頭像區分。邊框一律 1px line 色，沒有粗框。

## Components

### Buttons
- **Shape:** 柔和圓角（12px），高 46px，字重 700。
- **Primary:** 行動綠底白字，在 sheet 動作列中撐滿剩餘寬度。
- **Hover / Focus:** hover 換成按下綠；focus-visible 是 2px 亮綠外框、2px offset。
- **Ghost:** fill 灰底墨色字（取消）。**Danger:** 淡紅底紅字（刪除）。
- **圖示鍵:** 40px 圓形透明，hover 填 fill 灰；被切換開啟時 green-tint 底 green-ink 圖示。

### Chips
- **Style:** 32px 高、全圓角、fill 灰底墨色字 14px，橫向捲動不換行。
- **State:** 選中時反轉為墨色底白字（不是綠）。分段按鈕（sheet 內選類型）同一規則：選中為墨色底。

### Inputs / Fields
- **Style:** fill 灰底、1px line 邊、10px 圓角、15px 字；欄位標籤 13px 600 ink-2 在上。
- **Focus:** 去掉 outline，邊框換亮綠、底換白。
- **Error:** 登入錯誤以紅色 14px 文字顯示於輸入框下方。

### Navigation
- **頂欄:** 白底 sticky，21px 標題＋圖示鍵（服事表入口、重新整理）。
- **分頁:** 等寬底線分頁，44px 高、15px 600；未選 ink-3，選中墨色字並在底部加 2px 墨色短底線（左右各留 20%）。分頁右側帶 12px 計數，有過期時再加紅點徽章。服事表分頁靠左排列、不等寬。

### 記錄列（Signature Component）
左邊 40px 圓形類型頭像（線條圖示 22px、1.75 stroke），中間 15px 600 標題最多兩行＋13px ink-2 副標（專案・時間，逾期時間用紅色 600），右側 12px 時間欄與 40px 勾選觸控區（內圈 24px、2px 灰環）。hover 整列極淡灰底。

**勾選完成（唯一的招牌互動）:** 點圓圈 → 160ms 內圓圈填行動綠、白色勾出現、列標題降為 400 ink-3、頭像去色降到 55% 透明、右側出現綠色「已完成」；約 420ms 後重新排列，該列沉進底部折疊的「已完成 N」群組（以可展開的分隔膠囊呈現）。狀態先在畫面上切換再送 API，動畫不擋輸入。

### 日期分隔膠囊
置中、12px 600 ink-2、fill 灰底全圓角膠囊：「過期 N」用淡紅底紅字，其餘（今天、明天、日期）灰色。已完成群組的分隔膠囊是按鈕，帶旋轉的 chevron。

### 底部輸入列（Composer）
固定在底部、與內容欄同寬、上緣 1px 分隔線。一列排：類型選單（40px 全圓角膠囊）、文字框（40px 全圓角 fill 灰）、時間／專案圖示鍵、40px 圓形行動綠送出鍵（空白時停用灰）。展開後上方多一列時間與專案的小輸入框（36px、8px 圓角）。

### Sheet
從底部升起（220ms，translateY 24px → 0），上緣 16px 圓角、頂部 36×5px 灰色抓把；640px 以上變成置中對話框。背後 40% 黑色遮罩。

### 服事表人員膠囊
30px 高全圓角白底膠囊、1px line 邊：24px 圓形名字縮寫（五色淡底輪替）＋名字。hover 邊框加深。空格的「＋」是 30px 圓形、45% 透明，hover 才完全顯示並轉 green-ink。「下一次」那一欄是 next-wash 淡底、星期以墨色小膠囊反白；過去的欄降到 55% 透明。

### Toast
置中於底部上方 96px，88% 墨色底白字 14px、18px 圓角，2.4 秒消失。

## Do's and Don'ts

### Do:
- **Do** 把每筆記錄排成聊天列表的一列：40px 圓形頭像、粗體標題、灰副標、右側時間與勾選。
- **Do** 實心綠底白字時用 green-btn（#06893d）；亮綠 #06c755 只給 focus ring 與聚焦邊框。
- **Do** 用墨色標示「下一次／即將」與選中狀態（膠囊、分段按鈕、分頁底線）。
- **Do** 所有時間、日期、計數套 tabular-nums。
- **Do** 圖示用線條 SVG：22px、stroke 1.75、round cap／join。
- **Do** 招牌互動維持：勾選 160ms 填綠＋列轉灰，之後沉進折疊的已完成群組；sheet 220ms 升起；`prefers-reduced-motion: reduce` 時關閉全部 animation 與 transition。
- **Do** 讓狀態先在畫面上切換，再等 API；動畫永遠不擋輸入。

### Don't:
- **Don't** 用綠色標示「即將」、類型或裝飾；綠色只屬於行動與完成。
- **Don't** 把紅色 #c81e33 用在過期與破壞性動作以外的地方。
- **Don't** 做統計卡片、數字方塊或 admin 表格版型；不要把列包成卡片。
- **Don't** 使用 emoji 當圖示或裝飾。
- **Don't** 引入展示字體或網路字型；用系統字體堆疊。
- **Don't** 使用 LINE 的商標或 logo；借的是介面語法。
- **Don't** 在 760px 內容欄旁加側欄。
