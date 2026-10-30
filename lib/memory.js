// 對話記憶（階段 0：只記錄，還不影響小秘書的判斷）。
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
async function track(enabled, fn) {
  if (!enabled) return { value: await fn(), refNoteId: null };
  const box = { refNoteId: null };
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

module.exports = { isEnabled, track, setRef, record, clearAll, cleanupExpired, _test: { clip, summarize, RETENTION_DAYS } };
