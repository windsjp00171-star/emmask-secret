// 回歸測試：getState 回傳的是「存進去的內容」，不是整列。
// 曾經有兩處（口語改動的確認卡片、刪除後的「復原」）還當成整列在讀 .value，
// 結果按鈕永遠回「已過期」「已經復原過了」。
require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const db = { notes: [], bot_state: {} };
function table(name) {
  const f = {};
  let op = 'select';
  let payload = null;
  const rows = () => (name === 'bot_state'
    ? Object.values(db.bot_state).filter(r => f.key === undefined || r.key === f.key)
    : db.notes.filter(r => Object.entries(f).every(([k, v]) => r[k] === v)));
  const o = {
    select() { return o; },
    eq(k, v) { f[k] = v; return o; },
    limit() { return o; },
    insert(p) { op = 'insert'; payload = p; return o; },
    update(p) { op = 'update'; payload = p; return o; },
    delete() { op = 'delete'; return o; },
    upsert(p) { op = 'upsert'; payload = p; return o; },
    maybeSingle() { return Promise.resolve({ data: rows()[0] || null }); },
    then(resolve) {
      if (op === 'insert') db.notes.push({ ...payload });
      else if (op === 'upsert') db.bot_state[payload.key] = payload;
      else if (op === 'update') rows().forEach(r => Object.assign(r, payload));
      else if (op === 'delete') {
        if (name === 'bot_state') delete db.bot_state[f.key];
        else db.notes = db.notes.filter(r => !rows().includes(r));
      }
      resolve({ data: op === 'select' ? rows() : null, error: null });
    },
  };
  return o;
}
require.cache[require.resolve('../lib/supabase.js')] = { exports: { from: table }, loaded: true, id: 'x', filename: 'x', children: [], paths: [] };
const { handlePostback } = require('../lib/commands.js');
const { setState } = require('../lib/botstate.js');

test('刪除後按「復原」：筆記要放得回去', async () => {
  const note = { id: 'n1', type: 'task', content: '買牛奶', is_done: false };
  db.notes = [note];
  await handlePostback('act=delnote&id=n1');
  assert.equal(db.notes.length, 0);
  const reply = await handlePostback('act=restore&id=n1');
  assert.match(String(reply), /已復原：買牛奶/);
  assert.equal(db.notes.length, 1);
});

test('口語改動的確認卡片：按「確定」要真的改', async () => {
  db.notes = [{ id: 'n2', type: 'task', content: '看牙醫', is_done: false }];
  await setState('pending:k1', { id: 'n2', action: 'done' }, 60);
  const reply = await handlePostback('act=apply&k=k1');
  assert.doesNotMatch(JSON.stringify(reply), /已經過期/);
  assert.equal(db.notes[0].is_done, true);
});

test('確認卡片只能用一次；過期或不存在會說過期', async () => {
  db.notes = [{ id: 'n3', type: 'task', content: '讀書會', is_done: false }];
  await setState('pending:k2', { id: 'n3', action: 'done' }, 60);
  await handlePostback('act=apply&k=k2');
  const again = await handlePostback('act=apply&k=k2');
  assert.match(String(again), /過期或用過了/);
});
