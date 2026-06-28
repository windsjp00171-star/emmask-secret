const supabase = require('./supabase');

// Number of days in a given month (month is 1-12)
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Current date in Asia/Taipei timezone
function taipeiNow() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
}

// Parse "每月15號 內容" / "每月 15 日 內容" → { day, content }
function parseMonthly(text) {
  const m = text.match(/^每月\s*(\d{1,2})\s*(?:[號日号]\s*[:：]?|[:：]|\s)\s*(.+)$/s);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const content = m[2].trim();
  if (day < 1 || day > 31 || !content) return null;
  return { day, content };
}

async function addMonthlyReminder(text) {
  const parsed = parseMonthly(text);
  if (!parsed) {
    return '❌ 格式不對，請用：每月15號 繳房租';
  }

  const { error } = await supabase.from('monthly_reminders').insert({
    day_of_month: parsed.day,
    content: parsed.content,
  });

  if (error) throw new Error(`Supabase insert error: ${error.message}`);

  return `✅ 已設定每月提醒\n📅 每月 ${parsed.day} 號\n📌 ${parsed.content}`;
}

async function listMonthlyReminders() {
  const { data, error } = await supabase
    .from('monthly_reminders')
    .select('*')
    .eq('is_active', true)
    .order('day_of_month');

  if (error) throw new Error(`Supabase query error: ${error.message}`);
  if (!data || data.length === 0) return '目前沒有每月提醒。\n設定方式：每月15號 繳房租';

  const lines = ['🔁 每月提醒'];
  data.forEach((r, i) => {
    lines.push(`${i + 1}. 每月 ${r.day_of_month} 號 — ${r.content}`);
  });
  lines.push('\n刪除：刪除月提醒 關鍵字');
  return lines.join('\n');
}

async function deleteMonthlyReminder(keyword) {
  if (!keyword) return '請輸入關鍵字，例如：刪除月提醒 房租';

  const { data } = await supabase
    .from('monthly_reminders')
    .select('*')
    .eq('is_active', true)
    .ilike('content', `%${keyword}%`)
    .limit(1);

  if (!data || data.length === 0) return `找不到包含「${keyword}」的每月提醒。`;

  const item = data[0];
  await supabase.from('monthly_reminders').update({ is_active: false }).eq('id', item.id);
  return `🗑 已刪除每月提醒：每月 ${item.day_of_month} 號 — ${item.content}`;
}

// Send all monthly reminders due today (called from the daily cron).
// Returns the number of reminders sent.
async function sendDueMonthlyReminders(pushMessage) {
  const now = taipeiNow();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const today = now.getDate();
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const lastDay = daysInMonth(year, month);

  const { data, error } = await supabase
    .from('monthly_reminders')
    .select('*')
    .eq('is_active', true);

  if (error) throw new Error(`Supabase query error: ${error.message}`);
  if (!data || data.length === 0) return 0;

  let sent = 0;
  for (const r of data) {
    // Fire on the matching day. If the configured day exceeds the number of
    // days this month (e.g. 31 in February), fire on the last day instead.
    const fireDay = Math.min(r.day_of_month, lastDay);
    if (today !== fireDay) continue;
    // Avoid sending twice in the same month.
    if (r.last_reminded_ym === ym) continue;

    const lines = ['🔁 每月提醒', `📌 ${r.content}`, `📅 每月 ${r.day_of_month} 號`];
    await pushMessage(lines.join('\n'));
    await supabase
      .from('monthly_reminders')
      .update({ last_reminded_ym: ym })
      .eq('id', r.id);
    sent++;
  }

  return sent;
}

module.exports = {
  parseMonthly,
  addMonthlyReminder,
  listMonthlyReminders,
  deleteMonthlyReminder,
  sendDueMonthlyReminders,
};
