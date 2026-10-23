require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

const day = new Date();
const rows = {
  reminder: [{ id: 'r1', type: 'reminder', content: '感恩禮拜', due_date: new Date(day.getTime() + 3600e3).toISOString() }],
  task: [{ id: 't1', type: 'task', content: '買牛奶' }, { id: 't2', type: 'task', content: '繳電費' }],
};
function chain(result) {
  const c = new Proxy(function () {}, {
    get: (_, k) => (k === 'then' ? (res) => res(result) : () => c),
  });
  return c;
}
const supabasePath = require.resolve('../lib/supabase');
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    from: () => {
      let type = null;
      const c = new Proxy(function () {}, {
        get: (_, k) => {
          if (k === 'then') return (res) => res({ data: type ? rows[type] || [] : [{ id: 'd1' }], error: null });
          return (...a) => { if (k === 'eq' && a[0] === 'type') type = a[1]; if (k === 'eq' && a[0] === 'is_done' && a[1] === true) type = null; return c; };
        },
      });
      return { select: () => c };
    },
  },
};
const { dispatch } = require('../lib/commands');

test('今天：海報＋提醒頁＋待辦頁，頁內有 ✅ 完成鈕，altText 是文字版清單', async () => {
  const r = await dispatch('今天');
  assert.equal(r.type, 'flex');
  const pages = r.contents.contents;
  assert.equal(pages.length, 3);
  assert.ok(JSON.stringify(pages[1]).includes('act=done&id=r1'));
  assert.ok(JSON.stringify(pages[2]).includes('act=done&id=t2'));
  assert.match(r.altText, /感恩禮拜/);
  assert.match(r.altText, /買牛奶/);
  assert.ok(JSON.stringify(pages[0]).includes('2 件待辦'));
});
