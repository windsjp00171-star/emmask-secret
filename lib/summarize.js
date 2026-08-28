// 用 Gemini 把「早安簡報 / 週報」的乾巴巴數字，補上一段人話的回顧。
//
// 設計原則：AI 只負責「敘述」，事實一律由既有的統計程式碼算好再餵進去。
// 所以 AI 掛掉（額度用完、網路不通、回傳格式壞掉）時一律回 null，
// 呼叫端只是少一段開場白，原本的清單與數字完全不受影響。
const { callGemini, isDailyQuotaError } = require('./gemini');
const { markExhausted } = require('./quota');

const PROMPTS = {
  day: `你是 EmmArk 小秘書。使用者是教會的行政同工。
根據下面today的待辦狀況，寫「一句」開場白，讓他知道今天的重點在哪。

規則：
- 繁體中文，1 句話，最多 40 字
- 講重點，不要複述清單（清單他自己看得到）
- 有逾期的事就點出來；沒事就輕鬆一點
- 不要用「好的」「以下是」開頭，不要用條列
- 只輸出那句話本身，不要加引號或其他文字`,

  week: `你是 EmmArk 小秘書。使用者是教會的行政同工。
根據下面這週的活動記錄，寫一段簡短的週回顧。

規則：
- 繁體中文，2-3 句話，最多 100 字
- 講出這週的節奏：忙什麼、完成得如何、有什麼要注意
- 不要複述數字（數字他自己看得到），要講數字背後的意思
- 有停滯的專案或積壓的待辦就提醒一下，語氣不要責備
- 不要用「好的」「以下是」開頭，不要用條列
- 只輸出那段話本身，不要加引號或其他文字`,
};

// 把 notes 陣列壓成給模型看的精簡事實表。純函式，方便測試。
function buildFactSheet(facts) {
  const lines = [];
  const push = (label, value) => {
    if (value === null || value === undefined || value === '') return;
    lines.push(`${label}：${value}`);
  };

  push('今天日期', facts.dateStr);
  push('本週區間', facts.weekStr);
  push('完成件數', facts.doneCount);
  push('待辦積壓件數', facts.pendingCount);
  push('逾期件數', facts.overdueCount);
  push('今日提醒件數', facts.reminderCount);

  const list = (label, items, limit = 8) => {
    if (!items || items.length === 0) return;
    const shown = items.slice(0, limit).map((s) => `- ${s}`);
    lines.push(`${label}：`, ...shown);
    if (items.length > limit) lines.push(`（另有 ${items.length - limit} 筆未列出）`);
  };

  list('今日提醒', facts.reminders);
  list('待辦', facts.tasks);
  list('逾期未完成', facts.overdue);
  list('本週完成', facts.done);
  list('本週專案進度', facts.updates);

  if (facts.stalledProjects && facts.stalledProjects.length) {
    lines.push(`停滯超過 7 天的專案：${facts.stalledProjects.join('、')}`);
  }

  return lines.join('\n');
}

async function writeSummary(kind, facts) {
  const system = PROMPTS[kind];
  if (!system) return null;
  if (!process.env.GEMINI_API_KEY) return null;

  const factSheet = buildFactSheet(facts);
  // 完全沒有素材就不用麻煩模型了
  if (!factSheet.trim()) return null;

  try {
    const text = await callGemini({ system, parts: [{ text: factSheet }] });

    // 模型偶爾還是會自己加引號或換行，這裡收乾淨
    const cleaned = text.trim().replace(/^["「『]|["」』]$/g, '').trim();
    return cleaned || null;
  } catch (err) {
    console.error('Summarize error:', err);
    // 摘要失敗本來就靜靜略過（簡報照常送），但額度用完要留下記號，
    // 這樣下一個功能撞到時才知道已經通知過使用者了
    if (isDailyQuotaError(err)) await markExhausted();
    return null;
  }
}

module.exports = { writeSummary, _test: { buildFactSheet, PROMPTS } };
