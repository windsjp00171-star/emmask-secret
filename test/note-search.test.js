require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const ns = require('../lib/note-search');

// 2026-11-06（週五）台北中午
const NOW = new Date('2026-11-06T04:00:00Z');
const iso = (d) => new Date(`${d}T04:00:00Z`).toISOString();
const rows = [
  { id: '1', type: 'note', content: '音控設備報價\n阿德說下週給三家比價', project: '教會', created_at: iso('2026-11-05') },
  { id: '2', type: 'note', content: '全職同工會\n討論事項：音控人力不足，報價單要補', project: '會議記錄', created_at: iso('2026-10-14') },
  { id: '3', type: 'note', content: '買菜清單 牛奶', project: null, created_at: iso('2026-09-10') },
  { id: '4', type: 'task', content: '訂音控線材', project: null, is_done: true, created_at: iso('2026-10-30') },
];

test('parseQuery：時間詞拿掉、剩下的當關鍵字', () => {
  assert.deepEqual(ns.parseQuery('音控 報價', NOW).words, ['音控', '報價']);
  const q = ns.parseQuery('音控 上個月', NOW);
  assert.deepEqual(q.words, ['音控']);
  assert.deepEqual([q.range.from, q.range.to], ['2026-10-01', '2026-10-31']);
  assert.equal(ns.parseQuery('10月', NOW).range.from, '2026-10-01');
  assert.equal(ns.parseQuery('12月', NOW).range.from, '2025-12-01'); // 還沒到的月份＝去年
  const w = ns.parseQuery('本週', NOW).range; // 11/6 是週五，週日起算
  assert.deepEqual([w.from, w.to], ['2026-11-01', '2026-11-07']);
  assert.equal(ns.parseQuery('最近7天', NOW).range.from, '2026-10-31');
});

test('search：每個字都要有（內容或專案），新的在前，可限時間', () => {
  const ids = (q) => ns.search(rows, ns.parseQuery(q, NOW)).map(n => n.id);
  assert.deepEqual(ids('音控 報價'), ['1', '2']);
  assert.deepEqual(ids('音控'), ['1', '4', '2']);
  assert.deepEqual(ids('會議記錄 音控'), ['2']); // 專案名也算
  assert.deepEqual(ids('音控 上個月'), ['4', '2']);
  assert.deepEqual(ids('上個月'), ['4', '2']); // 只有時間：列出那段時間的全部
  assert.deepEqual(ids('不存在'), []);
});

test('snippet：比對處在後面時顯示前後文', () => {
  const long = '很長的開頭'.repeat(30) + '音控報價在這裡' + '結尾'.repeat(30);
  const s = ns.snippet(long, ['音控']);
  assert.match(s, /音控報價在這裡/);
  assert.ok(s.startsWith('…'));
  assert.equal(ns.snippet('短短的', ['短']), '短短的');
});

test('buildCards：每頁 5 筆、點一筆看全文；找不到有說明', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i), type: 'note', content: `音控 ${i}`, project: null, created_at: iso('2026-11-05') }));
  const q = ns.parseQuery('音控', NOW);
  const card = ns.buildCards(q, ns.search(many, q), { note: '筆記' });
  assert.equal(card.contents.type, 'carousel');
  assert.equal(card.contents.contents.length, 3);
  assert.match(JSON.stringify(card.contents.contents[0]), /act=notefull&id=/);
  assert.match(ns.emptyReply(q), /找不到「音控」/);
});

test('LINE 指令：「找 …」走新搜尋，點一筆看全文；找歌不被攔走', async () => {
  const supabasePath = require.resolve('../lib/supabase');
  const store = rows.map(r => ({ ...r, is_done: !!r.is_done }));
  const fake = {
    from() {
      const f = [];
      const q = {
        select() { return q; },
        neq(k, v) { f.push(r => r[k] !== v); return q; },
        eq(k, v) { f.push(r => r[k] === v); return q; },
        order() { return q; }, limit() { return q; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        upsert() { return Promise.resolve({ error: null }); },
        is() { return q; }, in() { return q; },
        then(res, rej) { return Promise.resolve({ data: store.filter(r => f.every(x => x(r))), error: null }).then(res, rej); },
      };
      return q;
    },
  };
  const old = require.cache[supabasePath];
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
  delete require.cache[require.resolve('../lib/commands.js')];
  try {
    const { dispatch, handlePostback } = require('../lib/commands.js');
    const out = await dispatch('找 音控 報價');
    assert.equal(out.type, 'flex');
    assert.match(JSON.stringify(out), /act=notefull&id=1/);
    assert.match(JSON.stringify(out), /act=notefull&id=2/);
    const none = await dispatch('找 不存在的字');
    assert.match(String(none), /找不到/);
    const full = await handlePostback('act=notefull&id=2');
    assert.match(String(full), /討論事項：音控人力不足/);
    assert.match(String(full), /會議記錄/);
  } finally {
    if (old) require.cache[supabasePath] = old; else delete require.cache[supabasePath];
    delete require.cache[require.resolve('../lib/commands.js')];
  }
});
