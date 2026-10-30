require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert');
process.env.DASHBOARD_TOKEN = 't';
const handler = require('../api/dashboard/notes.js');

function call(query) {
  return new Promise(resolve => {
    const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); }, end() {} };
    handler({ method: 'GET', query: { token: 't', ...query }, headers: {} }, res);
  });
}

test('parse：有日期時間的句子回傳 ISO', async () => {
  const r = await call({ parse: '明天下午三點開會' });
  assert.strictEqual(r.code, 200);
  assert.ok(r.body.due && !isNaN(new Date(r.body.due)));
});

test('parse：沒有日期回 null', async () => {
  const r = await call({ parse: '買牛奶' });
  assert.strictEqual(r.body.due, null);
});
