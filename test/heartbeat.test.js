require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../lib/heartbeat.js');
const { computeStale } = _test;

test('computeStale: 沒有任何紀錄視為逾期', () => {
  const stale = computeStale([{ name: 'remind', maxAgeMinutes: 30 }], []);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].name, 'remind');
  assert.equal(stale[0].lastRunAt, null);
});

test('computeStale: 最近才執行過，不算逾期', () => {
  const rows = [{ name: 'remind', last_run_at: new Date().toISOString() }];
  const stale = computeStale([{ name: 'remind', maxAgeMinutes: 30 }], rows);
  assert.equal(stale.length, 0);
});

test('computeStale: 超過容許時間就算逾期', () => {
  const oldTime = new Date(Date.now() - 60 * 60000).toISOString(); // 60 分鐘前
  const rows = [{ name: 'remind', last_run_at: oldTime }];
  const stale = computeStale([{ name: 'remind', maxAgeMinutes: 30 }], rows);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].lastRunAt, oldTime);
});

test('computeStale: 多個排程各自獨立判斷', () => {
  const fresh = new Date().toISOString();
  const old = new Date(Date.now() - 60 * 60000).toISOString();
  const rows = [
    { name: 'remind', last_run_at: fresh },
    { name: 'weekly', last_run_at: old },
  ];
  const checks = [
    { name: 'remind', maxAgeMinutes: 30 },
    { name: 'weekly', maxAgeMinutes: 30 },
  ];
  const stale = computeStale(checks, rows);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].name, 'weekly');
});
