require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchPrefixCommand } = require('../lib/commands.js')._test;

test('matchPrefixCommand: 標準格式', () => {
  assert.deepEqual(matchPrefixCommand('提醒 買牛奶'), { type: 'reminder', content: '買牛奶' });
  assert.deepEqual(matchPrefixCommand('待辦 洗車'), { type: 'task', content: '洗車' });
  assert.deepEqual(matchPrefixCommand('筆記 今天天氣不錯'), { type: 'note', content: '今天天氣不錯' });
});

test('matchPrefixCommand: 提醒我 / 提醒: 這種變化', () => {
  assert.deepEqual(matchPrefixCommand('提醒我 買牛奶'), { type: 'reminder', content: '買牛奶' });
  assert.deepEqual(matchPrefixCommand('提醒:買牛奶'), { type: 'reminder', content: '買牛奶' });
});

test('matchPrefixCommand: 口語開頭（幫我/麻煩/請/順便）都認得', () => {
  assert.deepEqual(matchPrefixCommand('幫我提醒 買牛奶'), { type: 'reminder', content: '買牛奶' });
  assert.deepEqual(matchPrefixCommand('麻煩提醒我 開會'), { type: 'reminder', content: '開會' });
  assert.deepEqual(matchPrefixCommand('請提醒 倒垃圾'), { type: 'reminder', content: '倒垃圾' });
  assert.deepEqual(matchPrefixCommand('順便待辦 洗車'), { type: 'task', content: '洗車' });
});

test('matchPrefixCommand: 「記得 xxx」沒講提醒兩個字也當提醒', () => {
  assert.deepEqual(matchPrefixCommand('記得買牛奶'), { type: 'reminder', content: '買牛奶' });
  assert.deepEqual(matchPrefixCommand('記得 買牛奶'), { type: 'reminder', content: '買牛奶' });
  assert.deepEqual(matchPrefixCommand('記得提醒我 買牛奶'), { type: 'reminder', content: '買牛奶' });
});

test('matchPrefixCommand: 對不到就回傳 null，不誤判一般句子', () => {
  assert.equal(matchPrefixCommand('明天下午3點看牙醫'), null);
  assert.equal(matchPrefixCommand('謝謝你'), null);
  assert.equal(matchPrefixCommand('記得'), null); // 沒有內容
});
