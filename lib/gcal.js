// 讀 Google 日曆（私人 iCal 網址）：
//   ・每天早安簡報列出「今天的 Google 行程」
//   ・每個有時間的行程開始前 N 分鐘（預設 30）推一則提醒
// 為什麼用私人 iCal 網址：不用 OAuth、不會每 7 天授權失效，跟小秘書「匯出日曆」同一個思路，只是反方向。
// 設定：Vercel 環境變數 GOOGLE_ICAL_URL＝日曆設定 →「整合日曆」→「iCal 格式的私人網址」。沒設就整個不啟用。
// 抓整份 .ics 有點大，所以每 GCAL_SYNC_MIN 分鐘才抓一次，結果（未來幾天的行程）暫存在 bot_state，
// 每 5 分鐘一次的提醒排程只讀暫存。
const ICAL = require('ical.js');
const { taipeiToISO, taipeiKey } = require('./time');
const { getState, setState } = require('./botstate');

const CACHE_KEY = 'gcal_cache';
const SYNC_MIN = Number(process.env.GCAL_SYNC_MIN || 20);
const LEAD_MIN = Number(process.env.GCAL_LEAD_MINUTES || 30);
const AHEAD_DAYS = 3;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_OCCURRENCES = 2000;

function enabled() { return Boolean((process.env.GOOGLE_ICAL_URL || '').trim()); }

