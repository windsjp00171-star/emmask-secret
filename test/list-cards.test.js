require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

// 依呼叫順序回傳事先排好的結果，不管查詢條件
let queue = [];
const supabasePath = require.resolve('../lib/supabase');
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    from(table) {
      const data = table === 'notes' ? (queue.shift() || []) : [];
      const c = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? (res) => res({ data, error: null }) : () => c) });
      return { select: () => c };
    },
  },
};
const { dispatch } = require('../lib/commands');

test('本週：海報＋有日期頁＋沒期限頁；altText 是文字版清單', async () => {
  queue = [
    [{ id: 'r1', type: 'reminder', content: '感恩禮拜', due_date: '2026-10-24T05:00:00Z' }],
    [{ id: 't1', type: 'task', content: '買牛奶' }],
  ];
  const r = await dispatch('本週');
  assert.equal(r.type, 'flex');
  assert.equal(r.contents.contents.length, 3);
  assert.ok(JSON.stringify(r.contents.contents[1]).includes('act=done&id=r1'));
  assert.match(r.altText, /感恩禮拜/);
  assert.match(r.altText, /買牛奶/);
  assert.ok(JSON.stringify(r.contents.contents[0]).includes('2'));
});

test('本週：什麼都沒有時只有一張海報', async () => {
  queue = [[], []];
  const r = await dispatch('本週');
  assert.equal(r.contents.type, 'bubble');
  assert.match(r.altText, /沒有待辦事項/);
});

test('搜尋：每頁 5 筆，12 筆分 3 頁；找不到仍回純文字', async () => {
  queue = [Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, type: 'note', content: `牛奶筆記${i}`, created_at: '2026-10-01T00:00:00Z' }))];
  const r = await dispatch('搜尋 牛奶');
  assert.equal(r.type, 'flex');
  assert.equal(r.contents.contents.length, 3);
  assert.match(r.altText, /找到 12 筆/);
  queue = [[]];
  assert.match(await dispatch('搜尋 不存在的'), /找不到/);
});

test('本週：七天日曆格，今天深綠、有事的那天可以點進去看', async () => {
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  queue = [[{ id: 'r1', type: 'reminder', content: '今天的事', due_date: new Date().toISOString() }], []];
  const r = await dispatch('本週');
  const cover = r.contents.type === 'carousel' ? r.contents.contents[0] : r.contents;
  const json = JSON.stringify(cover);
  assert.ok(json.includes(`act=todosbydate&date=${todayKey}`));
  assert.equal((json.match(/"flex":1,"alignItems":"center"/g) || []).length, 7);
  assert.ok(json.includes('#16513d')); // 今天那格是深綠
});

test('收工：今天和明天都沒事就回一句話；有事就是收工回顧卡', async () => {
  queue = [[], []];
  const none = await dispatch('收工');
  assert.equal(typeof none, 'string');
  assert.match(none, /沒有/);
  queue = [
    [{ id: 't1', type: 'task', content: '買牛奶', due_date: null }],
    [{ id: 'r1', type: 'reminder', content: '感恩禮拜 https://example.com/x', due_date: '2099-01-01T05:00:00Z' }],
  ];
  const r = await dispatch('收工回顧');
  assert.equal(r.type, 'flex');
  assert.match(r.altText, /收工回顧/);
});
