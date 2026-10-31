// 會議記錄的 AI 摘要：存好之後多一段「重點」和「決議」，不改原文。
//
// 判斷題才用 AI：把一大段記錄濃縮成幾行重點。短記錄（幾行而已）本來一眼就看完，不叫 AI，省額度。
// 失敗、額度用完、沒設金鑰都回 null —— 會議記錄本身照常存檔，只是沒有摘要。
const { callGemini, extractJson, isDailyQuotaError } = require('./gemini');
const { markExhausted } = require('./quota');

// 至少這麼長才值得摘要
const MIN_LINES = 6;
const MIN_CHARS = 200;
const MAX_INPUT = 6000; // 給 AI 的字數上限，避免超長記錄一次燒太多
const MAX_ITEMS = 5;
const MAX_ITEM_LEN = 80;

const SYSTEM_PROMPT = `你是會議記錄的整理助手。把一份教會會議記錄整理成「重點」和「決議」。

規則：
- 只整理記錄裡「有寫」的內容，不要補充、推測、美化或加入自己的建議
- 重點：最多 5 點，每點一句話（30 字內為佳），挑對參加的人最重要的資訊
- 決議：記錄裡明確寫了「決定」「確定」「通過」「同意」的事；沒有就回空陣列，不要硬湊
- 數字、日期、人名、地點要照原文，不能改
- 不確定的就不要寫
- 用繁體中文

只輸出 JSON，不要其他文字：
{"points": ["..."], "decisions": ["..."]}`;

function shouldSummarize(content) {
  const text = String(content || '');
  const lines = text.split('\n').filter(l => l.trim()).length;
  return lines >= MIN_LINES || text.trim().length >= MIN_CHARS;
}

// 只去掉項目符號或「1.」這種編號；「11/1 開會」開頭的數字是內容，不能吃掉
const cleanList = (arr) => (Array.isArray(arr) ? arr : [])
  .filter(x => typeof x === 'string')
  .map(x => x.replace(/\s+/g, ' ').trim()
  .replace(/^(?:[・•\-*]\s*|\d{1,2}[.、)]\s+)/, ''))
  .filter(Boolean)
  .slice(0, MAX_ITEMS)
  .map(x => (x.length > MAX_ITEM_LEN ? `${x.slice(0, MAX_ITEM_LEN)}…` : x));

// 把 AI 的輸出收乾淨；兩邊都空就回 null
function sanitize(out) {
  if (!out || typeof out !== 'object') return null;
  const points = cleanList(out.points);
  const decisions = cleanList(out.decisions);
  return points.length || decisions.length ? { points, decisions } : null;
}

function formatSummary(s) {
  if (!s) return '';
  const parts = [];
  if (s.points && s.points.length) parts.push(`🧠 重點（AI 整理，僅供參考）\n${s.points.map(p => `• ${p}`).join('\n')}`);
  if (s.decisions && s.decisions.length) parts.push(`☑️ 決議\n${s.decisions.map(p => `• ${p}`).join('\n')}`);
  return parts.join('\n\n');
}

async function summarizeMeeting(content) {
  if (!process.env.GEMINI_API_KEY) return null;
  const text = String(content || '').trim();
  if (!shouldSummarize(text)) return null;
  try {
    const { isExhausted } = require('./quota');
    if (await isExhausted()) return null;
    const out = await callGemini({
      label: '會議摘要',
      system: SYSTEM_PROMPT,
      parts: [{ text: `會議記錄：\n${text.slice(0, MAX_INPUT)}` }],
      json: true,
      maxOutputTokens: 800,
    });
    return sanitize(extractJson(out));
  } catch (err) {
    console.error('Meeting summary error:', err);
    if (isDailyQuotaError(err)) await markExhausted();
    return null;
  }
}

module.exports = { shouldSummarize, summarizeMeeting, formatSummary, _test: { sanitize, SYSTEM_PROMPT } };
