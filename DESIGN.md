---
name: EmmArk 小秘書
description: LINE 小秘書聊天室的另一面：淡灰底上的面板，用聊天列表的密集列整理待辦、服事表、詩歌、敬拜順序、會議記錄、收藏與相簿。
colors:
  green: "#06c755"
  green-btn: "#06893d"
  green-press: "#057433"
  green-ink: "#04833a"
  green-tint: "#e2f6e9"
  red: "#c81e33"
  red-tint: "#fbe4e7"
  red-hover: "#f7d5da"
  amber: "#a34f00"
  amber-tint: "#fdecd6"
  blue: "#3f67a8"
  blue-tint: "#e2e9f5"
  purple: "#6b46c1"
  purple-tint: "#ebe4f8"
  bg: "#eef0f3"
  surface: "#fcfcfd"
  fill: "#e2e5e8"
  fill-hover: "#d8dbdf"
  line: "#dcdfe3"
  row-hover: "#f2f4f6"
  today-col: "#f2f4f6"
  ring: "#858a8f"
  ink: "#111111"
  ink-2: "#53585d"
  ink-3: "#5a5f64"
  on-ink: "#ffffff"
  on-solid: "#ffffff"
  task-bg: "#e2e5e8"
  task-ink: "#3d4247"
  dark-green-ink: "#4fd18a"
  dark-green-tint: "#12301f"
  dark-red: "#ff7a88"
  dark-red-tint: "#3b1c22"
  dark-red-hover: "#4a222a"
  dark-amber: "#f2a65a"
  dark-amber-tint: "#3a2a17"
  dark-blue: "#8db4f2"
  dark-blue-tint: "#1d2a3f"
  dark-purple: "#b9a0f5"
  dark-purple-tint: "#2b2341"
  dark-bg: "#16181b"
  dark-surface: "#1f2226"
  dark-fill: "#2a2e33"
  dark-fill-hover: "#343940"
  dark-line: "#2c3035"
  dark-row-hover: "#262a2f"
  dark-today-col: "#262a30"
  dark-ring: "#8c939a"
  dark-ink: "#e9ebee"
  dark-ink-2: "#b0b5bb"
  dark-ink-3: "#9ba1a7"
  dark-on-ink: "#16181b"
  dark-task-bg: "#2a2e33"
  dark-task-ink: "#c9ced4"
typography:
  login-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "22px"
    fontWeight: 700
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "17px"
    fontWeight: 700
  grid-date:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 700
    fontFeature: "\"tnum\" 1"
  row-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 600
  sub:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 600
    fontFeature: "\"tnum\" 1"
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang TC\", \"Noto Sans TC\", \"Microsoft JhengHei\", \"Segoe UI\", sans-serif"
    fontSize: "11px"
    fontWeight: 600
  mono:
    fontFamily: "ui-monospace, \"SF Mono\", Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  hairline: "2px"
  xs: "4px"
  focus: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  toast: "14px"
  panel: "16px"
  pill: "9999px"
spacing:
  "2": "2px"
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
components:
  button-primary:
    backgroundColor: "{colors.green-btn}"
    textColor: "{colors.on-solid}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.green-press}"
  button-ghost:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.fill-hover}"
  button-danger:
    backgroundColor: "{colors.red-tint}"
    textColor: "{colors.red}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-danger-hover:
    backgroundColor: "{colors.red-hover}"
  button-sheet-action:
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "46px"
  button-small:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  tab:
    textColor: "{colors.ink-3}"
    padding: "0 14px"
    height: "42px"
  tab-active:
    textColor: "{colors.ink}"
  view-tabs:
    backgroundColor: "{colors.fill}"
    rounded: "{rounded.pill}"
    padding: "3px"
  view-tab:
    textColor: "{colors.ink-2}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "32px"
  view-tab-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
  chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  chip-button:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "38px"
  chip-button-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  stat-pill:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "30px"
  stat-pill-late:
    backgroundColor: "{colors.red-tint}"
    textColor: "{colors.red}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
  date-capsule:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  date-capsule-overdue:
    backgroundColor: "{colors.red-tint}"
    textColor: "{colors.red}"
  field-input:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
    height: "40px"
  field-input-focus:
    backgroundColor: "{colors.surface}"
  composer-input:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "44px"
  send-button:
    backgroundColor: "{colors.green-btn}"
    textColor: "{colors.on-solid}"
    rounded: "{rounded.pill}"
    size: "44px"
  send-button-disabled:
    backgroundColor: "{colors.fill-hover}"
    textColor: "{colors.ink-3}"
  done-check:
    rounded: "{rounded.pill}"
    size: "24px"
  done-check-done:
    backgroundColor: "{colors.green-btn}"
    textColor: "{colors.on-solid}"
  person-chip:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "30px"
  soon-badge:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill}"
    padding: "1px 7px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.toast}"
    padding: "10px 10px 10px 16px"
