require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRecur, nextRecurDue, recurLabel } = require('../lib/commands.js')._test;

test('parseRecur: 每半年，以指定日期為錨點，間隔6個月', () => {
  const r = parseRecur('提醒 12/1開始 每半年通知一次義全哥來更換飲水機濾心');
  assert.ok(r);
  assert.equal(r.recur, 'monthly:1:6');
  assert.equal(new Date(r.due).toISOString().slice(0, 10), '2026-12-01');
});

test('parseRecur: 每年，間隔12個月', () => {
  const r = parseRecur('提醒 每年8/1繳房屋稅');
  assert.equal(r.recur, 'monthly:1:12');
});

test('parseRecur: 每N年，間隔N*12個月', () => {
  const r = parseRecur('提醒 每2年8/1健檢');
  assert.equal(r.recur, 'monthly:1:24');
});

test('parseRecur: 每月N號維持舊行為（間隔1個月）', () => {
  const r = parseRecur('提醒 每月5號繳房租');
  assert.equal(r.recur, 'monthly:5:1');
});

test('nextRecurDue: 每半年往後推6個月', () => {
  const next = nextRecurDue('monthly:1:6', '2026-08-01T01:00:00.000Z');
  assert.equal(new Date(next).toISOString().slice(0, 10), '2027-02-01');
});

test('nextRecurDue: 舊格式（沒有間隔月數）預設每月一次，向下相容', () => {
  const next = nextRecurDue('monthly:5', '2026-08-05T01:00:00.000Z');
  assert.equal(new Date(next).toISOString().slice(0, 10), '2026-09-05');
});

test('recurLabel: 半年/年/N年/舊格式都能正確顯示', () => {
  assert.equal(recurLabel('monthly:1:6'), '每半年（1號）');
  assert.equal(recurLabel('monthly:1:12'), '每年（1號）');
  assert.equal(recurLabel('monthly:1:24'), '每2年（1號）');
  assert.equal(recurLabel('monthly:5'), '每月5號');
});
