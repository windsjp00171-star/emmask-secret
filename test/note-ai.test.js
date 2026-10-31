require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

// ── 替身：Gemini 與額度旗標 ──
let aiReply = '{}';
let aiCalls = 0;
const geminiPath = require.resolve('../lib/gemini');
const realGemini = require('../lib/gemini');
require.cache[geminiPath].exports = { ...realGemini, callGemini: async () => { aiCalls++; if (aiReply instanceof Error) throw aiReply; return aiReply; } };
const quotaPath = require.resolve('../lib/quota');
require.cache[quotaPath] = { id: quotaPath, filename: quotaPath, loaded: true, exports: { isExhausted: async () => false, markExhausted: async () => {} } };
process.env.GEMINI_API_KEY = 'k';

// ── 替身：記憶體版 supabase ──
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
    in(k, vs) { filters.push(r => vs.includes(r[k])); return q; },
    is(k, v) { filters.push(r => (r[k] == null ? null : r[k]) === v); return q; },
    like(k, v) { const re = new RegExp('^' + v.replace('%', '.*') + '$'); filters.push(r => re.test(r[k])); return q; },
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
      return Promise.resolve({ data: single || maybe ? (out[0] || null) : out, error: null }).then(res);
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
const projectsPath = require.resolve('../lib/projects');
require.cache[projectsPath] = { id: projectsPath, filename: projectsPath, loaded: true, exports: { getKnownProjects: async () => ['We r one', '會計系統', '收藏'] } };

const noteAi = require('../lib/note-ai');
const { dispatch, handlePostback } = require('../lib/commands');
const { sanitizeDigest, sanitizeAssignments } = noteAi._test;
const reset = () => { tables.bot_state = []; tables.notes = []; aiCalls = 0; aiReply = '{}'; };
const text = (r) => (typeof r === 'string' ? r : JSON.stringify(r));
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const note = (id, content, extra = {}) => ({ id, type: 'note', project: null, content, created_at: daysAgo(1), ...extra });

test('selectDigestNotes：期間內的筆記，排除系統專案與非筆記，新的在前、可指定專案', () => {
  const rows = [
    note('a', '甲', { created_at: daysAgo(1) }),
    note('b', '乙', { created_at: daysAgo(2), project: 'We r one' }),
    note('c', '丙（太舊）', { created_at: daysAgo(20) }),
    note('d', '丁（收藏）', { project: '收藏' }),
    { id: 'e', type: 'task', content: '待辦', created_at: daysAgo(1) },
    note('f', '   '),
  ];
  const all = noteAi.selectDigestNotes(rows, { days: 7, systemProjects: ['收藏'] });
  assert.deepEqual(all.map(n => n.id), ['a', 'b']);
  const one = noteAi.selectDigestNotes(rows, { days: 7, project: 'we R one', systemProjects: ['收藏'] });
  assert.deepEqual(one.map(n => n.id), ['b']);
  assert.equal(noteAi.selectDigestNotes(rows, { days: 30, systemProjects: ['收藏'] }).length, 3);
});

test('sanitizeDigest：去掉不合格的主題、限制數量與長度；空的回 null', () => {
  const d = sanitizeDigest({ themes: [
    { title: '主題一', points: ['a（#1）', 3, '', 'b', 'c', 'd', 'e'] },
    { title: '', points: ['x'] },
    { title: '沒有重點', points: [] },
    'bad',
  ] });
  assert.equal(d.themes.length, 1);
  assert.equal(d.themes[0].points.length, 4);
  assert.equal(sanitizeDigest({ themes: [] }), null);
  assert.equal(sanitizeDigest(null), null);
});

