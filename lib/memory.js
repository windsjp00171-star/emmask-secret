// 對話記憶（階段 0 記錄；階段 1 讓「改成下午三點」這類接話能指到上一件事，只影響 action 這條路）。
//
// 記下每一輪「使用者說了什麼、小秘書回了什麼」，以及那一輪動到哪一筆事項（ref_note_id）。
// 之後要讓小秘書聽懂「改到下午三點」這類接著上一句的話，靠的就是這份紀錄。
// 設計見 docs/design-conversation-memory.md。
//
// 原則：
// - 預設關閉（模組 memory），關著的時候完全不寫入。
// - 寫入失敗只記 log，絕不影響正常回覆。
// - 只存截短後的文字；Flex 卡片只存 altText，不存整包 JSON。
// - 保存 MEMORY_DAYS 天（預設 3），過期的每天清一次；「清除記憶」可以一鍵刪光。
const { AsyncLocalStorage } = require('async_hooks');
const supabase = require('./supabase');
const { loadModules, isOn } = require('./modules');

const RETENTION_DAYS = Number(process.env.MEMORY_DAYS || 3);
const MAX_TEXT = 200;
const SKIP_TEXT = new Set(['清除記憶']);

// 每個請求自己的小盒子：處理函式動到某筆事項時把 id 放進來，webhook 處理完再拿走。
// 用 AsyncLocalStorage 而不是全域變數，並行的請求才不會互相覆蓋。
const store = new AsyncLocalStorage();

function clip(s, n = MAX_TEXT) {
  const flat = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : `${flat.slice(0, n)}…`;
}

// 把小秘書的回覆（字串／Flex／訊息陣列）壓成一行文字。
function summarize(reply) {
  if (reply == null) return '';
  if (typeof reply === 'string') return clip(reply);
  if (Array.isArray(reply)) return clip(reply.map(summarize).filter(Boolean).join(' / '));
  if (reply.type === 'flex') return clip(reply.altText || '');
  if (reply.type === 'text') return clip(reply.text);
  return clip(reply.altText || reply.text || '');
}

// 處理函式呼叫：這一輪動到了這筆事項
function setRef(noteId) {
  const box = store.getStore();
  if (box && noteId) box.refNoteId = noteId;
}

// 在「請求的小盒子」裡執行 fn。enabled 為 false 就直接執行，不記任何東西。
async function track(enabled, fn, opts = {}) {
  if (!enabled) return { value: await fn(), refNoteId: null };
  const box = { refNoteId: null, quoteRef: opts.quoteRef || null };
  const value = await store.run(box, fn);
  return { value, refNoteId: box.refNoteId };
}

async function isEnabled() {
  try {
    await loadModules();
    return isOn('memory');
  } catch (err) {
    console.error('memory.isEnabled error:', err);
    return false;
  }
}

