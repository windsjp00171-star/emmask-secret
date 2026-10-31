// Gemini 用量統計（自己數的估計值）。
//
// Google 沒有提供「剩餘額度」的查詢，只能自己數：每次呼叫 Gemini 就在當天的計數上加一，
// 按「功能」和「模型」分開記，讓使用者問「AI額度」時看得出今天用了幾次、哪個功能吃最多。
// 限制：只算小秘書自己的呼叫；每天用台灣日期切，Google 的重置時間不一定相同；
// 同時有兩個請求在寫時偶爾會少算 1～2 次。所以這是估計，不是帳單。
const { taipeiKey } = require('./time');

const KEEP_MIN = 3 * 24 * 60;
const keyFor = (dayKey) => `gemini_usage:${dayKey}`;
const todayKey = (now = new Date()) => taipeiKey(now.toISOString());

// 記一次呼叫。失敗只記 log，絕不影響正常回覆。
async function note(model, label, now = new Date()) {
  try {
    // 延遲載入：沒有資料庫設定的環境（例如單元測試）載入 botstate 會直接丟錯，不能連累呼叫 Gemini
    const { getState, setState } = require('./botstate');
    const key = keyFor(todayKey(now));
    const cur = (await getState(key)) || { total: 0, by: {} };
    const k = `${label || '其他'}|${model || ''}`;
    cur.total += 1;
    cur.by[k] = (cur.by[k] || 0) + 1;
    await setState(key, cur, KEEP_MIN);
  } catch (err) {
    console.error('usage.note error:', err);
  }
}

async function getDay(dayKey) {
  const { getState } = require('./botstate');
  return (await getState(keyFor(dayKey))) || { total: 0, by: {} };
}

// 純函式：把一天的用量整理成回覆文字
function formatUsage(day, { dayKey, limit = null, exhausted = false } = {}) {
  const lines = [`🤖 Gemini 用量（台灣時間 ${dayKey.slice(5).replace('-', '/')}，小秘書自己數的估計值）`];
  lines.push(`今天已呼叫 ${day.total} 次${limit ? `／每日上限 ${limit} 次，約剩 ${Math.max(0, limit - day.total)} 次` : ''}`);
  const rows = Object.entries(day.by || {}).sort((a, b) => b[1] - a[1]);
  if (rows.length) {
    lines.push('', '各功能：');
    rows.forEach(([k, n]) => {
      const [label, model] = k.split('|');
      lines.push(`・${label}：${n} 次${model ? `（${model}）` : ''}`);
    });
  }
  if (exhausted) lines.push('', '⚠️ 目前被標記為「額度用完」，恢復前這些功能會先退回不用 AI 的做法。');
  if (!limit) lines.push('', '💡 想看「約剩幾次」，到 Vercel 設環境變數 GEMINI_DAILY_LIMIT＝你在 Google AI Studio 看到的每日上限。');
  lines.push('只算小秘書的呼叫，同一把金鑰給別的程式用的不會算進來；真正的剩餘額度請看 Google AI Studio。');
  return lines.join('\n');
}

async function handleUsage(now = new Date()) {
  const dayKey = todayKey(now);
  const { isExhausted } = require('./quota');
  const limit = Number(process.env.GEMINI_DAILY_LIMIT) || null;
  return formatUsage(await getDay(dayKey), { dayKey, limit, exhausted: await isExhausted() });
}

module.exports = { note, getDay, handleUsage, _test: { formatUsage, todayKey } };
