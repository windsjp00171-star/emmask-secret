// 台北時區（UTC+8，無日光節約）相關的日期/時間工具，從 lib/commands.js 拆出來，
// 純函式、不碰資料庫，方便單獨測試跟重用。

function formatTaipeiDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function nowTaipeiParts() {
  const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return { y: t.getFullYear(), mo: t.getMonth(), d: t.getDate(), wd: t.getDay() };
}

// 台北牆上時間（UTC+8，無日光節約）-> UTC ISO
function taipeiToISO(y, moZeroBased, d, h, mi) {
  return new Date(Date.UTC(y, moZeroBased, d, h - 8, mi, 0)).toISOString();
}

const WEEKDAY = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

// 從自然語言抓出 due_date（抓不到回 null）
function parseDueDate(text) {
  const { y, mo, d, wd } = nowTaipeiParts();
  let date = null;
  let hasDate = false;

  // 相對時間（精確時刻，直接回傳）：X分鐘後 / 半小時後 / X小時(半)後
  const nowMs = Date.now();
  if (/(?<![\d個])半\s*(?:個)?\s*(?:小時|鐘頭)後/.test(text)) {
    return new Date(nowMs + 30 * 60 * 1000).toISOString();
  }
  const minLater = text.match(/(\d+)\s*分鐘?後/);
  if (minLater) {
    return new Date(nowMs + parseInt(minLater[1], 10) * 60 * 1000).toISOString();
  }
  const hourLater = text.match(/(\d+)\s*(?:個)?\s*(?:小時|鐘頭)\s*半?\s*後/)
    || text.match(/(\d+)\s*個半\s*(?:小時|鐘頭)後/);
  if (hourLater) {
    let ms = parseInt(hourLater[1], 10) * 60 * 60 * 1000;
    if (/半/.test(hourLater[0])) ms += 30 * 60 * 1000;
    return new Date(nowMs + ms).toISOString();
  }

  // 完整日期（含年）：2026-08-09 / 2026/08/09 / 2026年8月9日
  const ymd = text.match(/(\d{4})\s*[-\/年]\s*(\d{1,2})\s*[-\/月]\s*(\d{1,2})\s*日?/);
  // 月/日（無年份）：8/9、8-9、8月9日
  const md = text.match(/(\d{1,2})\s*[-\/月]\s*(\d{1,2})\s*日?/);
  if (ymd) {
    date = { y: parseInt(ymd[1], 10), mo: parseInt(ymd[2], 10) - 1, d: parseInt(ymd[3], 10) };
    hasDate = true;
  } else if (md) {
    const month = parseInt(md[1], 10) - 1;
    const day = parseInt(md[2], 10);
    let yr = y;
    if (new Date(Date.UTC(y, month, day)) < new Date(Date.UTC(y, mo, d))) yr = y + 1;
    date = { y: yr, mo: month, d: day };
    hasDate = true;
  } else if (/今天|今日|今晚/.test(text)) {
    date = { y, mo, d };
    hasDate = true;
  } else if (/明天|明日|明晚/.test(text)) {
    const nd = new Date(Date.UTC(y, mo, d + 1));
    date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
    hasDate = true;
  } else if (/大後天/.test(text)) {
    const nd = new Date(Date.UTC(y, mo, d + 3));
    date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
    hasDate = true;
  } else if (/後天/.test(text)) {
    const nd = new Date(Date.UTC(y, mo, d + 2));
    date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
    hasDate = true;
  } else if (/(\d+)\s*天後/.test(text)) {
    const days = parseInt(text.match(/(\d+)\s*天後/)[1], 10);
    const nd = new Date(Date.UTC(y, mo, d + days));
    date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
    hasDate = true;
  } else {
    const wdMatch = text.match(/(下)?\s*(?:週|周|星期|禮拜)\s*([日天一二三四五六])/);
    if (wdMatch) {
      const target = WEEKDAY[wdMatch[2]];
      let delta = (target - wd + 7) % 7;
      if (delta === 0) delta = 7; // 下一個該星期幾，不含今天
      if (wdMatch[1]) delta += 7; // 「下」週再 +7
      const nd = new Date(Date.UTC(y, mo, d + delta));
      date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
      hasDate = true;
    }
  }

  let hour = null;
  let minute = 0;
  let hasTime = false;
  const period = (text.match(/(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|晚間|今晚|明晚)/) || [])[1];
  const hm = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  const dotTime = text.match(/(\d{1,2})\s*點\s*(半|\d{1,2}\s*分?)?/);
  if (hm) {
    hour = parseInt(hm[1], 10);
    minute = parseInt(hm[2], 10);
    hasTime = true;
  } else if (dotTime) {
    hour = parseInt(dotTime[1], 10);
    if (dotTime[2]) minute = dotTime[2].includes('半') ? 30 : parseInt(dotTime[2], 10);
    hasTime = true;
  }
  if (hasTime && hour !== null) {
    if (/下午|傍晚|晚上|晚間|今晚|明晚/.test(text) && hour < 12) hour += 12;
    else if (/凌晨|清晨|早上|上午/.test(text) && hour === 12) hour = 0;
  } else if (period) {
    const map = { 凌晨: 6, 清晨: 6, 早上: 9, 上午: 9, 中午: 12, 下午: 14, 傍晚: 18, 晚上: 20, 晚間: 20, 今晚: 20, 明晚: 20 };
    hour = map[period];
    minute = 0;
    hasTime = true;
  }

  if (!hasDate && !hasTime) return null;
  if (!hasDate) date = { y, mo, d };
  if (!hasTime) {
    hour = 9;
    minute = 0;
  }
  return taipeiToISO(date.y, date.mo, date.d, hour, minute);
}

// 取得某 ISO 在台北時區的年月日時分
function taipeiPartsOf(iso) {
  const o = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso)).forEach(p => { o[p.type] = p.value; });
  return { y: +o.year, mo: +o.month - 1, d: +o.day, hour: +o.hour % 24, minute: +o.minute };
}

function taipeiKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function mdToISO(m, d) { return parseDueDate(`${m}/${d}`); } // 該 M/D 早上 9 點（今年或明年）

function upcomingSundayISO() {
  const { y, mo, d, wd } = nowTaipeiParts();
  const delta = (0 - wd + 7) % 7; // 0 = 今天若為週日
  return taipeiToISO(y, mo, d + delta, 9, 0);
}

function fmtOrderDate(iso) {
  const dt = new Date(iso);
  const md = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' });
  const wd = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' });
  return `${md}（${wd}）`;
}

module.exports = {
  formatTaipeiDate,
  nowTaipeiParts,
  taipeiToISO,
  WEEKDAY,
  parseDueDate,
  taipeiPartsOf,
  taipeiKey,
  mdToISO,
  upcomingSundayISO,
  fmtOrderDate,
};
