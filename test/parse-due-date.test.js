require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDueDate } = require('../lib/commands.js')._test;

// 回歸測試：主題式批次貼「YYYY-MM-DD」完整日期格式，原本會抓不到日期、
// 誤判成今天（見對應 PR：主題式提醒支援完整日期格式解析）。
test('parseDueDate: 完整日期（含年份，用 - 分隔）', () => {
  const iso = parseDueDate('2026-08-09 13:00 ~ 14:30 第 1 堂・幸福小組的領袖');
  const parts = new Date(iso);
  assert.equal(parts.toISOString().slice(0, 10), '2026-08-09');
});

test('parseDueDate: 完整日期（用 / 分隔）', () => {
  const iso = parseDueDate('2026/09/06 13:00 在試探中得勝');
  assert.equal(new Date(iso).toISOString().slice(0, 10), '2026-09-06');
});

test('parseDueDate: 月/日（無年份）＋ 時間區間，取開頭時間', () => {
  const iso = parseDueDate('7/7 11:00 報到');
  const tp = new Date(iso);
  // 台北 11:00 = UTC 03:00
  assert.equal(tp.getUTCHours(), 3);
  assert.equal(tp.getUTCMinutes(), 0);
});

test('parseDueDate: 抓不到日期也抓不到時間時回傳 null', () => {
  assert.equal(parseDueDate('第 1 堂・幸福小組的領袖'), null);
});

test('parseDueDate: 相對時間（X分鐘後）', () => {
  const before = Date.now();
  const iso = parseDueDate('30分鐘後叫我');
  const diff = new Date(iso).getTime() - before;
  assert.ok(diff > 29 * 60 * 1000 && diff < 31 * 60 * 1000, `diff=${diff}`);
});
