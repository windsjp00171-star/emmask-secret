require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');

// ===== AI 回的時間補時區 =====
// gemini-3.1-flash-lite 實測會回 "2026-09-14T14:30:00" 這種沒有時區的字串，
// 不補 +08:00 的話 new Date() 會當 UTC 解析，海報上的 14:30 會變成 22:30。
const { normalizeTaipeiISO } = require('../lib/time.js');

test('normalizeTaipeiISO: 沒有時區的時間會補上 +08:00', () => {
  assert.equal(normalizeTaipeiISO('2026-09-14T14:30:00'), '2026-09-14T14:30:00+08:00');
  assert.equal(normalizeTaipeiISO('2026-09-14T14:30'), '2026-09-14T14:30:00+08:00');
});

test('normalizeTaipeiISO: 補完之後轉台北時間不會偏移', () => {
  const iso = normalizeTaipeiISO('2026-09-14T14:30:00');
  const shown = new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  assert.match(shown, /14:30/, `應該還是 14:30，實際 ${shown}`);
});

test('normalizeTaipeiISO: 已經有時區的字串原樣保留', () => {
  assert.equal(normalizeTaipeiISO('2026-09-14T14:30:00+08:00'), '2026-09-14T14:30:00+08:00');
  assert.equal(normalizeTaipeiISO('2026-09-14T06:30:00Z'), '2026-09-14T06:30:00Z');
});

test('normalizeTaipeiISO: 只有日期就當台北時間的當天 00:00', () => {
  assert.equal(normalizeTaipeiISO('2026-09-14'), '2026-09-14T00:00:00+08:00');
});

test('normalizeTaipeiISO: 空值與非字串回傳 null', () => {
  assert.equal(normalizeTaipeiISO(null), null);
  assert.equal(normalizeTaipeiISO(undefined), null);
  assert.equal(normalizeTaipeiISO(''), null);
  assert.equal(normalizeTaipeiISO(12345), null);
});