// 只收 Google 日曆的網址（https 或 webcal），避免設錯成別的主機
// 從 Vercel 多行輸入框貼上時，很容易夾帶換行／空白／前後引號，Google 會因此回 404：先清掉
function cleanUrl(raw) {
  return String(raw || '').replace(/\s+/g, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
}

// 讀不到時記在日誌裡的「網址形狀」：只看特徵，不寫出網址本身（那串等於日曆的鑰匙）
function describeUrl(raw) {
  const s = String(raw || '');
  const c = cleanUrl(s);
  return [
    `長度 ${s.length}${c.length !== s.length ? `（清掉空白／引號後 ${c.length}）` : ''}`,
    `開頭 ${c.startsWith('https://calendar.google.com/calendar/ical/') ? 'OK' : '不對'}`,
    `private- ${/\/private-[0-9a-f]+\//i.test(c) ? '有' : '沒有'}`,
    `結尾 ${/\/basic\.ics$/.test(c) ? 'OK' : '不對'}`,
  ].join('、');
}

function normalizeUrl(raw) {
  const u = new URL(cleanUrl(raw).replace(/^webcal:/i, 'https:'));
  if (u.protocol !== 'https:' || u.hostname !== 'calendar.google.com') throw new Error('GOOGLE_ICAL_URL 必須是 calendar.google.com 的 iCal 網址');
  return u.toString();
}

// ICAL.Time → ISO；沒時區（floating）的時間當台北時間
function toISO(t) {
  if (t.zone && t.zone.tzid === 'floating') return taipeiToISO(t.year, t.month - 1, t.day, t.hour, t.minute);
  return t.toJSDate().toISOString();
}

// 解析 .ics 文字，回傳 [from, to] 之間的行程：{ uid, start, end, allDay, summary, location }
function parseEvents(text, from, to) {
  const comp = new ICAL.Component(ICAL.parse(text));
  comp.getAllSubcomponents('vtimezone').forEach(tz => { try { ICAL.TimezoneService.register(tz); } catch (e) { /* 不認得的時區就算了 */ } });
  const all = comp.getAllSubcomponents('vevent').map(v => new ICAL.Event(v));
  const masters = new Map();
  const exceptions = [];
  for (const ev of all) { if (ev.isRecurrenceException()) exceptions.push(ev); else masters.set(ev.uid, ev); }
  const orphans = [];
  for (const ex of exceptions) { const m = masters.get(ex.uid); if (m) m.relateException(ex); else orphans.push(ex); }

  const out = [];
  const add = (ev, start, end, key) => {
    if (String(ev.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return;
    const allDay = start.isDate;
    const s = allDay ? new Date(Date.UTC(start.year, start.month - 1, start.day) - 8 * 3600000) : new Date(toISO(start));
    const e = end ? (allDay ? new Date(Date.UTC(end.year, end.month - 1, end.day) - 8 * 3600000) : new Date(toISO(end))) : s;
    if (e < from && s < from) return;
    if (s > to) return;
    out.push({ uid: key, start: s.toISOString(), end: e.toISOString(), allDay, summary: ev.summary || '（未命名行程）', location: ev.location || '' });
  };

  for (const ev of [...masters.values(), ...orphans]) {
    try {
      if (ev.isRecurring()) {
        const it = ev.iterator();
        let next, n = 0;
        while ((next = it.next()) && n++ < MAX_OCCURRENCES) {
          if (next.toJSDate() > to) break;
          const d = ev.getOccurrenceDetails(next);
          add(d.item, d.startDate, d.endDate, `${ev.uid}#${next.toString()}`);
        }
      } else add(ev, ev.startDate, ev.endDate, ev.uid);
    } catch (e) { /* 單一行程壞掉不影響其他 */ }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

async function fetchIcs() {
  const res = await fetch(normalizeUrl(process.env.GOOGLE_ICAL_URL), { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!res.ok) throw new Error(`Google 日曆回 ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('日曆檔太大');
  return text;
}

// 取得未來幾天的行程（有暫存就用暫存；抓失敗就用舊的暫存）
async function getEvents(now = new Date()) {
  if (!enabled()) return [];
  const cache = await getState(CACHE_KEY);
  if (cache && now - new Date(cache.at) < SYNC_MIN * 60000) return cache.events;
  try {
    const from = new Date(now.getTime() - 86400000), to = new Date(now.getTime() + AHEAD_DAYS * 86400000);
    const events = parseEvents(await fetchIcs(), from, to);
    await setState(CACHE_KEY, { at: now.toISOString(), events }, 6 * 60);
    return events;
  } catch (err) {
    console.error('Google 日曆讀取失敗:', err.message, `（網址：${describeUrl(process.env.GOOGLE_ICAL_URL)}）`);
    return cache ? cache.events : [];
  }
}

const hm = (iso) => new Date(iso).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/^24:/, '00:');

// 現在該推提醒的行程：有時間、還沒開始、離開始不到 lead 分鐘、還沒推過
function dueReminders(events, now, lead = LEAD_MIN, sent = new Set()) {
  return (events || []).filter(e => !e.allDay && new Date(e.start) > now && new Date(e.start) - now <= lead * 60000 && !sent.has(`${e.uid}|${e.start}`));
}

function reminderText(e, now = new Date()) {
  const mins = Math.max(1, Math.round((new Date(e.start) - now) / 60000));
  return [`📅 ${mins} 分鐘後：${e.summary}`, `🕐 ${hm(e.start)}${e.end && e.end !== e.start ? `–${hm(e.end)}` : ''}${e.location ? `　📍 ${e.location}` : ''}`].join('\n');
}

async function sendGcalReminders(now = new Date()) {
  if (!enabled()) return 0;
  const events = await getEvents(now);
  const due = dueReminders(events, now, LEAD_MIN);
  if (!due.length) return 0;
  const { pushMessage } = require('./line');
  let n = 0;
  for (const e of due) {
    const key = `gcal_sent:${e.uid}|${e.start}`;
    if (await getState(key)) continue;
    await setState(key, { sent: true }, 3 * 24 * 60);
    await pushMessage(reminderText(e, now));
    n++;
  }
  return n;
}

// 早安簡報要附的幾行：今天的 Google 行程（全天的排前面）
function todayLines(events, now = new Date(), max = 8) {
  const today = taipeiKey(now.toISOString());
  const dayStart = new Date(`${today}T00:00:00+08:00`), dayEnd = new Date(dayStart.getTime() + 86400000);
  const mine = (events || []).filter(e => (e.allDay ? new Date(e.start) < dayEnd && new Date(e.end) > dayStart : taipeiKey(e.start) === today));
  mine.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
  const lines = mine.slice(0, max).map(e => `📅 ${e.allDay ? '全天' : hm(e.start)} ${e.summary}`);
  if (mine.length > max) lines.push(`📅 還有 ${mine.length - max} 個 Google 行程`);
  return lines;
}

async function briefingLines(now = new Date()) {
  if (!enabled()) return [];
  try { return todayLines(await getEvents(now), now); } catch (e) { return []; }
}

module.exports = {
  cleanUrl, describeUrl, enabled, normalizeUrl, parseEvents, dueReminders, reminderText, todayLines, briefingLines, sendGcalReminders, getEvents, LEAD_MIN };
