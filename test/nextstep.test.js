require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveWhen, buildNextStepRows, isEveningWindow, pickStaleTasks } = require('../lib/nextstep.js');
const { buildSaveReply } = require('../lib/commands.js')._test;
const { taipeiKey } = require('../lib/time.js');

// 2026-10-23 是週五（台北）
const FRI = new Date('2026-10-23T04:00:00Z');

test('resolveWhen: 明早 9 點、週六 9 點、下週一 9 點（台北時間）', () => {
  assert.equal(resolveWhen('tomorrow', FRI), '2026-10-24T01:00:00.000Z');
  assert.equal(resolveWhen('weekend', FRI), '2026-10-24T01:00:00.000Z');
  assert.equal(resolveWhen('monday', FRI), '2026-10-26T01:00:00.000Z');
});

test('resolveWhen: 今天就是週六時，「週六」排下一個週六', () => {
  const sat = new Date('2026-10-24T04:00:00Z');
  assert.equal(taipeiKey(resolveWhen('weekend', sat)), '2026-10-31');
});

test('resolveWhen: 1 小時後、不認得的選項回 null', () => {
  assert.equal(resolveWhen('hour', FRI), '2026-10-23T05:00:00.000Z');
  assert.equal(resolveWhen('xyz', FRI), null);
});

test('buildNextStepRows: 沒時間的待辦給時間選項，每顆都帶 id', () => {
  const rows = buildNextStepRows({ id: 'n1', type: 'task', due_date: null });
  const json = JSON.stringify(rows);
  assert.match(json, /act=setdue&when=tomorrow&id=n1/);
  assert.match(json, /"type":"datetimepicker"/);
});

test('buildNextStepRows: 有時間的給提前通知＋改時間；已設提前就不再給', () => {
  const withLead = JSON.stringify(buildNextStepRows({ id: 'n1', type: 'reminder', due_date: 'x' }));
  assert.match(withLead, /act=lead&m=60&id=n1/);
  const already = JSON.stringify(buildNextStepRows({ id: 'n1', type: 'reminder', due_date: 'x', remind_lead_minutes: 10 }));
  assert.doesNotMatch(already, /act=lead/);
  assert.match(already, /datetimepicker/);
});

test('buildNextStepRows: 筆記／記帳不給時間按鈕', () => {
  assert.deepEqual(buildNextStepRows({ id: 'n1', type: 'note' }), []);
  assert.deepEqual(buildNextStepRows({ id: 'n1', type: 'expense' }), []);
});

test('buildSaveReply: 待辦存檔卡片 footer 同時有下一步與撤銷', () => {
  const card = buildSaveReply({ id: 'n1', type: 'task', content: '買牛奶', due_date: null });
  const json = JSON.stringify(card.contents.footer);
  assert.match(json, /act=setdue/);
  assert.match(json, /act=delnote&id=n1/);
});

test('isEveningWindow: 21 點以後才發', () => {
  assert.equal(isEveningWindow(20), false);
  assert.equal(isEveningWindow(21), true);
  assert.equal(isEveningWindow(23), true);
  assert.equal(isEveningWindow(19, 18), true);
});

test('pickStaleTasks: 只挑沒日期、超過 3 天的，最舊的先、最多 3 筆', () => {
  const now = Date.parse('2026-10-23T00:00:00Z');
  const day = 24 * 3600 * 1000;
  const mk = (id, ago, extra = {}) => ({ id, created_at: new Date(now - ago * day).toISOString(), due_date: null, ...extra });
  const out = pickStaleTasks([mk('a', 10), mk('b', 5), mk('c', 1), mk('d', 20, { due_date: 'x' }), mk('e', 30, { recur: 'daily' }), mk('f', 4), mk('g', 6)], now);
  assert.deepEqual(out.map(n => n.id), ['a', 'g', 'b']);
});

test('buildNextStepRows: 有時間的卡片多一顆語音提醒；已開啟就不再給', () => {
  assert.match(JSON.stringify(buildNextStepRows({ id: 'n1', type: 'reminder', due_date: 'x' })), /act=voice&id=n1/);
  assert.doesNotMatch(JSON.stringify(buildNextStepRows({ id: 'n1', type: 'reminder', due_date: 'x', meta: { voice: true } })), /act=voice/);
});
