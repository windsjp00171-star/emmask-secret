require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { tokenOk, dashboardAuth } = require('../lib/auth');

function run(req, expected) {
  const old = process.env.DASHBOARD_TOKEN;
  if (expected === undefined) delete process.env.DASHBOARD_TOKEN; else process.env.DASHBOARD_TOKEN = expected;
  try {
    const out = { code: null };
    const res = { status(c) { out.code = c; return this; }, json() { return this; } };
    out.ok = dashboardAuth(req, res);
    return out;
  } finally {
    if (old === undefined) delete process.env.DASHBOARD_TOKEN; else process.env.DASHBOARD_TOKEN = old;
  }
}

test('tokenOk：對的過、錯的不過；沒設密碼或沒帶密碼一律不過', () => {
  assert.equal(tokenOk('abc', 'abc'), true);
  assert.equal(tokenOk('abd', 'abc'), false);
  assert.equal(tokenOk('abcd', 'abc'), false);
  assert.equal(tokenOk(undefined, 'abc'), false);
  assert.equal(tokenOk('', 'abc'), false);
  assert.equal(tokenOk(undefined, undefined), false); // 以前的漏洞：兩邊都是 undefined 會被放行
  assert.equal(tokenOk('abc', ''), false);
});

test('dashboardAuth：header 或網址帶對密碼才放行；環境變數沒設時什麼都不放行', () => {
  assert.equal(run({ query: {}, headers: { 'x-dashboard-token': 'pw' } }, 'pw').ok, true);
  assert.equal(run({ query: { token: 'pw' }, headers: {} }, 'pw').ok, true);
  const wrong = run({ query: {}, headers: { 'x-dashboard-token': 'no' } }, 'pw');
  assert.deepEqual([wrong.ok, wrong.code], [false, 401]);
  const noEnv = run({ query: {}, headers: {} }, undefined);
  assert.deepEqual([noEnv.ok, noEnv.code], [false, 401]);
});

test('webhook 簽章：對的過、錯的不過、沒帶不過', () => {
  process.env.LINE_CHANNEL_SECRET = 'secret';
  const { verifySignature } = require('../api/webhook')._test;
  const body = Buffer.from('{"events":[]}');
  const good = crypto.createHmac('sha256', 'secret').update(body).digest('base64');
  assert.equal(verifySignature(body, good), true);
  assert.equal(verifySignature(body, good.slice(0, -2) + 'xx'), false);
  assert.equal(verifySignature(body, 'short'), false);
  assert.equal(verifySignature(body, undefined), false);
});
