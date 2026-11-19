// 本地優先分類：像「明天下午三點看牙醫」這種一看就是「某時間要做某事」的短句，
// 程式自己就判斷得了，不必每則都花一次 AI 額度。AI 留給真的需要判斷的句子
// （問句、口語改動、記帳、會議記錄、沒有時間的想法……），而且 AI 額度用完時
// 這類句子照樣能正確存成待辦，不會退回無標籤筆記。
//
// 寧可放過不要誤判：任何一條沒把握的條件不符合，就回 null 交給 AI。

// 有明確的時間點才算：幾點／幾:幾／M/D／N分鐘後／N小時後／N天後。
// 光有「今天」「明天」不算（「今天好累」不是待辦）。
const HAS_CLOCK = /\d+\s*[點:：時]|[一二兩三四五六七八九十]+\s*點|\d{1,2}\s*[\/月]\s*\d{1,2}|\d+\s*(?:分鐘|小時|個小時|天)\s*後|半\s*(?:個)?\s*小時\s*後/;
// 問句、過去式、要改動既有事項的口語、記帳，都交給 AI
const NEEDS_AI = /[?？]|嗎|呢|誰|什麼|甚麼|哪|幾|多少|怎麼|為什麼|昨天|前天|上週|上個月|剛剛|剛才|已經|了$|改到|改成|改時間|延到|延後|取消|刪掉|刪除|做完|完成|花了|\d+\s*元/;
const MAX_LEN = 60;

// 內容有提到某個已知專案就帶上（挑最長的符合，避免短名稱誤吃長名稱）
function matchProject(text, projects) {
  const lower = text.toLowerCase();
  let best = null;
  for (const p of projects || []) {
    if (p && lower.includes(p.toLowerCase()) && (!best || p.length > best.length)) best = p;
  }
  return best;
}

// due：呼叫端用 parseDueDate 解出來的 ISO。回傳跟 classify() 同格式的物件，或 null。
function localClassify(text, due, projects = []) {
  const t = String(text || '').trim();
  if (!due || !t || t.length > MAX_LEN || /\n/.test(t)) return null;
  if (!HAS_CLOCK.test(t) || NEEDS_AI.test(t)) return null;
  return { type: 'task', project: matchProject(t, projects), content: t, due_date: due, reply: null, local: true };
}

// 打字記帳「午餐 150」「咖啡 $85」「計程車 230元」：格式固定，程式自己判斷就好（AI 額度用完時也記得到帳）。
// 寧可放過：品項要看得出是花費（餐飲／交通／文具關鍵字），或金額有寫 $／元／塊，否則交給 AI。
const EXPENSE_RE = /^([^\d\s$＄]{1,10})\s*([$＄])?\s*(\d{1,6})\s*(元|塊錢?)?$/;
const EXPENSE_KEYWORDS = [
  ['餐飲', /餐|飯|便當|咖啡|飲料|茶|麵|宵夜|點心|零食|水果|超商|7-?11|全家/i],
  ['交通', /車|捷運|高鐵|台鐵|火車|油|停車|計程|uber|公車|客運|機票/i],
  ['文具', /筆|紙|文具|影印|列印|膠帶|資料夾/],
];
function localExpense(text) {
  const m = String(text || '').trim().match(EXPENSE_RE);
  if (!m) return null;
  const [, item, dollar, num, unit] = m;
  const amount = Number(num);
  if (!(amount > 0)) return null;
  const hit = EXPENSE_KEYWORDS.find(([, re]) => re.test(item));
  if (!hit && !dollar && !unit) return null;
  return { type: 'expense', content: item, amount, category: hit ? hit[0] : '其他', merchant: null, local: true };
}

module.exports = { localClassify, localExpense, _test: { matchProject, HAS_CLOCK, NEEDS_AI } };