---

# Design System: EmmArk 小秘書

## Overview

**Creative North Star: "LINE 對話原生"**

網頁是 LINE 小秘書那個聊天室的「另一面」。後台（`public/index.html`）和服事表（`public/worship.html`）共用 `public/app.css`：淡灰底（bg）上浮著一塊塊 surface 色的面板，面板裡是 LINE 聊天列表式的密集列；日期用置中的灰色膠囊分隔，頂欄是 sticky 標題列加可橫向捲動的底線分頁（待辦／服事表／詩歌庫／敬拜順序／會議記錄／收藏／相簿），新增則是底部固定的聊天輸入列，打一句話送出，走的是和 LINE bot 同一套分類與指令。

密度是這個世界的核心。總覽只有一行統計膠囊（未完成 N、過期 N）加一個「列表／日曆」分段控制，不做大數字卡片；專案膠囊、搜尋框、「篩選」與「選取」兩顆膠囊鈕排在列表上方，次要控制收進可展開的篩選面板。顏色極少：綠色只在行動與完成的那一刻出現，紅色只屬於過期與刪除，「下一次／快到了」用墨色。

動作語法借自 LINE「訊息已讀」：點右側圓圈，圓圈填綠、列轉灰並標「已完成」，沉進底部折疊的「已完成 N」群組；完成與刪除都以底部提示條加「復原」收尾，而不是先跳確認視窗。借用的是 LINE 的介面語法，不是商標或 logo。

**Key Characteristics:**
- 淡灰底（不用純白）上的 surface 面板：16px 圓角、1px line 邊、極淡陰影。
- 聊天列表列語法：40px 圓形類型頭像＋粗體標題＋灰副標＋右側圓形勾選。
- 綠色只給行動與完成，紅色只給過期與刪除，「下一次／快到了」用墨色。
- 全部顏色走 CSS 變數，深色模式跟隨系統設定自動切換。
- 膠囊與圓形是主要形狀；系統字體，數字一律 tabular-nums。
- 線條 SVG 圖示（stroke 1.75），不用 emoji。
- 可逆動作用提示條「復原」，不用確認對話框；所有動畫在 reduced-motion 下關閉。

## Colors

冷灰紙面加墨色文字，一抹 LINE 綠負責行動與完成，一抹警示紅負責過期與刪除；類型色只出現在頭像與類型標籤的淡底上。所有值定義在 `public/app.css` 的 `:root`，深色值在同檔 `@media (prefers-color-scheme: dark)` 區塊。

### Primary
- **LINE 亮綠 (green)**：focus-visible 外框（2px、offset 2px）、輸入框聚焦邊框、服事表格內編輯框的 2px 邊。不當實心底色（對白字對比不足）。
- **行動綠 (green-btn)**：實心行動：主要按鈕、送出鍵、勾選完成後的圓圈、批次列的「完成」、checkbox 的 accent-color、勾選圓圈 hover 邊框。深色模式不變。
- **按下綠 (green-press)**：行動綠的 hover。
- **完成綠字 (green-ink)**：列右側的「已完成」字。
- **淡綠底 (green-tint)**：文字選取底色。

### Secondary
- **警示紅 (red)**：過期與刪除：「過期」統計膠囊與日期膠囊的字、副標裡的「逾期・時間」、篩選鈕上的非預設紅點、刪除按鈕的字、相簿刪除鍵 hover。
- **淡紅底 (red-tint)** / **淡紅 hover (red-hover)**：危險按鈕與過期膠囊的底，以及其 hover。

