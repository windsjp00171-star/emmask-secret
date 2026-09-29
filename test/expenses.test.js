require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeExpenses } = require('../lib/commands.js')._test;

const row = (date, amount, category, merchant) => ({ content: merchant, created_at: `${date}T04:00:00Z`, meta: { amount, category, merchant, date } });

test('summarizeExpenses: 只算指定月份，類別小計由大到小', () => {
  const rows = [
    row('2026-09-01', 120, '餐飲', '午餐'),
    row('2026-09-15', 1500, '交通', '加油'),
    row('2026-09-20', 80, '餐飲', '咖啡'),
    row('2026-08-30', 999, '其他', '上個月的'),
  ];
  const s = summarizeExpenses(rows, '2026-09');
  assert.equal(s.total, 1700);
  assert.equal(s.count, 3);
  assert.deepEqual(s.cats, [['交通', 1500], ['餐飲', 200]]);
  assert.equal(s.recent[0].meta.merchant, '咖啡');
});

test('summarizeExpenses: 金額沒看清楚的另外計數，不算進總額', () => {
  const s = summarizeExpenses([row('2026-09-01', null, '餐飲', '收據'), row('2026-09-02', 50, null, '水')], '2026-09');
  assert.equal(s.total, 50);
  assert.equal(s.unknown, 1);
  assert.deepEqual(s.cats, [['其他', 50]]);
});
