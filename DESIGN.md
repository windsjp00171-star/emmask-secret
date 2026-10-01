---
name: EmmArk 小秘書
description: LINE 小秘書的記錄 Dashboard 與主日服事表（改版前基準）
colors:
  system-blue: "#007aff"
  indigo-violet: "#5856d6"
  done-green: "#34c759"
  alert-red: "#ff3b30"
  pending-orange: "#ff9500"
  charcoal-bar: "#1c1c1e"
  ink: "#1d1d1f"
  slate-label: "#6e6e73"
  mist-gray: "#8e8e93"
  header-meta-gray: "#98989d"
  hairline-gray: "#d2d2d7"
  fill-gray: "#e5e5ea"
  quiet-fill: "#f2f2f7"
  page-gray: "#f5f5f7"
  hover-wash: "#f9f9fb"
  surface-white: "#ffffff"
  blue-tint: "#e1f0ff"
  today-cream: "#fff8e6"
  badge-task-bg: "#fff3cd"
  badge-task-text: "#856404"
  badge-reminder-bg: "#f8d7da"
  badge-reminder-text: "#721c24"
  badge-note-bg: "#d1ecf1"
  badge-note-text: "#0c5460"
  badge-project-bg: "#d4edda"
  badge-project-text: "#155724"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "32px"
    fontWeight: 700
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
  badge:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
rounded:
  xs: "6px"
  sm: "8px"
  badge: "10px"
  md: "12px"
  lg: "16px"
  pill: "20px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-cancel:
    backgroundColor: "{colors.fill-gray}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-secondary-violet:
    backgroundColor: "{colors.indigo-violet}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-tab:
    backgroundColor: "{colors.fill-gray}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-tab-active:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.surface-white}"
  button-row-done:
    backgroundColor: "{colors.done-green}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
    typography: "{typography.caption}"
  button-row-undo:
    backgroundColor: "{colors.pending-orange}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
  button-row-delete:
    backgroundColor: "{colors.alert-red}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
  input-field:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  card-surface:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "16px"
  modal-sheet:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.lg}"
    padding: "28px"
    width: "460px"
  app-header:
    backgroundColor: "{colors.charcoal-bar}"
    textColor: "{colors.surface-white}"
    padding: "16px 24px"
  project-tag:
    backgroundColor: "{colors.fill-gray}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  project-tag-active:
    backgroundColor: "{colors.blue-tint}"
    textColor: "{colors.system-blue}"
  person-chip:
    backgroundColor: "{colors.blue-tint}"
    textColor: "{colors.system-blue}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
---

<!-- BASELINE: 改版前的現況紀錄（2026-10-01）。改版時舊外觀只當參考，不作為要保留的方向；改版完成後請重跑 /impeccable document。 -->

# Design System: EmmArk 小秘書

## Overview

**Creative North Star: "小秘書的工作桌"**

這套介面就是一張整理好的工作桌：深炭色的頂欄像桌緣，淺灰的底像桌面，白色卡片和表格像攤在上面的單子。上面放的是 LINE 小秘書收進來的待辦、提醒、筆記，還有主日服事的排班格。整體密度偏高，畫面以表格為主，用顏色區分類型和狀態，幾乎沒有裝飾。

目前沒有自己的品牌語言。顏色直接取自 iOS 系統色（系統藍、綠、紅、橘、紫），字體用作業系統預設字體，形狀和陰影也是同一套 Apple 風格的預設值。四種記錄類型的徽章色則來自 Bootstrap 的 alert 配色，跟其他元素不是同一個來源。

兩個頁面都是單一 HTML 檔，樣式寫在 `<style>` 裡，沒有共用樣式表、沒有 CSS 變數、沒有 Tailwind，也沒有任何轉場或動畫。

**Key Characteristics:**
- 深炭色頂欄 + 淺灰頁面底 + 白色卡片／表格三層結構
- iOS 系統色當主色與狀態色，系統字體
- 以表格呈現資料，密度高、字級集中在 11–15px
- 平面為主，只有一層很淡的陰影
- 完全沒有動畫與轉場
- 兩頁各自複製一份相同的基礎樣式，沒有共用來源

## Colors

一個系統藍主色，搭配 iOS 狀態色和一組冷灰中性色；徽章另用一組 Bootstrap 柔和色。

