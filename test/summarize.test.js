require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { writeSummary, _test } = require('../lib/summarize.js');
const { buildFactSheet } = _test;

test('buildFactSheet: 空資料回傳空字串', () => {
  assert.equal(buildFactSheet({}), '');
});

test('buildFactSheet: 只列出有值的欄位，略過 null/undefined', () => {
  const sheet = buildFactSheet({ doneCount: 3, pendingCount: null, weekStr: undefined });
  assert.equal(sheet, '完成件數：3');
});

test('buildFactSheet: 數字 0 要保留（0 件完成本身就是資訊）', () => {
  const sheet = buildFactSheet({ doneCount: 0 });
  assert.match(sheet, /完成件數：0/);
});

test('buildFactSheet: 清單會加上項目符號', () => {
  const sheet = buildFactSheet({ tasks: ['買菜', '寫週報'] });
  assert.match(sheet, /待辦：/);
  assert.match(sheet, /- 買菜/);
  assert.match(sheet, /- 寫週報/);
});

test('buildFactSheet: 清單超過上限會截斷並註明還有幾筆', () => {
  const many = Array.from({ length: 11 }, (_, i) => `事項${i + 1}`);
  const sheet = buildFactSheet({ tasks: many });
  assert.match(sheet, /- 事項8/);
  assert.ok(!sheet.includes('事項9'), '第 9 筆之後不該出現');
  assert.match(sheet, /另有 3 筆未列出/);
});

test('buildFactSheet: 空清單不會產生標題', () => {
  assert.equal(buildFactSheet({ tasks: [] }), '');
});

test('buildFactSheet: 停滯專案用頓號串接', () => {
  const sheet = buildFactSheet({ stalledProjects: ['教會入口', 'PitchPal'] });
  assert.match(sheet, /停滯超過 7 天的專案：教會入口、PitchPal/);
});

test('writeSummary: 沒設 API key 時回傳 null，不會丟例外', async () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    assert.equal(await writeSummary('day', { doneCount: 1 }), null);
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  }
});

test('writeSummary: 不認識的類型回傳 null', async () => {
  assert.equal(await writeSummary('yearly', { doneCount: 1 }), null);
});

test('writeSummary: 沒有任何素材時不打 API，直接回 null', async () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'dummy-key-should-not-be-used';
  const origFetch = global.fetch;
  global.fetch = () => { throw new Error('不該打 API'); };
  try {
    assert.equal(await writeSummary('day', {}), null);
  } finally {
    global.fetch = origFetch;
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});

test('writeSummary: API 失敗時回傳 null，讓簡報照常送出', async () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'dummy-key';
  const origFetch = global.fetch;
  const origError = console.error;
  console.error = () => {};
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  try {
    assert.equal(await writeSummary('day', { doneCount: 1 }), null);
  } finally {
    global.fetch = origFetch;
    console.error = origError;
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});

test('writeSummary: 會剝掉模型多加的引號', async () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'dummy-key';
  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: '「今天有三件逾期的事要處理。」' }] } }] }),
  });
  try {
    assert.equal(await writeSummary('day', { doneCount: 1 }), '今天有三件逾期的事要處理。');
  } finally {
    global.fetch = origFetch;
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
});