// 記一輪：userText 可以是 null（例如按按鈕的 postback 只有小秘書的回覆）
async function record({ userText, botReply, refNoteId }) {
  try {
    const user = clip(userText);
    const bot = summarize(botReply);
    if (SKIP_TEXT.has(user)) return false;
    const now = Date.now();
    const expires_at = new Date(now + RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
    const rows = [];
    // 明確給 created_at：同一個 insert 裡的預設時間會一模一樣，順序就分不出來了
    if (user) rows.push({ role: 'user', text: user, created_at: new Date(now - 1).toISOString(), expires_at });
    if (bot) rows.push({ role: 'bot', text: bot, ref_note_id: refNoteId || null, created_at: new Date(now).toISOString(), expires_at });
    if (!rows.length) return false;
    const { error } = await supabase.from('conversation_turns').insert(rows);
    if (error) {
      console.error('memory.record error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('memory.record error:', err);
    return false;
  }
}

// 一鍵刪光。回傳刪了幾則。
async function clearAll() {
  const { data, error } = await supabase.from('conversation_turns').delete().gte('created_at', '1970-01-01').select('id');
  if (error) throw new Error(`清除記憶失敗：${error.message}`);
  return (data || []).length;
}

// 由每 5 分鐘一次的提醒排程呼叫，每天只真的清一次（跟語音檔清理同一個做法）。
// 不管記憶開不開都要清：關掉之後，已經記下的也要照時間過期。
async function cleanupExpired(now = new Date()) {
  const { getState, setState } = require('./botstate');
  const { taipeiKey } = require('./time');
  const key = `memory_cleanup:${taipeiKey(now.toISOString())}`;
  if (await getState(key)) return 0;
  await setState(key, { at: now.toISOString() }, 2 * 24 * 60);
  const { data, error } = await supabase.from('conversation_turns').delete().lt('expires_at', now.toISOString()).select('id');
  if (error) return 0; // 資料表還沒建（沒用過記憶）就算了
  return (data || []).length;
}

// ── 引用回覆：使用者在 LINE 長按小秘書的某則訊息按「回覆」，就能明確指到那一筆事項 ──
// 小秘書送出訊息時，把「訊息 ID → 事項 id」記下來；之後收到的訊息若帶 quotedMessageId 就查得到。
async function rememberSent(resp, noteId) {
  try {
    const ids = ((resp && resp.sentMessages) || []).map(m => m && m.id).filter(Boolean);
    if (!noteId || !ids.length) return;
    const { setState } = require('./botstate');
    await Promise.all(ids.map(id => setState(`msgref:${id}`, { note: noteId }, RETENTION_DAYS * 24 * 60)));
  } catch (err) {
    console.error('memory.rememberSent error:', err);
  }
}

async function refForMessage(messageId) {
  try {
    if (!messageId) return null;
    const { getState } = require('./botstate');
    const v = await getState(`msgref:${messageId}`);
    console.log(`[quote] quotedMessageId=${messageId} found=${!!(v && v.note)}`);
    return v && v.note ? v.note : null;
  } catch (err) {
    console.error('memory.refForMessage error:', err);
    return null;
  }
}

// 這個請求裡使用者引用回覆的那筆事項（沒引用就是 null）
function currentQuoteRef() {
  const box = store.getStore();
  return (box && box.quoteRef) || null;
}

// 最近一則「動到某筆事項」的小秘書回覆，中間夾了別的指令也找得到
async function lastRefId(now = Date.now()) {
  if (!(await isEnabled())) return null;
  const turns = await recentTurns(now);
  const hit = turns.find(r => r.role === 'bot' && r.ref_note_id && now - new Date(r.created_at).getTime() <= FOLLOWUP_MIN * 60 * 1000);
  return hit ? hit.ref_note_id : null;
}

// ── 階段 1：接話 ──
const FOLLOWUP_MIN = Number(process.env.MEMORY_FOLLOWUP_MIN || 120); // 超過這麼久沒動就不當接話
const FOLLOWUP_MAX_LEN = 20;
const FOLLOWUP_WORDS = /那個|那件|那天|剛剛|剛才|它|這個|這件|再|也|還有|順便|改成|改到|延到|同樣|取消|刪掉|做完|完成了/;
const CONTEXT_TURNS = 6;

// 最近的對話，新的在前（最多 CONTEXT_TURNS 則）。讀不到回空陣列。
async function recentTurns(now = Date.now()) {
  try {
    const { data, error } = await supabase.from('conversation_turns')
      .select('role,text,ref_note_id,created_at')
      .gt('expires_at', new Date(now).toISOString())
      .order('created_at', { ascending: false })
      .limit(CONTEXT_TURNS);
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('memory.recentTurns error:', err);
    return [];
  }
}

// 閘門：句子短或有接續詞，而且最近一則小秘書回覆動到某筆事項、還沒過太久
function shouldUseContext(text, turns, now = Date.now()) {
  const t = String(text || '').trim();
  if (!t || !turns || !turns.length) return false;
  if (!(t.length <= FOLLOWUP_MAX_LEN || FOLLOWUP_WORDS.test(t))) return false;
  const lastBot = turns.find(r => r.role === 'bot');
  if (!lastBot || !lastBot.ref_note_id) return false;
  return now - new Date(lastBot.created_at).getTime() <= FOLLOWUP_MIN * 60 * 1000;
}

function relTime(iso, now) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  if (min < 24 * 60) return `${Math.round(min / 60)} 小時前`;
  return `${Math.round(min / 1440)} 天前`;
}

// 給 AI 看的「最近對話」，編號 1 是最新，總長約 800 字內
function buildContextBlock(turns, now = Date.now()) {
  let used = 0;
  const lines = [];
  turns.forEach((r, i) => {
    const line = `[${i + 1}] ${relTime(r.created_at, now)} ${r.role === 'user' ? '使用者' : '小秘書'}：${clip(r.text, 120)}`;
    if (used + line.length > 800) return;
    used += line.length;
    lines.push(line);
  });
  return lines.join('\n');
}

// 把 AI 回的 ref_turn 對回事項 id。必須是範圍內的整數；使用者那一行沒有事項，就看緊接著的小秘書回覆
function resolveRef(refTurn, turns) {
  const n = typeof refTurn === 'string' && /^\d+$/.test(refTurn.trim()) ? Number(refTurn) : refTurn;
  if (!Number.isInteger(n) || n < 1 || n > turns.length) return null;
  const row = turns[n - 1];
  if (row.ref_note_id) return row.ref_note_id;
  const newer = turns[n - 2];
  return newer && newer.role === 'bot' && newer.ref_note_id ? newer.ref_note_id : null;
}

// 這句話要不要帶上下文、帶什麼。不帶就回 null（行為跟以前完全一樣）。
async function contextFor(text) {
  const box = store.getStore();
  if (box && box.quoteRef) return { turns: [], block: '', quoted: true, lastRef: box.quoteRef };
  const t = String(text || '').trim();
  if (!t || !(t.length <= FOLLOWUP_MAX_LEN || FOLLOWUP_WORDS.test(t))) return null; // 先用句子本身擋掉，不必每則都查資料庫
  if (!(await isEnabled())) return null;
  const now = Date.now();
  const turns = await recentTurns(now);
  if (!shouldUseContext(text, turns, now)) return null;
  const lastBot = turns.find(r => r.role === 'bot');
  return { turns, block: buildContextBlock(turns, now), lastRef: lastBot.ref_note_id };
}

module.exports = { currentQuoteRef, lastRefId, rememberSent, refForMessage, recentTurns, shouldUseContext, buildContextBlock, resolveRef, contextFor, isEnabled, track, setRef, record, clearAll, cleanupExpired, _test: { clip, summarize, RETENTION_DAYS } };
