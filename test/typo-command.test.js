require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findTypoCommand } = require('../lib/commands.js')._test;

test('findTypoCommand: 抓出差一個字的指令前綴', () => {
  assert.equal(findTypoCommand('提醐 5點看牙醫'), '提醒');
  assert.equal(findTypoCommand('待辨 買菜'), '待辦');
  assert.equal(findTypoCommand('刪徐 某事項'), '刪除');
});

test('findTypoCommand: 完全相符時不算打錯（讓正常指令流程接手）', () => {
  assert.equal(findTypoCommand('提醒 明天3點看牙醫'), null);
  assert.equal(findTypoCommand('待辦 買菜'), null);
});

test('findTypoCommand: 一般自然語言不會被誤判', () => {
  assert.equal(findTypoCommand('明天下午3點看牙醫'), null);
  assert.equal(findTypoCommand('記得買牛奶'), null);
  assert.equal(findTypoCommand('謝謝你'), null);
  assert.equal(findTypoCommand('哈囉'), null);
});
