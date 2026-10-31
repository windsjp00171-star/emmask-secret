// 筆記的 AI 輔助：整理（彙整成幾個主題）、歸類（建議沒標專案的筆記放哪個專案）。
//
// 設計原則：
// - 都是「使用者主動問才呼叫」，不會每則筆記都花一次額度。
// - AI 只做判斷：整理只讀不改；歸類只「建議」，要使用者按確認才會寫入。
// - AI 的輸出一律先消毒：歸類只接受「專案清單裡真的有的名稱」，其餘一律當作沒把握。
// - 失敗、額度用完、沒金鑰都回 null，呼叫端只要說「現在沒辦法」。
const { callGemini, extractJson, isDailyQuotaError } = require('./gemini');
const { markExhausted } = require('./quota');

const MAX_NOTES = 30;
const MAX_NOTE_LEN = 300;
const MAX_THEMES = 5;
const MAX_POINTS = 4;
const MAX_TEXT_LEN = 80;

const DIGEST_PROMPT = `你是使用者的筆記整理助手。使用者給你一批自己寫的筆記（每則有編號、日期、專案、內容），請彙整成幾個主題。

規則：
- 只整理筆記裡「有寫」的內容，不要補充、推測或加入自己的建議
- 最多 5 個主題，每個主題最多 4 個重點，每個重點一句話
- 同一件事散在好幾則的要合併；零碎的想法可以放進「其他」
- 數字、日期、人名、網址要照原文，不要改
- 重點後面用括號標上來源編號，例如（#3、#7）
- 用繁體中文

只輸出 JSON，不要其他文字：
{"themes": [{"title": "主題名稱", "points": ["重點（#1）"]}]}`;

const ASSIGN_PROMPT = `你是筆記歸類助手。下面有「還沒歸專案的筆記」（有編號）和「可用的專案清單」。請替每則筆記建議最適合的專案。

規則：
- 專案名稱只能從清單裡挑，要一字不差照抄，不可以自己創新名稱或改寫
- 內容真的屬於那個專案才填；不確定就填 null。留空比硬塞一個錯的好
- 不要因為字面上剛好有相同的字就硬套

只輸出 JSON，不要其他文字：
{"assignments": [{"n": 1, "project": "專案名稱或 null"}]}`;

const clip = (s, n) => {
  const flat = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : `${flat.slice(0, n)}…`;
};

const md = (iso) => {
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000); // 台北時間
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

// 挑出要整理的筆記：只要筆記和專案更新、排除系統專案、期間內、新的在前、最多 MAX_NOTES 則
function selectDigestNotes(rows, { days = 7, project = null, systemProjects = [], now = Date.now() } = {}) {
  const since = now - days * 24 * 3600 * 1000;
  const wanted = project ? String(project).toLowerCase().replace(/\s+/g, '') : null;
  return (rows || [])
    .filter(n => n && (n.type === 'note' || n.type === 'project_update'))
    .filter(n => !systemProjects.includes(n.project))
    .filter(n => new Date(n.created_at).getTime() >= since)
    .filter(n => !wanted || (n.project && n.project.toLowerCase().replace(/\s+/g, '') === wanted))
    .filter(n => String(n.content || '').trim())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, MAX_NOTES);
}

function buildDigestInput(notes) {
  return notes.map((n, i) => `#${i + 1} ${md(n.created_at)}${n.project ? ` 〔${n.project}〕` : ''} ${clip(n.content, MAX_NOTE_LEN)}`).join('\n');
}

function sanitizeDigest(out) {
  if (!out || !Array.isArray(out.themes)) return null;
  const themes = out.themes
    .filter(t => t && typeof t.title === 'string' && Array.isArray(t.points))
    .map(t => ({
      title: clip(t.title, 30),
      points: t.points.filter(p => typeof p === 'string').map(p => clip(p, MAX_TEXT_LEN)).filter(Boolean).slice(0, MAX_POINTS),
    }))
    .filter(t => t.title && t.points.length)
    .slice(0, MAX_THEMES);
  return themes.length ? { themes } : null;
}

function formatDigest(digest, count, label) {
  const lines = [`🗂 ${label}的筆記整理（${count} 則，AI 整理，僅供參考）`];
  digest.themes.forEach(t => {
    lines.push('', `【${t.title}】`);
    t.points.forEach(p => lines.push(`• ${p}`));
  });
  lines.push('', '（#數字是第幾則，可用「筆記」指令對照原文）');
  return lines.join('\n');
}

// 最近一次 AI 失敗的原因，讓呼叫端能告訴使用者「是額度用完」還是「Google 那邊太忙」，不要一律說額度
let lastFailure = 'other';

async function callJson(label, system, text) {
  lastFailure = 'other';
  if (!process.env.GEMINI_API_KEY) { lastFailure = 'nokey'; return null; }
  try {
    const { isExhausted } = require('./quota');
    if (await isExhausted()) { lastFailure = 'quota'; return null; }
    return extractJson(await callGemini({ label, system, parts: [{ text }], json: true, maxOutputTokens: 1500 }));
  } catch (err) {
    console.error(`${label} error:`, err);
    if (isDailyQuotaError(err)) { await markExhausted(); lastFailure = 'quota'; }
    else if (err && err.status >= 500) lastFailure = 'busy';
    return null;
  }
}

function failureMessage(reason = lastFailure) {
  if (reason === 'quota') return 'AI 今天的免費額度用完了，重置後會自動恢復。';
  if (reason === 'busy') return 'Google 的 AI 服務現在太忙了（不是你的額度用完），過幾分鐘再試一次就好。';
  if (reason === 'nokey') return '還沒設定 Gemini 金鑰，AI 功能用不了。';
  return 'AI 這次沒有處理成功，晚一點再試試。';
}

async function digestNotes(notes) {
  if (!notes.length) return null;
  return sanitizeDigest(await callJson('整理筆記', DIGEST_PROMPT, `筆記：\n${buildDigestInput(notes)}`));
}

// AI 回的歸類建議消毒：n 要在範圍內、專案要在清單裡（大小寫與空白不計），其餘丟掉；同一則只取第一個
function sanitizeAssignments(out, notes, projects) {
  if (!out || !Array.isArray(out.assignments)) return [];
  const byKey = new Map(projects.map(p => [p.toLowerCase().replace(/\s+/g, ''), p]));
  const seen = new Set();
  const result = [];
  for (const a of out.assignments) {
    if (!a || !Number.isInteger(a.n) || a.n < 1 || a.n > notes.length || seen.has(a.n)) continue;
    if (typeof a.project !== 'string') continue;
    const proj = byKey.get(a.project.toLowerCase().replace(/\s+/g, ''));
    if (!proj) continue;
    seen.add(a.n);
    result.push({ note: notes[a.n - 1], project: proj });
  }
  return result;
}

async function suggestProjects(notes, projects) {
  if (!notes.length || !projects.length) return null;
  const input = `可用的專案清單：${projects.join('、')}\n\n還沒歸專案的筆記：\n${notes.map((n, i) => `#${i + 1} ${clip(n.content, MAX_NOTE_LEN)}`).join('\n')}`;
  const out = await callJson('筆記歸類', ASSIGN_PROMPT, input);
  return out ? sanitizeAssignments(out, notes, projects) : null;
}

module.exports = {
  MAX_NOTES, selectDigestNotes, digestNotes, formatDigest, suggestProjects, failureMessage,
  _test: { buildDigestInput, sanitizeDigest, sanitizeAssignments, DIGEST_PROMPT, ASSIGN_PROMPT },
};