### Tertiary
- **類型色 (amber / blue / purple 及其 -tint)**：只用在類型頭像、類型標籤與日曆圓點：提醒是琥珀、筆記是藍、專案更新是紫；日曆上服事日的圓點也用藍。琥珀另用於「資料被截斷」提示條。收藏的連結字用 blue。
- **待辦灰 (task-bg / task-ink)**：待辦頭像刻意用中性灰底深灰圖示，不用綠。

### Neutral
- **淡灰底 (bg)**：頁面、頂欄、手機版輸入列的底。不用純白，減少刺眼。
- **面板白 (surface)**：`.panel`、sheet、分段控制選中的那一段、聚焦中的輸入框、服事表格的底。
- **填色灰 (fill)** / **填色 hover (fill-hover)**：膠囊、輸入框、ghost 按鈕、日期膠囊、人員膠囊、圖示鍵 hover 的底；fill-hover 也是送出鍵停用時的底。
- **分隔線 (line)**：所有 1px 分隔線、面板與輸入框邊框。
- **列 hover (row-hover)** / **今日欄 (today-col)**：列 hover 的極淡底；服事表「下一次」那一欄的淡底。
- **勾選環 (ring)**：未完成圓圈的 2px 邊。
- **墨色 (ink)**：主文字、選中分頁底線、選中膠囊與「篩選／選取」開啟時的實心底、今天的日曆日期、「快到了」徽章、提示條的底。
- **次灰 (ink-2)** / **淡灰字 (ink-3)**：副標、欄位標籤、空狀態；時間、未選分頁、placeholder。兩者值接近，層級靠字重與字級區分。
- **反白字 (on-ink)**：墨色底上的字；深色模式下翻成深底色。
- **實心字 (on-solid)**：行動綠與錯誤提示條這類「兩種模式都不變」的實心底上的白字，build 中寫成字面 `#fff`。

### 深色模式
跟隨系統 `prefers-color-scheme: dark`，`color-scheme: light dark`。深色值：bg #16181b、surface #1f2226、fill #2a2e33、fill-hover #343940、line #2c3035、row-hover #262a2f、today-col #262a30、ring #8c939a、ink #e9ebee、ink-2 #b0b5bb、ink-3 #9ba1a7、on-ink #16181b、task-bg #2a2e33、task-ink #c9ced4；green-ink #4fd18a、green-tint #12301f；red #ff7a88、red-tint #3b1c22、red-hover #4a222a；amber #f2a65a / #3a2a17；blue #8db4f2 / #1d2a3f；purple #b9a0f5 / #2b2341。green、green-btn、green-press 不覆寫，兩種模式相同。

### Named Rules
**The 綠色只給行動與完成 Rule.** 綠色只出現在行動（送出、主要按鈕、聚焦）與完成（勾選填綠、「已完成」字）。狀態、類型、裝飾、「即將」都不准用綠。

**The 紅色只給過期與刪除 Rule.** 紅色只表示過期，或刪除這類破壞性動作。不用紅色做強調或裝飾。

**The 下一次用墨色 Rule.** 「下一次」「快到了」「今天」與所有選中狀態用墨色（實心墨色底或墨色字），不用綠。

**The 只用變數 Rule.** 新元件一律用 `--bg`、`--surface`、`--fill`、`--line`、`--ink`、`--on-ink` 等變數，不寫死色碼，否則深色模式會破。唯一例外是兩種模式都不變的實心綠底上的白字。

## Typography

**Body Font:** 系統字體堆疊（-apple-system, BlinkMacSystemFont, PingFang TC, Noto Sans TC, Microsoft JhengHei, Segoe UI, sans-serif）
**Mono Font:** ui-monospace, "SF Mono", Menlo, monospace（敬拜順序內容框、服事表批次貼上框）

**Character:** 和 LINE 一樣用作業系統原生字體，讓網頁讀起來像 App 的延伸。層級靠字重（700／600／400）與小幅字級差，不靠展示字體。

