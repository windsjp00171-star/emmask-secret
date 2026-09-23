require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractLeadMinutes, leadLabel } = require('../lib/commands.js')._test;

test('extractLeadMinutes: 提前N分鐘', () => {
  const { lead, text } = extractLeadMinutes('7/7 11:00 報到 提前30分鐘');
  assert.equal(lead, 30);
  assert.equal(text, '7/7 11:00 報到');
});

test('extractLeadMinutes: 提前N小時', () => {
  const { lead } = extractLeadMinutes('明天下午3點看牙醫 提前1小時');
  assert.equal(lead, 60);
});

test('extractLeadMinutes: 提前半小時', () => {
  const { lead } = extractLeadMinutes('7/7 11:00 報到 提前半小時');
  assert.equal(lead, 30);
});

test('extractLeadMinutes: 提前N天', () => {
  const { lead, text } = extractLeadMinutes('7/20特會 提前1天');
  assert.equal(lead, 1440);
  assert.equal(text, '7/20特會');
});

test('extractLeadMinutes: 沒寫提前時 lead 為 null', () => {
  const { lead } = extractLeadMinutes('7/7 11:00 報到');
  assert.equal(lead, null);
});

test('leadLabel: 依單位換算成天/小時/分鐘', () => {
  assert.equal(leadLabel(1440), '1天');
  assert.equal(leadLabel(60), '1小時');
  assert.equal(leadLabel(30), '30分鐘');
});
