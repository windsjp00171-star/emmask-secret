require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { noteLabel, buildPickFlex } = require('../lib/commands.js')._test;

test('noteLabel: 太長的內容會截斷，按鈕才放得下', () => {
  const label = noteLabel({ content: '這是一段'.padEnd(60, '很') + '長的待辦內容' });
  assert.ok(label.length <= 38);
  assert.ok(label.endsWith('…'));
});

test('buildPickFlex: 每一筆都是一個按鈕，帶著自己的 id', () => {
  const flex = buildPickFlex('要刪除哪一筆？', [{ id: 'a1', content: '同工會議' }, { id: 'a2', content: '會議記錄' }], 'delnote');
  const buttons = flex.contents.body.contents.filter(c => c.type === 'button');
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].action.data, 'act=delnote&id=a1');
  assert.equal(buttons[1].action.label, '會議記錄');
});

const { describeChange } = require('../lib/commands.js')._test;

test('describeChange: 確認卡片上講清楚要改成什麼', () => {
  const note = { content: '看牙醫', due_date: '2026-09-30T02:00:00Z' };
  assert.match(describeChange('reschedule', note, { due: '2026-10-01T07:00:00Z' }), /09\/30.10:00 → 10\/01.15:00/);
  assert.match(describeChange('rename', note, { content: '看眼科' }), /看眼科/);
  assert.match(describeChange('done', note, {}), /完成/);
  assert.match(describeChange('delete', note, {}), /刪除/);
});
