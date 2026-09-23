const supabase = require('./supabase');
const { callGemini, extractJson, isDailyQuotaError } = require('./gemini');
const { markExhausted, SHORT: QUOTA_SHORT } = require('./quota');

const ROLE_ORDER = ['信息','領會','助唱','鍵盤','吉他','貝斯','鼓','音控','PPT','導播後製','攝影','兒主破冰敬拜','兒主信息活動','第一堂內場招待','第一堂服務台','第二堂內場招待','第二堂服務台','備註','VIP新人服事','教會禱告會'];

function parseDate(str) {
  const m = str.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  const month = parseInt(m[1], 10), day = parseInt(m[2], 10);
  const now = new Date();
  let year = now.getFullYear();
  const d = new Date(year, month - 1, day);
  if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year++;
  return { iso: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`, month, day };
}

async function getScheduleByDate(dateStr) {
  const parsed = parseDate(dateStr);
  if (!parsed) return '日期格式不對，請用 7/5 這樣的格式。';

  const { data } = await supabase
    .from('worship_schedule')
    .select('*')
    .eq('service_date', parsed.iso)
    .order('role');

  if (!data || data.length === 0) return `找不到 ${parsed.month}/${parsed.day} 的服事表，可能尚未排定。`;

  const byRole = {};
  data.forEach(item => {
    if (!byRole[item.role]) byRole[item.role] = [];
    byRole[item.role].push(item.person_name);
  });

  const d = new Date(parsed.iso + 'T00:00:00+08:00');
  const weekday = d.toLocaleDateString('zh-TW', { weekday: 'short', timeZone: 'Asia/Taipei' });
  const lines = [`⛪ ${parsed.month}/${parsed.day}（${weekday}）服事名單`];

  ROLE_ORDER.forEach(role => {
    if (byRole[role]) lines.push(`${role}：${byRole[role].join('、')}`);
  });

  // Any roles not in ROLE_ORDER
  Object.keys(byRole).forEach(role => {
    if (!ROLE_ORDER.includes(role)) lines.push(`${role}：${byRole[role].join('、')}`);
  });

  return lines.join('\n');
}

async function getMySchedule(myName, weeksAhead = 5) {
  if (!myName) return '請在 Vercel 設定 WORSHIP_MY_NAME 環境變數（你在服事表裡的名字）。';

  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];
  const futureIso = new Date(now.getTime() + weeksAhead * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data } = await supabase
    .from('worship_schedule')
    .select('*')
    .eq('person_name', myName)
    .gte('service_date', todayIso)
    .lte('service_date', futureIso)
    .order('service_date');

  if (!data || data.length === 0) return `接下來 ${weeksAhead} 週沒有找到 ${myName} 的服事。`;

  const byDate = {};
  data.forEach(item => {
    if (!byDate[item.service_date]) byDate[item.service_date] = [];
    byDate[item.service_date].push(item.role);
  });

  const lines = [`⛪ ${myName} 近期服事（${weeksAhead}週）`];
  Object.entries(byDate).sort().forEach(([date, roles]) => {
    const d = new Date(date + 'T00:00:00+08:00');
    const label = d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Taipei' });
    lines.push(`\n📅 ${label}`);
    roles.forEach(r => lines.push(`• ${r}`));
  });

  return lines.join('\n');
}

// 整月服事日期（如「8月服事表」）
async function getMonthSchedule(monthNum) {
  const month = parseInt(monthNum, 10);
  if (!month || month < 1 || month > 12) return '請用「8月服事表」這種格式。';
  const year = new Date().getFullYear();
  const pad = n => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const endY = month === 12 ? year + 1 : year;
  const endM = month === 12 ? 1 : month + 1;
  const end = `${endY}-${pad(endM)}-01`;

  const { data } = await supabase
    .from('worship_schedule')
    .select('service_date')
    .gte('service_date', start)
    .lt('service_date', end)
    .order('service_date');

  if (!data || data.length === 0) return `${month} 月還沒有排定服事表。`;

  const dates = [...new Set(data.map(d => d.service_date))];
  const lines = [`⛪ ${month} 月服事日期`];
  dates.forEach(d => {
    const dt = new Date(d + 'T00:00:00+08:00');
    const md = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
    const wd = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' });
    lines.push(`• ${md}（${wd}）`);
  });
  const first = new Date(dates[0] + 'T00:00:00+08:00');
  lines.push(`\n輸入「服事表 ${month}/${first.getDate()}」看當天完整名單`);
  return lines.join('\n');
}

// 我自己某月的服事（如「8月服事表」）
async function getMyMonthSchedule(myName, monthNum) {
  if (!myName) return getMonthSchedule(monthNum); // 沒設名字 → 退回整月日期
  const month = parseInt(monthNum, 10);
  if (!month || month < 1 || month > 12) return '請用「8月服事表」這種格式。';
  const year = new Date().getFullYear();
  const pad = n => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const endY = month === 12 ? year + 1 : year;
  const endM = month === 12 ? 1 : month + 1;
  const end = `${endY}-${pad(endM)}-01`;

  const { data } = await supabase
    .from('worship_schedule')
    .select('*')
    .eq('person_name', myName)
    .gte('service_date', start)
    .lt('service_date', end)
    .order('service_date');

  if (!data || data.length === 0) return `${myName} ${month} 月沒有排定服事 🎉`;

  const byDate = {};
  data.forEach(it => { (byDate[it.service_date] = byDate[it.service_date] || []).push(it.role); });
  const lines = [`⛪ ${myName}　${month} 月服事`];
  Object.keys(byDate).sort().forEach(d => {
    const dt = new Date(d + 'T00:00:00+08:00');
    const md = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
    const wd = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' });
    lines.push(`• ${md}（${wd}）：${byDate[d].join('、')}`);
  });
  return lines.join('\n');
}

// ── 服事表 PDF 匯入 ──
// 一季排一次：在 LINE 丟 PDF → 模型只負責「讀表」（抽取＋對應職位名稱），
// 拆人名、去重、寫資料庫都用程式碼做，結果才穩定可預期。

// 讀表格要準，用 flash 而不是 flash-lite。一季才呼叫一次，每日 20 次的免費額度綽綽有餘。
const PDF_MODEL = process.env.GEMINI_PDF_MODEL || 'gemini-3.6-flash';
const NOTE_ROLE = '備註';

function buildImportPrompt(roleNames) {
  return `你會收到一份教會「主日服事表」PDF（橫軸是日期，縱軸是職位）。請把表格內容抽取成 JSON。

規則：
- dates：表頭所有主日日期，依序輸出 ISO 格式（YYYY-MM-DD）。年份看標題（例如「2026，10~12 月」）。
- rows：每個職位一列，cells 的長度必須等於 dates 的長度，對應同一欄；空白格輸出 ""。
- role 必須從這份清單挑最接近的名稱：${roleNames.join('、')}
  （例如「行事備註」→「備註」、「導播/後製」→「導播後製」、「兒主 破冰/敬拜」→「兒主破冰敬拜」、「第一堂 內場招待」→「第一堂內場招待」）。清單裡真的沒有對應的，才用表上原本的名稱。
- 格子內容照抄，不要拆人名；同一格內換行的姓名與稱謂合併成一個（例如「任秀媚」「教師」→「任秀媚教師」），備註類的多行文字用空格連接。
- PDF 有多頁時，同一個職位只輸出一次（後面頁面重複出現的列略過）。
- 如果這份文件不是服事表，只輸出 {"error": "原因"}。

只輸出 JSON，不要其他文字：
{"dates": ["2026-10-04"], "rows": [{"role": "信息", "cells": ["牧師"]}]}`;
}

function splitNames(cell) {
  return cell.split(/[、,，\/／]/).map(s => s.trim()).filter(Boolean);
}

// 模型輸出 → 資料列。拆人名（備註不拆）、略過空白格、去掉跨頁重複。
function buildEntries(parsed) {
  const dates = Array.isArray(parsed && parsed.dates) ? parsed.dates : [];
  if (dates.length === 0 || !dates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d))) return null;

  const seen = new Set();
  const entries = [];
  const filledRoles = new Set();
  const allRoles = [];
  (parsed.rows || []).forEach(row => {
    if (!row || !row.role || !Array.isArray(row.cells)) return;
    if (!allRoles.includes(row.role)) allRoles.push(row.role);
    row.cells.slice(0, dates.length).forEach((cell, i) => {
      const raw = String(cell || '').replace(/\s+/g, ' ').trim();
      if (!raw) return;
      const names = row.role === NOTE_ROLE ? [raw] : splitNames(raw);
      names.forEach(person_name => {
        const key = `${dates[i]}|${row.role}|${person_name}`;
        if (seen.has(key)) return;
        seen.add(key);
        filledRoles.add(row.role);
        entries.push({ service_date: dates[i], role: row.role, person_name });
      });
    });
  });
  const blankRoles = allRoles.filter(r => !filledRoles.has(r));
  return { dates, entries, filledRoles: [...filledRoles], blankRoles };
}

async function importSchedulePdf(base64) {
  const { data: roleRows } = await supabase.from('worship_roles').select('role_name').order('sort_order');
  const roleNames = roleRows && roleRows.length > 0 ? roleRows.map(r => r.role_name) : ROLE_ORDER;

  let parsed;
  try {
    const text = await callGemini({
      model: PDF_MODEL,
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: base64 } },
        { text: buildImportPrompt(roleNames) },
      ],
      json: true,
      maxOutputTokens: 8000,
    });
    parsed = extractJson(text);
  } catch (err) {
    console.error('Worship PDF error:', err);
    if (isDailyQuotaError(err)) {
      await markExhausted();
      return `❌ ${QUOTA_SHORT}`;
    }
    return '❌ 服事表讀取失敗，請稍後再傳一次。';
  }
  if (parsed.error) return `❌ 看起來不是服事表：${parsed.error}`;

  const result = buildEntries(parsed);
  if (!result) return '❌ 讀不到表頭日期，請確認 PDF 是服事表。';
  const { dates, entries, filledRoles, blankRoles } = result;
  if (entries.length === 0) return '❌ 表格裡沒有讀到任何服事人員。';

  // 開表：補上還沒有的主日日期
  const { data: existingDates } = await supabase.from('worship_dates').select('service_date').in('service_date', dates);
  const existingSet = new Set((existingDates || []).map(d => d.service_date));
  const newDates = dates.filter(d => !existingSet.has(d));
  if (newDates.length > 0) {
    const { error } = await supabase.from('worship_dates').insert(newDates.map(service_date => ({ service_date })));
    if (error) throw new Error(`Supabase insert error: ${error.message}`);
  }

  // 重傳修訂版＝覆蓋那幾個主日。先寫新的再刪舊的，寫入失敗時舊資料還在。
  const { data: oldRows } = await supabase.from('worship_schedule').select('id').in('service_date', dates);
  const { error } = await supabase.from('worship_schedule').insert(entries);
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  const replaced = (oldRows || []).length;
  for (let i = 0; i < replaced; i += 100) {
    await supabase.from('worship_schedule').delete().in('id', oldRows.slice(i, i + 100).map(r => r.id));
  }

  const fmt = iso => `${parseInt(iso.slice(5, 7), 10)}/${parseInt(iso.slice(8), 10)}`;
  const lines = [
    '✅ 服事表已匯入',
    `📅 ${dates[0].slice(0, 4)} ${fmt(dates[0])}～${fmt(dates[dates.length - 1])}，${dates.length} 個主日`,
    `👥 共 ${entries.length} 筆服事`,
  ];
  if (newDates.length > 0) lines.push(`🆕 新開 ${newDates.length} 個主日`);
  if (replaced) lines.push(`♻️ 已覆蓋這些日期原有的 ${replaced} 筆`);
  if (blankRoles.length > 0) lines.push(`⬜ 尚未排人：${blankRoles.join('、')}`);
  const unknownRoles = filledRoles.filter(r => !roleNames.includes(r));
  if (unknownRoles.length > 0) lines.push(`⚠️ 新職位（後台⚙管理可加入排序）：${unknownRoles.join('、')}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    lines.push(`\n請到後台核對：https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/worship.html`);
  }
  return lines.join('\n');
}

module.exports = {
  getScheduleByDate, getMySchedule, getMonthSchedule, getMyMonthSchedule, importSchedulePdf,
  _test: { buildEntries, splitNames },
};
