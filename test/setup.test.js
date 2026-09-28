require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkEnv, REQUIRED_ENV } = require('../api/setup/status.js')._test;

test('checkEnv: 缺的必填變數標成 ok=false，並附上去哪裡拿的說明', () => {
  const out = checkEnv({ LINE_CHANNEL_SECRET: 'x', DASHBOARD_TOKEN: 'y' });
  assert.equal(out.required.length, REQUIRED_ENV.length);
  assert.equal(out.required.find(e => e.key === 'LINE_CHANNEL_SECRET').ok, true);
  const gemini = out.required.find(e => e.key === 'GEMINI_API_KEY');
  assert.equal(gemini.ok, false);
  assert.ok(gemini.hint.length > 0);
});

test('checkEnv: 空字串視為沒填', () => {
  const out = checkEnv({ GEMINI_API_KEY: '' });
  assert.equal(out.required.find(e => e.key === 'GEMINI_API_KEY').ok, false);
});
