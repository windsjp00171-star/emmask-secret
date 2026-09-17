// 產生 iCalendar (.ics) 內容，讓 Google 日曆／Apple 行事曆／Outlook 可以訂閱。
//
// 為什麼走訂閱而不是 Google Calendar API：訂閱只要吐一個檔案，不用 OAuth、
// 不用存 refresh token（Google 的測試模式 refresh token 七天就過期）、
// 也不吃 API 額度。代價是單向且更新不即時，見下面 REFRESH 說明。
const { taipeiPartsOf, taipeiKey } = require('./time');

// RFC 5545 規定換行是 CRLF，用 \n 有些用戶端會解析失敗
const CRLF = '\r\n';

// TEXT 型別要跳脫反斜線、分號、逗號與換行。順序很重要：
// 反斜線一定要先換，不然後面補上的反斜線會被二次跳脫。
function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// 一行最多 75 個 octet，超過要折行（下一行開頭加一個空白）。
// 這裡按「位元組」算但只在字元邊界切 —— 中文是 3 bytes，
// 從中間切斷會產生壞掉的 UTF-8，整個檔案就毀了。
function foldLine(line) {
  const MAX = 75;
  const chars = [...String(line)];
  const out = [];
  let cur = '';
  let bytes = 0;

  for (const ch of chars) {
    const n = Buffer.byteLength(ch, 'utf8');
    // 續行開頭那個空白也算一個 octet，所以續行的可用量是 74
    const limit = out.length === 0 ? MAX : MAX - 1;
    if (bytes + n > limit) {
      out.push(cur);
      cur = ch;
      bytes = n;
    } else {
      cur += ch;
      bytes += n;
    }
  }
  if (cur) out.push(cur);
  return out.length <= 1 ? out[0] || '' : out[0] + out.slice(1).map(s => CRLF + ' ' + s).join('');
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

// 整天事件用 YYYYMMDD（台北日期）
function icsDate(iso) {
  return taipeiKey(iso).replace(/-/g, '');
}

// 有時間的事件一律轉成 UTC 的 YYYYMMDDTHHMMSSZ，
// 這樣不用在檔案裡帶 VTIMEZONE 定義，各家用戶端都吃得下
function icsDateTimeUTC(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// 台北時間剛好是 00:00 的就當整天事件。
// 會議議程與只給日期的提醒都是這樣存的（taipeiToISO(y, mo, d, 0, 0)），
// 當成 00:00 的定時事件會讓行事曆上一整排都擠在半夜那一格。
function isAllDay(iso) {
  const { hour, minute } = taipeiPartsOf(iso);
  return hour === 0 && minute === 0;
}

// 整天事件的 DTEND 是「不含」的，所以要是隔天
function nextDayStamp(iso) {
  const [y, m, d] = taipeiKey(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

const TYPE_PREFIX = { reminder: '🔔', task: '📌' };

function buildEvent(note, { domain, stamp }) {
  const lines = ['BEGIN:VEVENT'];
  // UID 要穩定：同一筆記錄每次產生都要是同一個 UID，
  // 否則用戶端會當成新事件，日曆上就出現重複
  lines.push(`UID:${note.id}@${domain}`);
  lines.push(`DTSTAMP:${stamp}`);

  if (isAllDay(note.due_date)) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(note.due_date)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDayStamp(note.due_date)}`);
  } else {
    lines.push(`DTSTART:${icsDateTimeUTC(note.due_date)}`);
    // 沒有結束時間的概念，給一小時
    lines.push(`DTEND:${icsDateTimeUTC(new Date(new Date(note.due_date).getTime() + 3600000).toISOString())}`);
  }

  const prefix = TYPE_PREFIX[note.type] || '';
  const title = [prefix, note.content].filter(Boolean).join(' ');
  lines.push(`SUMMARY:${escapeText(title)}`);

  const desc = [];
  if (note.project) desc.push(`專案：${note.project}`);
  if (note.raw_text && note.raw_text !== note.content) desc.push(`原文：${note.raw_text}`);
  if (desc.length) lines.push(`DESCRIPTION:${escapeText(desc.join('\n'))}`);

  if (note.project) lines.push(`CATEGORIES:${escapeText(note.project)}`);
  lines.push('END:VEVENT');
  return lines;
}

function buildCalendar(notes, opts = {}) {
  const domain = opts.domain || 'emmask-secret';
  const name = opts.name || 'EmmArk 小秘書';
  const stamp = icsDateTimeUTC(opts.now || new Date().toISOString());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EmmArk//小秘書//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Asia/Taipei',
    // 提示用戶端多久回來抓一次。Google 不保證照做，但寫了沒壞處
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const n of notes || []) {
    if (!n || !n.id || !n.due_date) continue;
    lines.push(...buildEvent(n, { domain, stamp }));
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

module.exports = {
  buildCalendar,
  _test: { escapeText, foldLine, icsDate, icsDateTimeUTC, isAllDay, nextDayStamp, buildEvent },
};
