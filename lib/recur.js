// 重複提醒（每天/每週X/每月N號/每半年/每N年）的解析與顯示邏輯，從 lib/commands.js 拆出來。
const { nowTaipeiParts, taipeiToISO, taipeiPartsOf, parseDueDate, formatTaipeiDate, WEEKDAY } = require('./time');

const WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

function recurLabel(recur) {
  if (recur === 'daily') return '每天';
  if (recur.startsWith('weekly:')) return `每週${WEEKDAY_LABEL[+recur.split(':')[1]]}`;
  if (recur.startsWith('monthly:')) {
    const parts = recur.split(':');
    const day = parts[1];
    const interval = +(parts[2] || 1);
    if (interval === 1) return `每月${day}號`;
    if (interval === 6) return `每半年（${day}號）`;
    if (interval === 12) return `每年（${day}號）`;
    if (interval % 12 === 0) return `每${interval / 12}年（${day}號）`;
    return `每${interval}個月（${day}號）`;
  }
  return recur;
}

// 解析重複規則（每天 / 每週X / 每月N號 / 每半年 / 每N年）；回傳 { recur, due(首次) } 或 null
function parseRecur(text) {
  let code = null;
  let intervalMonths = null;
  const wk = text.match(/每\s*(?:週|周|星期|禮拜)\s*([日天一二三四五六])/);
  const moM = text.match(/每\s*(?:個)?\s*月\s*(\d{1,2})\s*[號日]/);
  const halfYear = /每\s*半\s*年/.test(text);
  const yearM = text.match(/每\s*(\d{1,2})?\s*年/);
  if (/每天|每日/.test(text)) code = 'daily';
  else if (wk) code = `weekly:${WEEKDAY[wk[1]]}`;
  else if (moM) code = `monthly:${parseInt(moM[1], 10)}:1`;
  else if (halfYear) intervalMonths = 6;
  else if (yearM) intervalMonths = (parseInt(yearM[1], 10) || 1) * 12;
  if (!code && intervalMonths == null) return null;

  // 時間（時:分）：抓不到預設早上 9 點
  let hour = 9, minute = 0;
  const iso = parseDueDate(text);
  if (iso) { const tp = taipeiPartsOf(iso); hour = tp.hour; minute = tp.minute; }

  const { y, mo, d } = nowTaipeiParts();
  let due;
  if (code === 'daily') {
    due = taipeiToISO(y, mo, d, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = taipeiToISO(y, mo, d + 1, hour, minute);
  } else if (code && code.startsWith('weekly')) {
    due = iso || taipeiToISO(y, mo, d, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = nextRecurDue(code, due);
  } else if (intervalMonths != null) {
    // 每半年／每N年：以指定日期（沒指定就用今天）當起點錨定月/日，之後每 N 個月重複一次
    const anchor = iso ? taipeiPartsOf(iso) : { y, mo, d };
    code = `monthly:${anchor.d}:${intervalMonths}`;
    due = taipeiToISO(anchor.y, anchor.mo, anchor.d, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = taipeiToISO(anchor.y, anchor.mo + intervalMonths, anchor.d, hour, minute);
  } else {
    const day = +code.split(':')[1];
    due = taipeiToISO(y, mo, day, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = taipeiToISO(y, mo + 1, day, hour, minute);
  }
  return { recur: code, due };
}

// 由目前 due_date 算出下一次重複時間
function nextRecurDue(recur, fromISO) {
  const p = taipeiPartsOf(fromISO);
  if (recur === 'daily') return taipeiToISO(p.y, p.mo, p.d + 1, p.hour, p.minute);
  if (recur.startsWith('weekly')) return taipeiToISO(p.y, p.mo, p.d + 7, p.hour, p.minute);
  if (recur.startsWith('monthly')) {
    const parts = recur.split(':');
    const day = +parts[1];
    const interval = +(parts[2] || 1); // 舊格式（monthly:N）沒有間隔月數，預設每月一次
    return taipeiToISO(p.y, p.mo + interval, day, p.hour, p.minute);
  }
  return fromISO;
}

function buildRecurReply(note) {
  return `🔁 重複提醒已設定（${recurLabel(note.recur)}）\n📝 ${note.content}\n⏰ 下次：${formatTaipeiDate(note.due_date)}`;
}

module.exports = { recurLabel, parseRecur, nextRecurDue, buildRecurReply };
