require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../lib/ask.js');
const { buildContext, truncate, taipeiDate } = _test;

// 問答要能回答「去年」這種問題，脈絡裡的日期就一定要有年份。
// lib/time.js 的 formatTaipeiDate 只給 MM/DD，跨年度會分不出來。
test('taipeiDate: 一定要帶年份', () => {
  assert.match(taipeiDate('2025-08-20T02:00:00Z'), /2025/);
  assert.match(taipeiDate('2026-08-20T02:00:00Z'), /2026/);
});

test('taipeiDate: withTime 才附上時間', () => {
  assert.ok(!taipeiDate('2026-08-20T02:00:00Z').includes(':'));
  assert.match(taipeiDate('2026-08-20T02:00:00Z', true), /10:00/);
});

test('taipeiDate: 壞掉的日期回傳空字串，不會變成 Invalid Date', () => {
  assert.equal(taipeiDate('not-a-date'), '');
  assert.equal(taipeiDate(null), '');
});

test('buildContext: 不同年份的記錄在脈絡裡要能區分', () => {
  const out = buildContext([
    { type: 'note', content: '今年的會議', created_at: '2026-08-20T02:00:00Z' },
    { type: 'note', content: '去年的會議', created_at: '2025-08-20T02:00:00Z' },
  ]);
  assert.match(out, /2026.*今年的會議/s);
  assert.match(out, /2025.*去年的會議/s);
});

test('truncate: 短字串原樣回傳', () => {
  assert.equal(truncate('短短的', 100), '短短的');
});

test('truncate: 超長字串會截斷並加上省略號', () => {
  const out = truncate('a'.repeat(300), 200);
  assert.equal(out.length, 201); // 200 字 + …
  assert.ok(out.endsWith('…'));
});

test('truncate: 換行與連續空白會壓成單一空格', () => {
  assert.equal(truncate('第一行\n\n第二行   第三行', 100), '第一行 第二行 第三行');
});

test('truncate: 空值不會爆炸', () => {
  assert.equal(truncate(null, 10), '');
  assert.equal(truncate(undefined, 10), '');
});

test('buildContext: 空清單回傳空字串', () => {
  assert.equal(buildContext([]), '');
  assert.equal(buildContext(null), '');
});

test('buildContext: 一筆記錄包含日期、類型、內容', () => {
  const out = buildContext([
    { type: 'task', content: '買菜', created_at: '2026-08-20T02:00:00Z' },
  ]);
  assert.match(out, /task/);
  assert.match(out, /買菜/);
  assert.match(out, /2026/);
});

test('buildContext: 有專案時會併進類型欄位', () => {
  const out = buildContext([
    { type: 'note', project: '會議記錄', content: '全職同工會', created_at: '2026-08-20T02:00:00Z' },
  ]);
  assert.match(out, /note\/會議記錄/);
});

test('buildContext: 標註到期日與完成狀態', () => {
  const out = buildContext([
    {
      type: 'task', content: '報稅', created_at: '2026-08-20T02:00:00Z',
      due_date: '2026-09-02T02:00:00Z', is_done: true,
    },
  ]);
  assert.match(out, /到期/);
  assert.match(out, /已完成/);
});

test('buildContext: 未完成的記錄不會標成已完成', () => {
  const out = buildContext([
    { type: 'task', content: '報稅', created_at: '2026-08-20T02:00:00Z', is_done: false },
  ]);
  assert.ok(!out.includes('已完成'));
});

test('buildContext: 每筆內容會依 maxItemChars 截斷', () => {
  const out = buildContext(
    [{ type: 'note', content: '歌'.repeat(500), created_at: '2026-08-20T02:00:00Z' }],
    { maxItemChars: 50 }
  );
  assert.ok(out.includes('…'), '應該要截斷');
  assert.ok(out.length < 200, `整行不該太長，實際 ${out.length}`);
});

test('buildContext: 超過總字數上限時停在上限內，保留較新的記錄', () => {
  // 傳入時假設已由新到舊排序
  const notes = Array.from({ length: 50 }, (_, i) => ({
    type: 'note',
    content: `第${i}筆`.padEnd(100, '內'),
    created_at: '2026-08-20T02:00:00Z',
  }));
  const out = buildContext(notes, { maxChars: 500 });
  assert.ok(out.length <= 500, `不該超過上限，實際 ${out.length}`);
  assert.match(out, /第0筆/, '最新的那筆要留著');
  assert.ok(!out.includes('第49筆'), '最舊的那筆應該被丟掉');
});

test('buildContext: 缺 created_at 不會產生 Invalid Date', () => {
  const out = buildContext([{ type: 'note', content: '沒有日期' }]);
  assert.match(out, /未知日期/);
  assert.ok(!out.includes('Invalid'));
});
