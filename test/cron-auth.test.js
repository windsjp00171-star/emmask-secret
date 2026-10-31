require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { cronAuth } = require('../lib/cron-auth');

function withSecret(secret, fn) {
  const old = process.env.CRON_SECRET;
  if (secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = secret;
  try { return fn(); } finally { if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old; }
}

test('cronAuth：沒設 CRON_SECRET 一律拒絕（以前會放行）', () => {
  assert.equal(withSecret(undefined, () => cronAuth({ headers: {}, query: {} })), false);
  assert.equal(withSecret('', () => cronAuth({ headers: {}, query: {} })), false);
  assert.equal(withSecret(undefined, () => cronAuth({ headers: { authorization: 'Bearer ' }, query: { token: '' } })), false);
});

test('cronAuth：Bearer header 或 ?token= 帶對才放行', () => {
  assert.equal(withSecret('s3', () => cronAuth({ headers: { authorization: 'Bearer s3' }, query: {} })), true);
  assert.equal(withSecret('s3', () => cronAuth({ headers: {}, query: { token: 's3' } })), true);
  assert.equal(withSecret('s3', () => cronAuth({ headers: { authorization: 'Bearer nope' }, query: {} })), false);
  assert.equal(withSecret('s3', () => cronAuth({ headers: { authorization: 's3' }, query: {} })), false);
  assert.equal(withSecret('s3', () => cronAuth({ headers: {}, query: { token: 'x' } })), false);
  assert.equal(withSecret('s3', () => cronAuth({ headers: {}, query: {} })), false);
});
