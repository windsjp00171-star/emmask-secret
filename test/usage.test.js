require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../lib/usage');
const { formatUsage, todayKey } = _test;

test('todayKey：用台灣日期（UTC 16:00 之後已經是隔天）', () => {
  assert.equal(todayKey(new Date('2026-10-31T15:59:00Z')), '2026-10-31');
  assert.equal(todayKey(new Date('2026-10-31T16:01:00Z')), '2026-11-01');
});

test('formatUsage：總數、各功能由多到少；有設上限才顯示約剩幾次', () => {
  const day = { total: 12, by: { '自動分類|flash-lite': 9, '問答|flash-lite': 3 } };
  const noLimit = formatUsage(day, { dayKey: '2026-10-31' });
  assert.match(noLimit, /今天已呼叫 12 次/);
  assert.ok(noLimit.indexOf('自動分類') < noLimit.indexOf('問答'));
  assert.match(noLimit, /GEMINI_DAILY_LIMIT/);
  const withLimit = formatUsage(day, { dayKey: '2026-10-31', limit: 20 });
  assert.match(withLimit, /每日上限 20 次，約剩 8 次/);
  assert.doesNotMatch(withLimit, /GEMINI_DAILY_LIMIT/);
});

test('formatUsage：用超過上限不會出現負數；額度用完旗標會提醒', () => {
  const s = formatUsage({ total: 25, by: {} }, { dayKey: '2026-10-31', limit: 20, exhausted: true });
  assert.match(s, /約剩 0 次/);
  assert.match(s, /額度用完/);
});