### Hierarchy
- **Login Title**（700，22px）：登入框標題。
- **Title**（700，20px，-0.01em）：頂欄「小秘書」標題；旁邊 12px ink-3 的更新時間。
- **Headline**（700，17px）：sheet 標題、日曆月份。
- **Grid Date**（700，16px，tabular-nums）：服事表格欄頭日期、季別區塊標題。
- **Row Title**（600，15px，1.35）：列表每一列的內容，最多兩行；完成後降為 400、ink-3。
- **Body**（400，15px，1.5）：基礎內文、輸入框、分頁（分頁用 600）、sheet 動作鈕（700）。
- **Control**（600–700，14px）：按鈕（700）、膠囊、膠囊鈕、分段控制、提示條、人員膠囊、表格格子、搜尋框文字。
- **Sub**（400，13px）：列副標（專案・時間・類型）、小按鈕（600）、sheet 欄位標籤（600）、日曆日期數字（600）。
- **Label**（600，12px，tabular-nums）：日期膠囊、星期、表格職位欄頭、說明字。
- **Micro**（600，11px）：「快到了」徽章、日曆格內計數。
- **Mono**（400，13px）：程式碼與貼上區。

### Named Rules
**The 表格數字 Rule.** 所有時間、日期、計數套 tabular-nums（`.num` 或 `font-variant-numeric`），整欄數字對齊不跳動。

## Layout

單欄。後台內容欄 `max-width: 900px` 置中，內距 16px，底部預留 96px 給輸入列；服事表用寬版 1280px。頂欄 sticky、標題與分頁對齊同一條內容欄（narrow／wide 兩種 body class 計算左右內距）；分頁列可橫向捲動、隱藏捲軸。

後台待辦的順序：總覽列（統計膠囊左、分段控制右）→ 專案膠囊（橫捲）→ 搜尋框＋「篩選」＋「選取」→ 可展開的篩選面板（類型、狀態、排序、重設）→ 列表面板。列表依到期時間分組（過期／今天／明天／這七天／之後／未排時間／已完成）。列：左內距 12px、上下 6px，頭像與文字間距 12px；列間分隔線從頭像右側 98px 處開始（LINE 列表的做法）。

服事表依季分成可收合的區塊（預設展開本季），每季一張格狀表（日期 × 職位），放在 `width: fit-content` 的面板裡；職位欄 sticky 在左、日期列 sticky 在上；800px 以上每個日期欄等寬 200px。人員查詢是 760px 的面板表格；管理頁兩欄（640px 以下單欄）。

斷點：600px（統計膠囊縮小、服事表工具列按鈕只剩圖示）、640px（sheet 變置中對話框、管理頁分欄）、800px（勾選觸控區 44→40px、格狀表欄寬 200px）、900px（輸入列變成接在內容欄底部、上緣圓角的 surface 面板）。間距階梯：2、4、6、8、10、12、16、20、24px。

### Named Rules
**The 面板承載 Rule.** 內容（列表、日曆、格狀表、人員查詢、管理清單、篩選面板、詩歌與會議等清單）一律放在 surface 面板上，浮在淡灰底之上；控制列（膠囊、搜尋、分段控制）直接放在灰底上。

## Elevation & Depth

以色階分層為主：淡灰底 → surface 面板 → fill 控制。陰影都很淡，只有真正浮在內容上的元素（提示條、批次列、sheet）才有明顯陰影。

### Shadow Vocabulary
- **面板**（`box-shadow: 0 1px 2px rgba(0,0,0,.04)`）：`.panel` 與服事表格外框。
- **分段控制選中段**（`box-shadow: 0 1px 2px rgba(0,0,0,.08)`）。
- **批次列**（`box-shadow: 0 6px 24px rgba(0,0,0,.14)`）：選取模式浮在底部的批次動作列。
- **提示條**（`box-shadow: 0 8px 28px rgba(0,0,0,.2)`）。
- **Sheet（手機）**（`box-shadow: 0 -8px 32px rgba(0,0,0,.12)`）／**Sheet（640px 以上）**（`box-shadow: 0 12px 40px rgba(0,0,0,.18)`）；背後 40% 黑遮罩。
- **日曆選中格**（`box-shadow: inset 0 0 0 2px` 墨色）。

