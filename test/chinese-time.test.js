require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeChineseNumbers, parseDueDate } = require('../lib/time.js');
const { extractLeadMinutes } = require('../lib/commands.js')._test;

test('normalizeChineseNumbers: 時間單位前的中文數字轉成阿拉伯數字', () => {
  assert.equal(normalizeChineseNumbers('下午四點'), '下午4點');
  assert.equal(normalizeChineseNumbers('十點半'), '10點半');
  assert.equal(normalizeChineseNumbers('晚上十一點'), '晚上11點');
  assert.equal(normalizeChineseNumbers('兩個小時後'), '2個小時後');
  assert.equal(normalizeChineseNumbers('三天後'), '3天後');
});

test('normalizeChineseNumbers: 星期幾不會被轉掉', () => {
  assert.equal(normalizeChineseNumbers('每週三讀書會'), '每週三讀書會');
  assert.equal(normalizeChineseNumbers('星期一開會'), '星期一開會');
});

test('parseDueDate: 下午四點＝16:00', () => {
  const iso = parseDueDate('明天下午四點看牙醫');
  const hour = new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false });
  assert.equal(Number(hour), 16);
});

test('parseDueDate: 下週一是下個星期的週一（1～7 天後）', () => {
  const due = new Date(parseDueDate('下週一交報告'));
  const wd = due.toLocaleDateString('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' });
  assert.equal(wd, 'Mon');
  const days = (due - Date.now()) / 86400000;
  assert.ok(days > 0 && days <= 7, `差了 ${days} 天`);
});

test('extractLeadMinutes: 提前一小時／提前兩天', () => {
  assert.equal(extractLeadMinutes('看牙醫 提前一小時').lead, 60);
  assert.equal(extractLeadMinutes('特會 提前兩天').lead, 2880);
});
