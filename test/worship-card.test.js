require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

let rows = [];
const supabasePath = require.resolve('../lib/supabase');
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    from() {
      const c = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? (res) => res({ data: rows, error: null }) : () => c) });
      return { select: () => c };
    },
  },
};
const { getMySchedule } = require('../lib/worship');

test('我的服事：封面（次數＋最近一次）＋每個日期一頁；altText 是文字版', async () => {
  rows = [
    { service_date: '2099-01-04', role: '鍵盤', person_name: '小明' },
    { service_date: '2099-01-04', role: '助唱', person_name: '小明' },
    { service_date: '2099-01-11', role: '音控', person_name: '小明' },
  ];
  const r = await getMySchedule('小明');
  assert.equal(r.type, 'flex');
  assert.equal(r.contents.contents.length, 3);
  const cover = JSON.stringify(r.contents.contents[0]);
  assert.ok(cover.includes('次服事') && cover.includes('鍵盤、助唱'));
  assert.ok(JSON.stringify(r.contents.contents[1]).includes('鍵盤'));
  assert.match(r.altText, /音控/);
});

test('我的服事：沒有服事、沒設名字時維持純文字', async () => {
  rows = [];
  assert.match(await getMySchedule('小明'), /沒有找到/);
  assert.match(await getMySchedule(''), /WORSHIP_MY_NAME/);
});