## Shapes

圓與膠囊是主角：頭像、勾選、送出鍵、圖示鍵、日曆翻頁鍵是正圓；按鈕、膠囊、膠囊鈕、分段控制、統計膠囊、日期膠囊、人員膠囊、搜尋框、輸入列文字框都是全圓角（build 寫成高度的一半，15–22px）。矩形容器用柔和圓角：程式碼 4px、格內編輯框與相簿縮圖 8px、表單欄位與日曆格 10px、sheet 動作鈕與登入元件 12px、提示條 14px、面板與 sheet 16px。邊框一律 1px line 色；唯一的 2px 邊是勾選環與格內編輯框。

## Components

### Buttons
- **Shape:** 全圓角膠囊，高 40px（`border-radius: 20px`），14px 700，圖示 18px。
- **Primary:** 行動綠底白字；hover 換按下綠。
- **Ghost / Cancel / Manage:** fill 底墨色字；hover fill-hover。
- **Danger:** 淡紅底紅字；hover red-hover。
- **Small:** 32px 高、13px 600、fill 底（批次列、篩選重設）。
- **Sheet 動作列:** 46px 高、12px 圓角、15px；主要鈕撐開到最多 240px。
- **停用:** 45% 透明度。**Focus:** 2px 亮綠外框、offset 2px。

### Chips
- **專案膠囊:** 32px 高、fill 底、14px；選中反轉為墨色底 on-ink 字（不用綠）。
- **膠囊鈕（篩選／選取）:** 38px 高、14px 600、16px 線條圖示；開啟時（aria-expanded／aria-pressed）反轉為墨色。篩選條件非預設時右上角出現 8px 紅點。
- **統計膠囊:** 30px 高、13px ink-2 字＋15px 700 墨色數字；「過期」用淡紅底紅字。600px 以下縮為 28px。
- **分段控制（列表／日曆、格狀表格／人員查詢／管理）:** fill 底 3px 內距的膠囊槽，段 32px 高 14px 600 ink-2；選中段變 surface 底墨色字加淡陰影。
- **連結篩選（未封存／已封存／全部）:** 34px 高 14px 600 fill 底，選中為墨色底。

### Cards / Containers
- **面板:** surface 底、1px line 邊、16px 圓角、淡陰影；清單面板左右 16px 內距、列間 1px 分隔，不再巢狀卡片。

### Inputs / Fields
- **Style:** fill 底、1px line 邊、10px 圓角、9px 12px 內距、15px、最小 40px。搜尋框是 38px 全圓角 14px。
- **Focus:** 去掉 outline，邊框換亮綠、底換 surface。
- **Checkbox:** 18px，accent-color 行動綠。

### Navigation
- **頂欄:** bg 底 sticky、下緣 1px line；20px 標題。
- **分頁:** 底線式，42px 高、15px 600；未選 ink-3，hover 與選中墨色字，選中在底部加 2px 墨色短底線（左右各縮 12px）。分頁列橫向捲動不換行。

### 記錄列（Signature Component）
左邊 40px 圓形類型頭像（線條圖示 20px），中間 15px 600 標題最多兩行＋13px ink-2 副標（專案・時間・類型，逾期部分紅色 600），右側勾選鈕：44px 觸控區（800px 以上 40px），內圈 24px、2px ring 邊；hover 邊框轉行動綠。完成時圓圈填行動綠、白勾出現、標題降為 400 ink-3、頭像去色 55% 透明，右側出現 12px 600 green-ink「已完成」，該列移進底部折疊的「已完成 N」群組。AI 改寫過的記錄多一個「AI 改寫過，看原話」小標籤可展開原文。點列身開編輯 sheet。

**一列一個主要操作:** 平常每列只有右側的勾選；按「選取」進入選取模式後，勾選隱藏、列左側才出現 checkbox，輸入列換成浮動批次列（全選、N 筆、完成、改專案、刪除、取消；surface 底、22px 圓角、1px line 邊）。

### 日期膠囊
置中、12px 600 ink-2、fill 底全圓角、3px 10px。「過期 N」用淡紅底紅字。「已完成 N」膠囊是按鈕，帶會旋轉的 chevron。

