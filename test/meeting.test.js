require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractActionItems } = require('../lib/commands.js')._test;

test('extractActionItems: 抓出「待辦:」開頭的行', () => {
  const content = [
    '同工會 7/14',
    '討論事項：暑期營隊籌備',
    '待辦: 阿德負責音控報價，7/20前回報',
    '待辦：小美確認營隊場地',
    '決議：下週三再開會確認細節',
  ].join('\n');
  assert.deepEqual(extractActionItems(content), [
    '阿德負責音控報價，7/20前回報',
    '小美確認營隊場地',
  ]);
});

test('extractActionItems: 支援 TODO / 行動項目 標記', () => {
  const content = 'TODO: 訂場地\n行動項目：確認講員';
  assert.deepEqual(extractActionItems(content), ['訂場地', '確認講員']);
});

test('extractActionItems: 沒有標記時回傳空陣列', () => {
  assert.deepEqual(extractActionItems('單純的會議記錄，沒有行動項目'), []);
});
