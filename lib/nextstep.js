// 存檔後的「下一步」按鈕：不用背指令，點一下就補時間、加提前通知、改時間。
// 純函式（不碰資料庫），postback 的處理在 lib/commands.js 的 handlePostback。
const { taipeiToISO } = require('./time');

// 快速時間選項。label 要在 LINE 按鈕 20 字內。
const WHEN_OPTIONS = [
  ['hour', '⏱ 1小時後'],
  ['tomorrow', '☀️ 明早9點'],
  ['weekend', '📅 週六9點'],
  ['monday', '🗓 下週一9點'],
];

function taipeiNowParts(now) {
  const t = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return { y: t.getFullYear(), mo: t.getMonth(), d: t.getDate(), wd: t.getDay() };
}

// 回傳 ISO；不認得的選項回 null
function resolveWhen(key, now = new Date()) {
  if (key === 'hour') return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const { y, mo, d, wd } = taipeiNowParts(now);
  if (key === 'tomorrow') return taipeiToISO(y, mo, d + 1, 9, 0);
  // 今天就是週六也排下週六，不排「已經過了的今天早上」
  if (key === 'weekend') return taipeiToISO(y, mo, d + ((6 - wd + 7) % 7 || 7), 9, 0);
  if (key === 'monday') return taipeiToISO(y, mo, d + ((1 - wd + 7) % 7 || 7), 9, 0);
  return null;
}

const LEAD_OPTIONS = [[60, '🔔 提前1小時'], [1440, '🔔 提前1天']];

function pickerButton(id, label) {
  return {
    type: 'button', style: 'secondary', height: 'sm', flex: 1,
    action: { type: 'datetimepicker', label, data: `act=pickdue&id=${id}`, mode: 'datetime' },
  };
}

// 回傳要放進卡片 footer 的 row 陣列。沒有 id 或不是待辦／提醒就回空陣列。
function buildNextStepRows(note) {
  if (!note || !note.id || !['task', 'reminder'].includes(note.type)) return [];
  const btn = (label, data) => ({
    type: 'button', style: 'secondary', height: 'sm', flex: 1,
    action: { type: 'postback', label, data, displayText: label },
  });

  if (!note.due_date) {
    const chips = WHEN_OPTIONS.map(([key, label]) => btn(label, `act=setdue&when=${key}&id=${note.id}`));
    return [
      { type: 'text', text: '什麼時候要做？點一下就好 👇', size: 'xs', color: '#8e8e93', wrap: true },
      { type: 'box', layout: 'horizontal', spacing: 'sm', contents: chips.slice(0, 2) },
      { type: 'box', layout: 'horizontal', spacing: 'sm', contents: chips.slice(2) },
      { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [pickerButton(note.id, '🕐 自選日期時間')] },
    ];
  }

  const row = [];
  if (note.remind_lead_minutes == null) {
    LEAD_OPTIONS.forEach(([m, label]) => row.push(btn(label, `act=lead&m=${m}&id=${note.id}`)));
  }
  row.push(pickerButton(note.id, '🕐 改時間'));
  return [{ type: 'box', layout: 'horizontal', spacing: 'sm', contents: row }];
}

// 晚上收工回顧是否到了該發的時間（台北 hour 以後）
function isEveningWindow(hour, startHour = 21) {
  return hour >= startHour;
}

// 放了好幾天、也沒訂日期的待辦：早安簡報裡另外挑出來問「還要做嗎？」
function pickStaleTasks(tasks, nowMs = Date.now(), days = 3, limit = 3) {
  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  return (tasks || [])
    .filter(n => !n.due_date && !n.recur && new Date(n.created_at).getTime() < cutoff)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .slice(0, limit);
}

module.exports = { WHEN_OPTIONS, resolveWhen, buildNextStepRows, isEveningWindow, pickStaleTasks };
