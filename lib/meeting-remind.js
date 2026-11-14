// 會議記錄裡抽出來、有日期的事（議程、有日期的待辦）＝教會行程：同時是「行程」（排進日曆、當天出現在早安簡報）
// 和「提醒」（活動前 3 天的早上 9 點推一則；最晚三天前就要知道）。純函式，方便測試。
const { taipeiToISO, taipeiKey } = require('./time');

const LEAD_DAYS = 3;
const REMIND_HOUR = 9;

// 這個時間的事要怎麼提醒：回 { lead_minutes, fire_at }，已經過去的事回 null（不提醒，日曆照樣看得到）。
// 活動前 3 天早上 9 點；已經不到 3 天了就盡快提醒（下一輪提醒排程就會推）。
function planReminder(dueISO, now = new Date(), leadDays = LEAD_DAYS) {
  const due = new Date(dueISO);
  if (!(due > now)) return null;
  const [y, m, d] = taipeiKey(dueISO).split('-').map(Number);
  const target = new Date(taipeiToISO(y, m - 1, d - leadDays, REMIND_HOUR, 0));
  if (target > now) return { lead_minutes: Math.round((due - target) / 60000), fire_at: target.toISOString() };
  return { lead_minutes: Math.ceil((due - now) / 60000) + 1, fire_at: now.toISOString() };
}

// 兩段文字有沒有重疊（任一段連續 4 個字出現在另一段）；用來避免「待辦」和 AI 抽的議程變成同一件事兩筆
function overlaps(a, b) {
  const x = String(a || '').replace(/\s+/g, ''), y = String(b || '').replace(/\s+/g, '');
  if (!x || !y) return false;
  if (x.length < 4 || y.length < 4) return x.includes(y) || y.includes(x);
  for (let i = 0; i + 4 <= x.length; i++) if (y.includes(x.slice(i, i + 4))) return true;
  return false;
}

// 組一筆會寫進 notes 的行程：reminder 型、帶提前提醒；已過去的不推播
function scheduleRow({ raw_text, content, due_date, meta, project }, now = new Date(), leadDays = LEAD_DAYS) {
  const plan = planReminder(due_date, now, leadDays);
  return {
    raw_text, type: 'reminder', content, due_date, meta, ...(project ? { project } : {}),
    remind_lead_minutes: plan ? plan.lead_minutes : null,
    is_reminded: !plan, is_done: false,
  };
}

module.exports = { planReminder, overlaps, scheduleRow, LEAD_DAYS };
