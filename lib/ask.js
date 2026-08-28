// 問答式查詢：「上個月我跟誰開過會？」這種問句，用自己的記錄回答。
//
// 這是 RAG（Retrieval-Augmented Generation）的做法，只是「檢索」這一段
// 現在還不需要向量搜尋：全部記錄截斷後約一萬多字，整個資料庫塞進 prompt
// 也只佔 Gemini context 的 1%。等到資料量真的塞不下（見 MAX_CONTEXT_CHARS），
// 才需要換成語意檢索。在那之前，多做一層向量只會更慢、更貴、還更容易撈錯。
const supabase = require('./supabase');
const { callGemini, isDailyQuotaError } = require('./gemini');
const { markExhausted, SHORT: QUOTA_SHORT } = require('./quota');

// 單筆截斷長度。
// 這裡刻意放寬：會議記錄常常是十幾條的長筆記，而那正是最常被問到的東西
// （實測截到 200 字時，「吉他課費用怎麼算」就答不出來了，因為答案在第 10 條）。
// 目前全部記錄未截斷也才 17,600 字，離 MAX_CONTEXT_CHARS 還很遠，沒有必要省。
const MAX_ITEM_CHARS = 1000;
// 整份脈絡的上限。以目前資料量（241 筆截斷後約 11,500 字）離上限還很遠，
// 這是給未來成長用的安全閥：超過就從最舊的開始丟。
const MAX_CONTEXT_CHARS = 60000;
// 一次最多撈幾筆
const MAX_NOTES = 400;

const SYSTEM_PROMPT = `你是 EmmArk 小秘書，正在幫使用者查詢他自己的記錄。

下面會給你使用者的記錄清單，每筆格式是：
[建立日期] 類型/專案 ｜ 內容 ｜ 到期日 ｜ 狀態

回答規則：
- 只能根據提供的記錄回答，絕對不要編造記錄裡沒有的事
- 找不到相關記錄就直說「找不到相關記錄」，不要硬掰
- 繁體中文，語氣自然像助理
- 簡潔，通常 1-3 句話；需要列項目時才用條列
- 提到某筆記錄時，把日期一起講出來，方便使用者對照
- 使用者問的「上個月」「這週」等相對時間，請用記錄上的日期自己換算`;

// 這裡刻意不用 lib/time.js 的 formatTaipeiDate：那個給畫面顯示用，只有 MM/DD。
// 問答要能回答「去年」「前年」這種問題，年份不能省，不然模型分不出跨年度的記錄。
function taipeiDate(iso, withTime) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toLocaleString('zh-TW', opts);
}

function truncate(s, n) {
  if (!s) return '';
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : `${flat.slice(0, n)}…`;
}

// 把 notes 壓成給模型看的脈絡。純函式，方便測試。
// 傳入時假設已按 created_at 由新到舊排序；超過字數上限時保留較新的。
function buildContext(notes, opts = {}) {
  const maxChars = opts.maxChars || MAX_CONTEXT_CHARS;
  const maxItem = opts.maxItemChars || MAX_ITEM_CHARS;
  const lines = [];
  let used = 0;

  for (const n of notes || []) {
    const created = taipeiDate(n.created_at) || '未知日期';
    const kind = n.project ? `${n.type}/${n.project}` : n.type;
    const due = n.due_date ? ` ｜ 到期 ${taipeiDate(n.due_date, true)}` : '';
    const state = n.is_done ? ' ｜ 已完成' : '';
    const line = `[${created}] ${kind} ｜ ${truncate(n.content, maxItem)}${due}${state}`;

    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }

  return lines.join('\n');
}

async function askQuestion(question) {
  const q = String(question || '').trim();
  if (!q) return '想問什麼？例如「問 上個月我跟誰開過會」。';
  if (!process.env.GEMINI_API_KEY) {
    return '問答功能需要設定 GEMINI_API_KEY 才能用，可以先用「搜尋 關鍵字」找記錄。';
  }

  const { data: notes, error } = await supabase
    .from('notes')
    .select('type, project, content, due_date, is_done, created_at')
    .order('created_at', { ascending: false })
    .limit(MAX_NOTES);

  if (error) {
    console.error('Ask query error:', error);
    return '查記錄的時候出了點問題，稍後再試試。';
  }
  if (!notes || notes.length === 0) return '目前還沒有任何記錄可以查詢。';

  const today = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const context = buildContext(notes);
  const userMessage = `今天是：${today}\n\n=== 我的記錄 ===\n${context}\n\n=== 問題 ===\n${q}`;

  try {
    const text = await callGemini({ system: SYSTEM_PROMPT, parts: [{ text: userMessage }] });
    return `💬 ${text.trim()}`;
  } catch (err) {
    console.error('Ask error:', err);
    if (isDailyQuotaError(err)) {
      await markExhausted();
      return `⚠️ ${QUOTA_SHORT}\n找記錄可以先用「搜尋 關鍵字」。`;
    }
    return '問答功能暫時不能用，可以先用「搜尋 關鍵字」找記錄。';
  }
}

module.exports = { askQuestion, _test: { buildContext, truncate, taipeiDate } };
