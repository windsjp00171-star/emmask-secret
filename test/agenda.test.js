require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeItems, dedupe, SYSTEM_PROMPT } = require('../lib/agenda.js')._test;

test('sanitizeItems: 正常項目會轉成帶時區的 due_date', () => {
  const out = sanitizeItems({ items: [{ content: '全台聯合禱告會 澎湖', date: '2026-09-02' }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].content, '全台聯合禱告會 澎湖');
  // 沒補時區的話 new Date() 會當 UTC 解析，日期會差一天
  assert.match(out[0].due_date, /\+08:00$/);
});

test('sanitizeItems: 補完時區後轉台北日期不會位移', () => {
  const out = sanitizeItems({ items: [{ content: 'x', date: '2026-09-02' }] });
  const d = new Date(out[0].due_date).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  assert.match(d, /9\/2|09\/02/, `應該還是 9/2，實際 ${d}`);
});

test('sanitizeItems: 日期格式不對就整筆丟掉，不要猜', () => {
  const out = sanitizeItems({ items: [
    { content: 'a', date: '9/2' },
    { content: 'b', date: '2026/09/02' },
    { content: 'c', date: '下週三' },
    { content: 'd', date: '' },
    { content: 'e' },
    { content: 'f', date: 20260902 },
  ]});
  assert.equal(out.length, 0);
});

test('sanitizeItems: 沒有內容的丟掉', () => {
  const out = sanitizeItems({ items: [
    { content: '', date: '2026-09-02' },
    { content: '   ', date: '2026-09-02' },
    { date: '2026-09-02' },
    { content: 123, date: '2026-09-02' },
  ]});
  assert.equal(out.length, 0);
});

test('sanitizeItems: 內容前後空白會修掉', () => {
  const out = sanitizeItems({ items: [{ content: '  核心同工會  ', date: '2026-09-02' }] });
  assert.equal(out[0].content, '核心同工會');
});

test('sanitizeItems: 壞掉的輸入不會爆炸', () => {
  assert.deepEqual(sanitizeItems(null), []);
  assert.deepEqual(sanitizeItems({}), []);
  assert.deepEqual(sanitizeItems({ items: null }), []);
  assert.deepEqual(sanitizeItems({ items: '不是陣列' }), []);
  assert.deepEqual(sanitizeItems({ items: [null, undefined, 'x', 5] }), []);
});

// 實際資料裡「4.8/29小組長月會」跟「8.8/29小組長月會-泉屋便當」是同一件事
test('dedupe: 同日期同內容只留一筆', () => {
  const out = dedupe([
    { content: '小組長月會', due_date: '2026-08-29T00:00:00+08:00' },
    { content: '小組長月會', due_date: '2026-08-29T00:00:00+08:00' },
  ]);
  assert.equal(out.length, 1);
});

test('dedupe: 同內容但不同日期要都留著', () => {
  const out = dedupe([
    { content: '全台聯合禱告會', due_date: '2026-09-02T00:00:00+08:00' },
    { content: '全台聯合禱告會', due_date: '2026-10-06T00:00:00+08:00' },
  ]);
  assert.equal(out.length, 2);
});

test('dedupe: 同日期不同內容要都留著', () => {
  const out = dedupe([
    { content: '核心同工會', due_date: '2026-09-02T00:00:00+08:00' },
    { content: '聯合禱告會', due_date: '2026-09-02T00:00:00+08:00' },
  ]);
  assert.equal(out.length, 2);
});

test('sanitizeItems: 重複項目會在輸出前就被合併', () => {
  const out = sanitizeItems({ items: [
    { content: '小組長月會', date: '2026-08-29' },
    { content: '小組長月會', date: '2026-08-29' },
    { content: '核心同工會', date: '2026-09-02' },
  ]});
  assert.equal(out.length, 2);
});

// 這些是實際會議記錄裡真的出現、但不該被當成日期的東西
test('SYSTEM_PROMPT: 有明確交代不要抽金額電話數量', () => {
  for (const kw of ['金額', '電話', '數量']) {
    assert.ok(SYSTEM_PROMPT.includes(kw), `提示詞應該要提到「${kw}」`);
  }
});

test('SYSTEM_PROMPT: 有交代一行多個活動要拆開', () => {
  assert.ok(SYSTEM_PROMPT.includes('好幾個不同日期'));
});
