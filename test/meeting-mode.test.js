require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

// 簡易的記憶體版 supabase：夠用來跑「會議模式」和「補充」的流程
const tables = { bot_state: [], notes: [] };
let idSeq = 0;
function query(table) {
  let rows = tables[table];
  let op = 'select', patch = null, single = false, maybe = false, orderKey = null, asc = true, lim = null, inserted = null;
  const filters = [];
  const q = {
    insert(r) { op = 'insert'; inserted = (Array.isArray(r) ? r : [r]).map(x => ({ id: `id${++idSeq}`, created_at: new Date().toISOString(), ...x })); rows.push(...inserted); return q; },
    upsert(r) { const i = rows.findIndex(x => x.key === r.key); if (i >= 0) rows[i] = r; else rows.push(r); return Promise.resolve({ error: null }); },
    update(p) { op = 'update'; patch = p; return q; },
    delete() { op = 'delete'; return q; },
    select() { return q; },
    eq(k, v) { filters.push(r => r[k] === v); return q; },
    like(k, v) { const re = new RegExp('^' + v.replace('%', '.*') + '$'); filters.push(r => re.test(r[k])); return q; },
    gte(k, v) { filters.push(r => r[k] >= v); return q; },
    order(k, o) { orderKey = k; asc = !o || o.ascending !== false; return q; },
    limit(n) { lim = n; return q; },
    single() { single = true; return q; },
    maybeSingle() { maybe = true; return q; },
    then(res) {
      let out = (op === 'insert' ? inserted : rows).filter(r => filters.every(f => f(r)));
      if (op === 'update') out.forEach(r => Object.assign(r, patch));
      if (op === 'delete') tables[table] = rows = rows.filter(r => !out.includes(r));
      if (orderKey) out = out.slice().sort((a, b) => (a[orderKey] > b[orderKey] ? 1 : -1) * (asc ? 1 : -1));
      if (lim) out = out.slice(0, lim);
      const data = single || maybe ? (out[0] || null) : out;
      return Promise.resolve({ data, error: null }).then(res);
    },
  };
  return q;
}
const supabasePath = require.resolve('../lib/supabase');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: { from: (t) => query(t) } };
const modulesPath = require.resolve('../lib/modules');
const realModules = require('../lib/modules');
realModules.loadModules = async () => {};
realModules.isOn = (id) => id !== 'memory';
const { dispatch, finalizeStaleMeeting } = require('../lib/commands');

const reset = () => { tables.bot_state = []; tables.notes = []; };
const text = (r) => (typeof r === 'string' ? r : r.altText || JSON.stringify(r));

test('會議模式：開始 → 連續傳好幾則 → 結束，合成一份會議記錄', async () => {
  reset();
  assert.match(text(await dispatch('會議開始')), /開始收會議記錄/);
  assert.match(text(await dispatch('小組長月會')), /已收 1 則/);
  assert.match(text(await dispatch('今天')), /已收 2 則/); // 連指令字也先收著
  assert.match(text(await dispatch('待辦: 訂場地')), /已收 3 則/);
  const done = text(await dispatch('會議結束'));
  assert.match(done, /小組長月會/);
  const meeting = tables.notes.find(n => n.type === 'note' && n.project === '會議記錄');
  assert.equal(meeting.content, '小組長月會\n今天\n待辦: 訂場地');
  assert.ok(tables.notes.some(n => n.type === 'task' && n.content === '訂場地'));
  assert.equal(tables.bot_state.length, 0); // 暫存都清乾淨
});

test('會議模式：沒開的時候，「會議結束」不會被當成一筆會議記錄', async () => {
  reset();
  assert.match(text(await dispatch('會議結束')), /目前沒有開著的會議模式/);
  assert.equal(tables.notes.length, 0);
});

test('會議取消：收到的都丟掉', async () => {
  reset();
  await dispatch('開始會議');
  await dispatch('隨便寫');
  assert.match(text(await dispatch('會議取消')), /取消.*1 則/);
  assert.equal(tables.notes.length, 0);
  assert.equal(tables.bot_state.length, 0);
});

test('會議模式：閒置超過 1 小時由排程自動存', async () => {
  reset();
  await dispatch('會議開始');
  await dispatch('忘記結束的會議');
  assert.equal(await finalizeStaleMeeting(Date.now() + 10 * 60 * 1000), null); // 才閒置 10 分鐘
  const r = await finalizeStaleMeeting(Date.now() + 90 * 60 * 1000);
  assert.match(text(r), /忘記結束的會議/);
  assert.equal(tables.notes.filter(n => n.project === '會議記錄').length, 1);
});

test('補充：接到最近那一筆後面', async () => {
  reset();
  tables.notes.push({ id: 'a1', type: 'note', project: null, content: '想法一', raw_text: '想法一', created_at: new Date().toISOString() });
  const r = text(await dispatch('補充 還有想法二'));
  assert.match(r, /已補充到「想法一」/);
  assert.equal(tables.notes[0].content, '想法一\n還有想法二');
});

test('補充：會議記錄後面補的「待辦:」也會變成待辦；最近一筆跳過自動拆出的待辦', async () => {
  reset();
  const t = new Date().toISOString();
  tables.notes.push({ id: 'm1', type: 'note', project: '會議記錄', content: '週會', raw_text: '週會', created_at: t });
  tables.notes.push({ id: 't1', type: 'task', project: '會議記錄', content: '買便當', raw_text: '買便當', created_at: new Date(Date.now() + 1000).toISOString() });
  await dispatch('補充：待辦: 訂場地');
  assert.equal(tables.notes.find(n => n.id === 'm1').content, '週會\n待辦: 訂場地');
  assert.ok(tables.notes.some(n => n.type === 'task' && n.content === '訂場地'));
});

test('補充：找不到可補的事項就說明', async () => {
  reset();
  assert.match(text(await dispatch('補充 什麼')), /找不到要補充的那一筆/);
});
