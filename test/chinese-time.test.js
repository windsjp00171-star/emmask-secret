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

// 沒講上午／下午時的猜法：「2點」不能變成凌晨兩點
const { taipeiPartsOf } = require('../lib/time.js');
const hourOf = (t) => taipeiPartsOf(parseDueDate(t)).hour;

test('parseDueDate: 沒講上午下午，1～6 點當作下午', () => {
  assert.equal(hourOf('明天2點開會'), 14);
  assert.equal(hourOf('明天6點吃飯'), 18);
  assert.equal(hourOf('後天2:30看診'), 14);
});

test('parseDueDate: 7～11 點（非今天）維持早上；12 點是中午；24 小時制不動', () => {
  assert.equal(hourOf('明天9點禱告會'), 9);
  assert.equal(hourOf('明天11點開會'), 11);
  assert.equal(hourOf('明天12點午餐'), 12);
  assert.equal(hourOf('明天14點開會'), 14);
});

test('parseDueDate: 有講時段就照時段，不被猜測蓋掉', () => {
  assert.equal(hourOf('明天凌晨2點搭機'), 2);
  assert.equal(hourOf('明天早上6點跑步'), 6);
  assert.equal(hourOf('明天晚上8點聚會'), 20);
  assert.equal(hourOf('明天03:00起床'), 3);
});