### Primary
- **System Blue** (#007aff)：主要按鈕、統計數字、作用中的分頁和專案標籤、人員小標籤的文字。是全站唯一的主色。

### Secondary
- **Indigo Violet** (#5856d6)：次要動作，記錄列的「編輯」按鈕和服事表的管理按鈕。

### Tertiary
- **Done Green** (#34c759)：記錄列的「完成」按鈕。
- **Pending Orange** (#ff9500)：記錄列的「撤銷」按鈕；服事表「今天」那一欄的欄頭。
- **Alert Red** (#ff3b30)：刪除按鈕、管理清單的刪除 ✕。

### Neutral
- **Charcoal Bar** (#1c1c1e)：頂欄背景。
- **Ink** (#1d1d1f)：主要文字。
- **Slate Label** (#6e6e73)：表頭文字、表單標籤、統計說明、空狀態文字。
- **Mist Gray** (#8e8e93)：提示文字、「＋」新增小標籤的文字。
- **Header Meta Gray** (#98989d)：頂欄裡的連結與更新時間。
- **Hairline Gray** (#d2d2d7)：輸入框邊框。
- **Fill Gray** (#e5e5ea)：取消按鈕、未選中的分頁和專案標籤、表格格線。
- **Quiet Fill** (#f2f2f7)：表頭背景、表格分隔線。
- **Page Gray** (#f5f5f7)：頁面背景。
- **Hover Wash** (#f9f9fb)：表格列 hover、服事表職位欄、管理清單項目底色。
- **Surface White** (#ffffff)：卡片、表格、彈窗、輸入框背景。
- **Blue Tint** (#e1f0ff)：作用中專案標籤、人員小標籤、日期徽章的底色。
- **Today Cream** (#fff8e6)：服事表「今天」那一欄的格子底色。

### Badge Pairs
四種記錄類型各有一組底色＋文字色：待辦（#fff3cd / #856404）、提醒（#f8d7da / #721c24）、筆記（#d1ecf1 / #0c5460）、專案更新（#d4edda / #155724）。

### Named Rules
**The One Blue Rule.** 互動和強調都用系統藍；其他彩色只在記錄列的操作按鈕、徽章和「今天」標示裡出現。

## Typography

**Display Font:** 系統字體（-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif）
**Body Font:** 同上
**Label/Mono Font:** 無獨立字體

**Character:** 完全交給作業系統，Mac／iPhone 上是蘋方，Windows 上是 Segoe UI 搭配系統中文字體。沒有載入任何網頁字體。

### Hierarchy
- **Display** (700, 32px)：只用在統計卡片的數字。
- **Headline** (600, 18px)：頂欄標題。彈窗標題用 17px。
- **Title** (600, 15px)：管理卡片標題、登入按鈕。
- **Body** (400, 14px)：表格內容、按鈕、輸入框。
- **Label** (600, 13px)：表頭；表單標籤和統計說明也是 13px，但字重是 400。
- **Caption** (400, 12px)：小按鈕、人員小標籤、管理提示、服事表格內容（13px）。
- **Badge** (600, 11px)：類型徽章。

### Named Rules
**The Narrow Band Rule.** 除了統計數字，所有文字都落在 11–18px 之間，用字重（400／600）而不是字級拉開層次。

## Layout

- **Dashboard**：內容寬度上限 1100px，置中，左右留白 16px，上下 24px。上方是自動填滿的統計卡片格線（每格至少 160px，間距 12px），下面是專案標籤列、篩選列，最後是整頁寬的記錄表格。
- **服事表**：內容全寬，左右 16px。上方工具列放分頁按鈕，「＋ 新增服事」靠右。格狀表格可以橫向捲動，欄頭固定在上方，職位欄固定在左側。
- **管理頁**：兩欄卡片，640px 以下變成一欄。這是全站唯一的斷點。
- **間距節奏**：大多是 4／8／12／16／20／24px，空狀態和登入框用 40px。
- **手機**：Dashboard 沒有針對窄螢幕調整，記錄表格在手機上會被擠壓。

## Elevation & Depth

以平面為主，靠「灰底上的白卡」區分層次，只有很淡的陰影輔助。

### Shadow Vocabulary
- **Resting card** (`box-shadow: 0 1px 3px rgba(0,0,0,.08)`)：統計卡片、表格、管理卡片、服事表外框。
- **Floating box** (`box-shadow: 0 4px 20px rgba(0,0,0,.1)`)：只用在登入框。
- **Modal scrim** (`background: rgba(0,0,0,.4)`)：彈窗後方的遮罩。彈窗本身沒有陰影。

### Named Rules
**The Paper-on-Desk Rule.** 深度只有兩層：頁面底色和白色卡片。沒有 hover 浮起、沒有多層陰影。

## Shapes

圓角是中等、一致的：小按鈕 6px，一般按鈕和輸入框 8px，徽章 10px，卡片、表格和人員小標籤 12px，彈窗和登入框 16px，專案標籤 20px（膠囊形）。邊框只用 1px 細線，唯一例外是作用中專案標籤的 2px 藍框，以及「新增」小標籤的虛線框。

## Components

### Buttons
- **Shape:** 柔和的圓角（一般 8px，記錄列小按鈕 6px）。
- **Primary:** 系統藍底白字，8px 16px，14px 字、字重 500。
- **Cancel:** Fill Gray 底、Ink 文字，其他同主要按鈕。
- **Row actions:** 記錄列的小按鈕（4px 10px，12px 字），用顏色區分動作：綠＝完成、橘＝撤銷、紫＝編輯、紅＝刪除。
- **Hover / Focus:** 沒有定義 hover、focus 或按下的樣式，使用瀏覽器預設的 focus 外框。

### Chips
- **Project tag:** 膠囊形、Fill Gray 底，選中時變成 Blue Tint 底＋2px 藍框＋藍字。
- **Person chip（服事表）:** Blue Tint 底、藍字、12px 圓角；hover 時反轉成藍底白字。
- **Add chip:** Quiet Fill 底、Mist Gray 文字、1px 虛線框，用在空的服事格子裡。
- **Type badge:** 11px 粗體、10px 圓角，四種類型各一組柔和色。

### Cards / Containers
- **Corner Style:** 12px。
- **Background:** Surface White，放在 Page Gray 上。
- **Shadow Strategy:** Resting card（見 Elevation & Depth）。
- **Border:** 無。
- **Internal Padding:** 統計卡片 16px，管理卡片 20px。

### Tables
- 白底、12px 圓角、Resting card 陰影。
- 表頭 Quiet Fill 底、13px 粗體 Slate Label 文字；儲存格 12px 16px。
- 列 hover 換成 Hover Wash 底。
- 已完成的記錄整列降到 45% 透明度並加刪除線。
- 服事表格：欄頭固定、職位欄固定，「今天」那一欄是 Today Cream 底、橘色欄頭。

### Inputs / Fields
- **Style:** 白底、1px Hairline Gray 邊框、8px 圓角、8px 12px（彈窗內 10px 12px）。
- **Focus:** 沒有自訂樣式，使用瀏覽器預設。
- **Error / Disabled:** 沒有。錯誤一律用瀏覽器的 `alert()` 跳窗；刪除前用 `confirm()`。

### Navigation
- **App header:** 深炭色頂欄，左邊白色標題，右邊灰色小字連結（「⛪ 服事表」／「← 返回 Dashboard」）和更新時間。
- **View tabs（服事表）:** 三個分頁按鈕，未選中是灰底，選中是藍底白字。

### Modal
- 白色、16px 圓角、28px 內距、最寬 460px，背後是 40% 黑色遮罩。
- 標籤在欄位上方，按鈕靠右；服事表的刪除按鈕靠左。
- 只能用按鈕關閉，沒有 Esc 或點遮罩關閉。

### Login Gate
- 置中的白色方框（16px 圓角、40px 內距、Floating box 陰影），一個密碼欄位和一個全寬藍色按鈕。

## Do's and Don'ts

以下只描述現況的慣例，不是改版方向。

### Do:
- **Do** 用系統藍 (#007aff) 表示主要動作和選中狀態。
- **Do** 把內容放在 Page Gray (#f5f5f7) 上的白色 12px 圓角卡片或表格裡，搭配 Resting card 陰影。
- **Do** 用系統字體，字級維持在 11–18px，用字重拉開層次。
- **Do** 記錄類型用固定的四組徽章色。

### Don't:
- **Don't** 引入第二種主色；其他彩色只用於狀態和操作按鈕。
- **Don't** 加多層陰影或 hover 浮起效果；現況只有兩層深度。
