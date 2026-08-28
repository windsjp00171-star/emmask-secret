require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isQuotaError, isDailyQuotaError } = require('../lib/gemini.js');

function err(status, message) {
  const e = new Error(message || `Gemini HTTP ${status}`);
  e.status = status;
  return e;
}

test('isQuotaError: 429 才算額度問題', () => {
  assert.equal(isQuotaError(err(429)), true);
  assert.equal(isQuotaError(err(503)), false);
  assert.equal(isQuotaError(err(400)), false);
});

test('isQuotaError: 空值不會爆炸', () => {
  assert.equal(isQuotaError(null), false);
  assert.equal(isQuotaError(undefined), false);
  assert.equal(isQuotaError(new Error('沒有 status')), false);
});

// 每日額度用完要等重置，每分鐘太頻繁幾秒後就好，兩者處理方式完全不同
test('isDailyQuotaError: 錯誤內容有 PerDay 才算每日額度用完', () => {
  const daily = err(429, 'Gemini HTTP 429: {"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}');
  assert.equal(isDailyQuotaError(daily), true);
});

test('isDailyQuotaError: 每分鐘頻率限制不算每日額度用完', () => {
  const perMin = err(429, 'Gemini HTTP 429: {"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}');
  assert.equal(isDailyQuotaError(perMin), false);
});

test('isDailyQuotaError: 非 429 就算內容有 PerDay 也不算', () => {
  assert.equal(isDailyQuotaError(err(500, 'PerDay')), false);
});

test('isDailyQuotaError: 空值不會爆炸', () => {
  assert.equal(isDailyQuotaError(null), false);
  assert.equal(isDailyQuotaError(err(429, undefined)), false);
});