### 底部輸入列（Composer）
只在待辦分頁出現。左邊 44px 圓形「＋」圖示鍵（開表單 sheet），中間 44px 全圓角 fill 文字框（「跟小秘書說一句話…」），右邊 44px 圓形行動綠送出鍵（空白時 fill-hover 底 ink-3 圖示）。送出的句子走和 LINE bot 相同的分類與指令，回覆顯示在提示條。手機版 bg 底、上緣 1px line、滿寬加 safe-area；900px 以上變成 900px 寬、上緣 16px 圓角的 surface 面板。

### 提示條（Toast）
底部置中、輸入列上方（84px＋safe-area；無輸入列時 20px）。墨色底 on-ink 字、14px、14px 圓角，可帶一個「復原」鈕（32px 全圓角、on-ink 18% 混色底、700）。一般 3 秒、帶動作 5 秒、輸入列回覆 6 秒。錯誤版本為紅底白字。刪除採延後執行：先從畫面拿掉，5 秒內按「復原」即還原，時間到才送出刪除。

### Sheet
從底部升起（220ms，translateY 24px → 0），上緣 16px 圓角、20px 內距加 safe-area、最高 92vh；640px 以上變置中對話框、四角 16px。標準寬 520px，批次貼上用 760px 寬版。欄位標籤 13px 600 ink-2，提示字 12px ink-3。

### 服事表格
季別標題 16px 700 帶旋轉 chevron 與「N 個主日」小字。欄頭 16px 700 日期＋12px 星期；最近的主日那一欄整欄 today-col 淡底，星期換成「下一次」小膠囊。格子 14px，可用 Tab 聚焦，Enter／空白開始編輯；編輯框 36px、8px 圓角、2px 亮綠邊，Enter 存檔往下、Shift+Enter 往上、Tab／Shift+Tab 左右、Esc 取消。人員是 30px 全圓角 fill 底 14px 的膠囊；空格顯示 16px「＋」圖示，50% 透明、hover 全顯。

### 人員查詢與管理
人員查詢是面板內的表格，依季插入 13px 700 ink-2 小標；兩週內的服事日期 700 並帶墨色「快到了」徽章（11px、on-ink 字）。職位以 fill 底膠囊列出。管理頁是兩塊面板（主日日期、服事職位），每項 48px 高、右側 40px 圓形刪除圖示鍵，hover 淡紅底紅色。

## Do's and Don'ts

### Do:
- **Do** 把內容放在 surface 面板上（16px 圓角、1px line 邊、`0 1px 2px rgba(0,0,0,.04)`），面板浮在 bg 淡灰底上。
- **Do** 用變數上色，讓深色模式自動成立；實心行動綠上的白字是唯一的字面色。
- **Do** 綠色只給行動與完成；紅色只給過期與刪除；「下一次／快到了」與選中狀態用墨色。
- **Do** 每列只留一個主要操作（右側勾選）；批次 checkbox 只在選取模式出現。
- **Do** 完成與刪除用提示條「復原」收尾（刪除延後 5 秒執行），讓操作可逆。
- **Do** 次要控制收進可展開的面板（篩選），非預設時用 8px 紅點提示。
- **Do** 所有時間、日期、計數套 tabular-nums；圖示用線條 SVG（stroke 1.75、round cap／join）。
- **Do** 控制元件用 14px，按鈕與膠囊全圓角；`prefers-reduced-motion: reduce` 時關閉全部 animation 與 transition。

### Don't:
- **Don't** 寫死色碼（`#fff` 底、`#000` 字之類）；深色模式會破。
- **Don't** 用綠色標示「即將」、類型或裝飾，也不要用紅色做強調。
- **Don't** 做大數字統計卡片或 admin 表格版型；總覽只用一行統計膠囊。
- **Don't** 用 confirm() 對話框擋可逆的完成或刪除；用提示條加「復原」。
- **Don't** 讓每列同時常駐 checkbox 和勾選兩個主要操作。
- **Don't** 使用 emoji 當圖示，或引入展示字體、網路字型。
- **Don't** 使用 LINE 的商標或 logo；借的是介面語法。
