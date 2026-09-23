require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitEditCommand } = require('../lib/commands.js')._test;

test('splitEditCommand: 用「改成」拆出關鍵字跟新值', () => {
  const r = splitEditCommand('看牙醫 改成 看牙醫（已改約）');
  assert.deepEqual(r, { keyword: '看牙醫', newValue: '看牙醫（已改約）' });
});

test('splitEditCommand: 新時間也是同一種語法', () => {
  const r = splitEditCommand('看牙醫 改成 明天下午3點');
  assert.deepEqual(r, { keyword: '看牙醫', newValue: '明天下午3點' });
});

test('splitEditCommand: 沒有「改成」時回傳 null', () => {
  assert.equal(splitEditCommand('看牙醫'), null);
});
