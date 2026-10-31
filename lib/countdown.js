// 倒數日：「倒數 12/25 聖誕節」記下一個日子，之後早安簡報會顯示「還有 N 天」。
// 存在 notes 裡（project＝倒數日），跟收藏、會議記錄一樣是系統專案，不會混進一般筆記。
const { parseDueDate, taipeiKey } = require('./time');

const COUNTDOWN_PROJECT = '倒數日';
const SHOW_WITHIN_DAYS = 90; // 簡報只提醒 90 天內的
const SHOW_MAX = 2;

// 一定要有明確日期（M/D、M月D日、2027-01-03）；光是「明天」「3天後」不算
const DATE_TOKEN = /(\d{4})\s*[-\/年]\s*(\d{1,2})\s*[-\/月]\s*(\d{1,2})\s*日?|(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/;

// 「12/25 聖誕節」→ { title: '聖誕節', dateISO }；沒有日期回 null
function parseCountdown(text) {
  const raw = String(text || '').trim();
  const m = raw.match(DATE_TOKEN);
  if (!m) return null;
  const dateISO = parseDueDate(m[0]);
  if (!dateISO) return null;
  const title = raw.replace(m[0], ' ').replace(/^[\s:：,，、-]+|[\s:：,，、-]+$/g, '').replace(/\s+/g, ' ').trim();
  return { title: title || '那一天', dateISO };
}

// 距離那一天還有幾天（台北日期相減）；今天＝0，已過為負
function daysLeft(dueISO, now = new Date()) {
  const a = Date.parse(`${taipeiKey(dueISO)}T00:00:00Z`);
  const b = Date.parse(`${taipeiKey(now.toISOString())}T00:00:00Z`);
  return Math.round((a - b) / 86400000);
}

function describe(title, days) {
  if (days === 0) return `🎉 ${title}就是今天！`;
  if (days === 1) return `⏳ ${title}是明天`;
  return `⏳ ${title}還有 ${days} 天`;
}

// 早安簡報要附的幾行：沒過、90 天內、最近的 2 個
function briefingLines(items, now = new Date()) {
  return (items || [])
    .map(n => ({ title: n.content, days: daysLeft(n.due_date, now) }))
    .filter(x => x.days >= 0 && x.days <= SHOW_WITHIN_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, SHOW_MAX)
    .map(x => describe(x.title, x.days));
}

function formatList(items, now = new Date()) {
  const rows = (items || []).map(n => ({ n, days: daysLeft(n.due_date, now) })).filter(x => x.days >= 0).sort((a, b) => a.days - b.days);
  if (!rows.length) return '還沒有倒數日。\n記錄方式：「倒數 12/25 聖誕節」（日期要寫月/日）';
  const md = (iso) => { const k = taipeiKey(iso); return `${+k.slice(5, 7)}/${+k.slice(8, 10)}`; };
  return ['⏳ 倒數日', ...rows.slice(0, 15).map(x => `・${md(x.n.due_date)} ${x.n.content}：${x.days === 0 ? '就是今天' : `還有 ${x.days} 天`}`), '', '刪掉一個：「刪倒數 聖誕節」'].join('\n');
}

module.exports = { COUNTDOWN_PROJECT, parseCountdown, daysLeft, briefingLines, formatList, describe };
