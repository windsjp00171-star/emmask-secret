require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPath, EXT_BY_TYPE } = require('../lib/storage.js')._test;
const { isExpired } = require('../lib/botstate.js')._test;

test('buildPath: 依台北時間分年/月資料夾', () => {
  const p = buildPath('image/jpeg', new Date('2026-08-28T02:00:00Z')); // 台北 10:00
  assert.match(p, /^2026\/08\//);
});

test('buildPath: 跨日的 UTC 時間要用台北日期分類', () => {
  // UTC 2026-08-28 17:00 → 台北已經是 08-29
  const p = buildPath('image/jpeg', new Date('2026-08-28T17:00:00Z'));
  assert.match(p, /^2026\/08\/20260829-/);
});

test('buildPath: 依 content type 給副檔名', () => {
  assert.match(buildPath('image/png', new Date()), /\.png$/);
  assert.match(buildPath('image/webp', new Date()), /\.webp$/);
  assert.match(buildPath('image/gif', new Date()), /\.gif$/);
});

test('buildPath: 不認得的 content type 退回 jpg', () => {
  assert.match(buildPath('image/tiff', new Date()), /\.jpg$/);
  assert.match(buildPath(undefined, new Date()), /\.jpg$/);
});

test('buildPath: 同一毫秒產生的路徑不會撞在一起', () => {
  const now = new Date();
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(buildPath('image/jpeg', now));
  assert.equal(seen.size, 200, '每次都該是不同路徑');
});

test('EXT_BY_TYPE: 涵蓋 bucket 允許的所有格式', () => {
  for (const t of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
    assert.ok(EXT_BY_TYPE[t], `${t} 應該要有副檔名`);
  }
});

test('isExpired: 沒有資料視為過期', () => {
  assert.equal(isExpired(null), true);
  assert.equal(isExpired(undefined), true);
});

test('isExpired: 沒設 expires_at 就不會過期', () => {
  assert.equal(isExpired({ value: { on: true } }), false);
});

test('isExpired: 到期時間在未來就還沒過期', () => {
  const future = new Date(Date.now() + 60000).toISOString();
  assert.equal(isExpired({ expires_at: future }), false);
});

test('isExpired: 到期時間已過就算過期', () => {
  const past = new Date(Date.now() - 60000).toISOString();
  assert.equal(isExpired({ expires_at: past }), true);
});

test('isExpired: 剛好到期的瞬間算過期', () => {
  const now = new Date('2026-08-28T05:00:00Z');
  assert.equal(isExpired({ expires_at: now.toISOString() }, now), true);
});
