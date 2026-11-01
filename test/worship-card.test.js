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

const { asCard } = require('../lib/worship');

test('asCard：指定日名單 → 封面（日期）＋職位清單；altText 是文字版', () => {
  const text = '⛪ 10/25（週日）服事名單\n信息：師母\n助唱：雅竹、蕙芯';
  const r = asCard(text);
  assert.equal(r.type, 'flex');
  assert.equal(r.contents.contents.length, 2);
  const cover = JSON.stringify(r.contents.contents[0]);
  assert.ok(cover.includes('10/25') && cover.includes('2 個職位'));
  assert.ok(JSON.stringify(r.contents.contents[1]).includes('雅竹、蕙芯'));
  assert.match(r.altText, /師母/);
});

test('asCard：打錯日期附帶的提醒文字會保留在封面', () => {
  const r = asCard('10/3 是週五啦 😏 10/4（週日）才是，服事表在這：\n\n⛪ 10/4（週日）服事名單\n信息：師母');
  assert.ok(JSON.stringify(r.contents.contents[0]).includes('才是'));
});

test('asCard：整月日期有按鈕可以點開當天名單', () => {
  const r = asCard('⛪ 10 月服事日期\n• 10/4（週日）\n• 10/11（週日）\n\n輸入「服事表 10/4」看當天完整名單');
  const btns = r.contents.contents[1].footer.contents;
  assert.equal(btns.length, 2);
  assert.equal(btns[0].action.text, '服事表 10/4');
});

test('asCard：我的整月服事', () => {
  const r = asCard('⛪ 小明　10 月服事\n• 10/4（週日）：鍵盤、助唱');
  assert.ok(JSON.stringify(r.contents.contents[0]).includes('次服事'));
  assert.ok(JSON.stringify(r.contents.contents[1]).includes('鍵盤、助唱'));
});

test('asCard：找不到、格式錯誤等文字原樣回傳', () => {
  assert.equal(asCard('找不到 10/3 的服事表，可能尚未排定。'), '找不到 10/3 的服事表，可能尚未排定。');
  assert.deepEqual(asCard({ type: 'flex' }), { type: 'flex' });
});

test('pickWeeklyTargets：週二早上 8 點後推未來兩週內最近的兩個主日；其他時間不推', () => {
  const { _test } = require('../lib/worship');
  const dates = ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22'];
  // 2026-11-03 是週二；台北 08:30 = UTC 00:30
  assert.deepEqual(_test.pickWeeklyTargets(new Date('2026-11-03T00:30:00Z'), dates), ['2026-11-08', '2026-11-15']);
  assert.deepEqual(_test.pickWeeklyTargets(new Date('2026-11-03T00:30:00Z'), ['2026-11-15', '2026-11-30']), ['2026-11-15']);
  assert.deepEqual(_test.pickWeeklyTargets(new Date('2026-11-02T23:30:00Z'), dates), []); // 台北 07:30，還沒到 8 點
  assert.deepEqual(_test.pickWeeklyTargets(new Date('2026-11-04T01:00:00Z'), dates), []); // 週三
  assert.deepEqual(_test.pickWeeklyTargets(new Date('2026-11-03T00:30:00Z'), ['2026-11-30']), []); // 兩週內沒有主日
});
