require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

// 假的 supabase：記下每次呼叫，結果由測試指定
const calls = [];
let nextResult = { data: [], error: null };
const chain = (table, op) => new Proxy(function () {}, {
  get: (_, k) => (k === 'then' ? (res) => res(nextResult) : (...args) => { calls.push({ table, op, k, args }); return chain(table, op); }),
});
const supabasePath = require.resolve('../lib/supabase');
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    from(table) {
      return {
        insert: (rows) => { calls.push({ table, op: 'insert', rows }); return Promise.resolve(nextResult); },
        delete: () => chain(table, 'delete'),
        select: () => chain(table, 'select'),
      };
    },
  },
};
const memory = require('../lib/memory');
const { dispatch } = require('../lib/commands');
const { clip, summarize } = memory._test;
const reset = () => { calls.length = 0; nextResult = { data: [], error: null }; };

test('summarize：字串、Flex（只取 altText）、訊息陣列；太長截斷', () => {
  assert.equal(summarize('已記下  看牙醫\n明天'), '已記下 看牙醫 明天');
  assert.equal(summarize({ type: 'flex', altText: '要改這一筆嗎？', contents: { huge: 'x'.repeat(5000) } }), '要改這一筆嗎？');
  assert.equal(summarize(['a', { type: 'text', text: 'b' }]), 'a / b');
  assert.equal(summarize(null), '');
  assert.equal(clip('字'.repeat(300)).length, 201);
});

test('track：沒開就不記；開了就能拿到這一輪動到的事項，並行的請求不會互相覆蓋', async () => {
  memory.setRef('ignored'); // 盒子外面呼叫沒事
  const off = await memory.track(false, async () => { memory.setRef('n1'); return 'r'; });
  assert.deepEqual(off, { value: 'r', refNoteId: null });

  const slow = memory.track(true, async () => { await new Promise(r => setTimeout(r, 20)); memory.setRef('A'); return 'a'; });
  const fast = memory.track(true, async () => { memory.setRef('B'); return 'b'; });
  assert.deepEqual(await fast, { value: 'b', refNoteId: 'B' });
  assert.deepEqual(await slow, { value: 'a', refNoteId: 'A' });
  assert.deepEqual(await memory.track(true, async () => 'none'), { value: 'none', refNoteId: null });
});

test('record：一輪寫兩列，user 在前、bot 在後，只有 bot 帶 ref_note_id；3 天後到期', async () => {
  reset();
  assert.equal(await memory.record({ userText: '改到下午三點', botReply: { type: 'flex', altText: '已改時間：看牙醫' }, refNoteId: 'note-1' }), true);
  const [c] = calls;
  assert.equal(c.table, 'conversation_turns');
  const [u, b] = c.rows;
  assert.deepEqual([u.role, u.text, u.ref_note_id], ['user', '改到下午三點', undefined]);
  assert.deepEqual([b.role, b.text, b.ref_note_id], ['bot', '已改時間：看牙醫', 'note-1']);
  assert.ok(new Date(u.created_at) < new Date(b.created_at));
  const days = (new Date(b.expires_at) - new Date(b.created_at)) / 86400000;
  assert.ok(Math.abs(days - 3) < 0.01, `保存天數 ${days}`);
});

test('record：postback 只有 bot 回覆；「清除記憶」本身不記；寫入失敗不丟例外', async () => {
  reset();
  await memory.record({ userText: null, botReply: '✏️ 已改時間', refNoteId: 'n' });
  assert.equal(calls[0].rows.length, 1);
  assert.equal(calls[0].rows[0].role, 'bot');

  reset();
  assert.equal(await memory.record({ userText: '清除記憶', botReply: '🧹 已清掉' }), false);
  assert.equal(calls.length, 0);

  reset();
  nextResult = { data: null, error: { message: 'relation does not exist' } };
  const origErr = console.error; console.error = () => {};
  try { assert.equal(await memory.record({ userText: 'x', botReply: 'y' }), false); } finally { console.error = origErr; }
});

test('clearAll 回傳刪掉幾則；「清除記憶」指令回覆數量，沒有就說沒有', async () => {
  reset();
  nextResult = { data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null };
  assert.equal(await memory.clearAll(), 3);
  assert.equal(await dispatch('清除記憶'), '🧹 已清掉 3 則對話記憶。');
  nextResult = { data: [], error: null };
  assert.equal(await dispatch('清除記憶'), '🧹 目前沒有記下任何對話。');
  nextResult = { data: null, error: { message: 'boom' } };
  const origErr = console.error; console.error = () => {};
  try { assert.match(await dispatch('清除記憶'), /沒成功/); } finally { console.error = origErr; }
});

