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

module.exports = { localClassify, _test: { matchProject, HAS_CLOCK, NEEDS_AI } };