test('sanitizeAssignments：只接受清單裡的專案、編號在範圍內、同一則只取第一個', () => {
  const notes = [note('a', '1'), note('b', '2'), note('c', '3')];
  const r = sanitizeAssignments({ assignments: [
    { n: 1, project: 'we R one' },
    { n: 1, project: '會計系統' },
    { n: 2, project: '亂編的專案' },
    { n: 3, project: null },
    { n: 9, project: '會計系統' },
    { n: 'x', project: '會計系統' },
  ] }, notes, ['We r one', '會計系統']);
  assert.deepEqual(r.map(x => [x.note.id, x.project]), [['a', 'We r one']]);
});

test('整理筆記：筆記太少不叫 AI；夠多就整理並標明僅供參考', async () => {
  reset();
  tables.notes.push(note('a', '一'), note('b', '二'));
  assert.match(text(await dispatch('整理筆記')), /只有 2 則/);
  assert.equal(aiCalls, 0);
  tables.notes.push(note('c', '三'), note('d', '四'));
  aiReply = '{"themes":[{"title":"特會","points":["報到 8:30（#1）"]}]}';
  const r = await dispatch('整理這週的筆記');
  assert.match(r, /這週的筆記整理（4 則，AI 整理，僅供參考）/);
  assert.match(r, /【特會】\n• 報到 8:30/);
  assert.equal(aiCalls, 1);
});

test('整理筆記：AI 失敗時說明，不丟錯；沒筆記時直接說沒有', async () => {
  reset();
  assert.match(await dispatch('整理筆記'), /沒有筆記可以整理/);
  tables.notes.push(note('a', '一'), note('b', '二'), note('c', '三'));
  aiReply = new Error('boom');
  assert.match(await dispatch('整理筆記'), /AI 現在沒辦法處理/);
});

test('歸類筆記：給建議卡 → 按確認才寫入 → 可復原；使用者自己改過的不蓋掉', async () => {
  reset();
  tables.notes.push(note('a', '特會報到流程'), note('b', '隨手想法'), note('c', '奉獻報表', { project: '會計系統' }));
  aiReply = '{"assignments":[{"n":1,"project":"We r one"},{"n":2,"project":null}]}';
  const card = await dispatch('歸類筆記');
  assert.match(text(card), /特會報到流程 → We r one/);
  assert.match(text(card), /另外 1 則沒把握/);
  assert.equal(tables.notes.find(n => n.id === 'a').project, null); // 還沒按確認，不能動
  const key = text(card).match(/act=assignproj&k=(\w+)/)[1];

  const done = await handlePostback(`act=assignproj&k=${key}`);
  assert.match(text(done), /已歸類 1 則/);
  assert.equal(tables.notes.find(n => n.id === 'a').project, 'We r one');
  assert.match(await handlePostback(`act=assignproj&k=${key}`), /已經過期或用過了/);

  const undone = await handlePostback(`act=undoassign&k=${key}`);
  assert.match(undone, /已復原 1 則/);
  assert.equal(tables.notes.find(n => n.id === 'a').project, null);
});

test('歸類筆記：確認前使用者已自己歸了專案，就不覆蓋', async () => {
  reset();
  tables.notes.push(note('a', '特會報到流程'));
  aiReply = '{"assignments":[{"n":1,"project":"We r one"}]}';
  const key = text(await dispatch('歸類筆記')).match(/act=assignproj&k=(\w+)/)[1];
  tables.notes[0].project = '會計系統'; // 使用者在後台自己改了
  assert.match(await handlePostback(`act=assignproj&k=${key}`), /已經被歸類過了/);
  assert.equal(tables.notes[0].project, '會計系統');
});

test('歸類筆記：都有專案就說一聲；AI 沒把握就維持原樣', async () => {
  reset();
  tables.notes.push(note('a', '有專案', { project: '會計系統' }));
  assert.match(await dispatch('歸類筆記'), /都已經有專案了/);
  tables.notes.push(note('b', '亂七八糟'));
  aiReply = '{"assignments":[{"n":1,"project":"不存在的專案"}]}';
  assert.match(await dispatch('歸類筆記'), /沒有把握放進現有專案/);
});