test('cleanupExpired：每天只真的清一次，刪的是過期的', async () => {
  reset();
  const states = new Map();
  const statePath = require.resolve('../lib/botstate');
  const real = require.cache[statePath];
  require.cache[statePath] = { id: statePath, filename: statePath, loaded: true, exports: {
    getState: async (k) => states.get(k) || null,
    setState: async (k, v) => { states.set(k, v); },
  } };
  try {
    nextResult = { data: [{ id: 1 }, { id: 2 }], error: null };
    const now = new Date('2026-10-30T02:00:00Z');
    assert.equal(await memory.cleanupExpired(now), 2);
    assert.ok(calls.some(c => c.k === 'lt' && c.args[0] === 'expires_at'));
    reset();
    assert.equal(await memory.cleanupExpired(new Date('2026-10-30T09:00:00Z')), 0);
    assert.equal(calls.length, 0, '同一天第二次不再查資料庫');
  } finally {
    if (real) require.cache[statePath] = real; else delete require.cache[statePath];
  }
});

// ── 階段 1：接話 ──
const { shouldUseContext, buildContextBlock, resolveRef } = memory;
const NOW = Date.parse('2026-10-30T10:00:00Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const turns = [
  { role: 'bot', text: '已記下：看牙醫 11/1 10:00', ref_note_id: 'n1', created_at: ago(5) },
  { role: 'user', text: '看牙醫 11/1 10:00', ref_note_id: null, created_at: ago(5) },
  { role: 'bot', text: '今天有 2 件事', ref_note_id: null, created_at: ago(30) },
];

test('shouldUseContext：短句或接續詞 + 最近一則回覆動到事項 + 沒過期才帶', () => {
  assert.equal(shouldUseContext('改成下午三點', turns, NOW), true);
  assert.equal(shouldUseContext('明天下午在教會開很長很長的規劃會議並且要準備簡報資料', turns, NOW), false); // 長句且沒有接續詞
  assert.equal(shouldUseContext('改成下午三點', [], NOW), false);
  assert.equal(shouldUseContext('改成下午三點', [{ role: 'bot', text: 'x', ref_note_id: null, created_at: ago(1) }], NOW), false);
  assert.equal(shouldUseContext('改成下午三點', [{ ...turns[0], created_at: ago(300) }], NOW), false); // 超過 2 小時
});

test('buildContextBlock：新的在前、帶相對時間', () => {
  const b = buildContextBlock(turns, NOW);
  assert.match(b, /^\[1\] 5 分鐘前 小秘書：已記下/);
  assert.match(b, /\[3\] 30 分鐘前 小秘書：今天有/);
});

test('resolveRef：只接受範圍內的整數；使用者那一行改看緊接著的小秘書回覆', () => {
  assert.equal(resolveRef(1, turns), 'n1');
  assert.equal(resolveRef('1', turns), 'n1');
  assert.equal(resolveRef(2, turns), 'n1');
  assert.equal(resolveRef(3, turns), null);
  assert.equal(resolveRef(0, turns), null);
  assert.equal(resolveRef(9, turns), null);
  assert.equal(resolveRef(1.5, turns), null);
  assert.equal(resolveRef(null, turns), null);
  assert.equal(resolveRef('abc', turns), null);
});

// ── 引用回覆 ──
test('contextFor：使用者引用了某則訊息，就直接帶那一筆事項，不看句子長短', async () => {
  const { value } = await memory.track(true, () => memory.contextFor('把這個改成下午三點，順便把地點也換成大禮堂請幫我記一下'), { quoteRef: 'n9' });
  assert.deepEqual(value, { turns: [], block: '', quoted: true, lastRef: 'n9' });
});

test('rememberSent：沒有事項或沒有訊息 ID 就什麼都不寫', async () => {
  reset();
  await memory.rememberSent({ sentMessages: [{ id: 'm1' }] }, null);
  await memory.rememberSent({}, 'n1');
  await memory.rememberSent(undefined, 'n1');
  assert.equal(calls.length, 0);
});
