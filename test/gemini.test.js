require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
// 用量計數會經過 supabase（底層也是 fetch），會混進這裡數「打了幾次 Gemini」的假 fetch，所以換成空的
const usagePath = require.resolve('../lib/usage');
const usageCalls = [];
require.cache[usagePath] = { id: usagePath, filename: usagePath, loaded: true, exports: { note: async (model, label) => { usageCalls.push([model, label]); } } };
const { callGemini, extractJson, _test } = require('../lib/gemini.js');
const { isRetryable } = _test;

process.env.GEMINI_RETRY_DELAY_MS = '1'; // 測試不用真的等

function okResponse(text) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
}
function errResponse(status) {
  return { ok: false, status, text: async () => `boom ${status}` };
}

// 用假的 fetch 跑一段，結束後還原
async function withFetch(impl, fn) {
  const orig = global.fetch;
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  global.fetch = impl;
  try {
    return await fn();
  } finally {
    global.fetch = orig;
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
  }
}

test('isRetryable: 429 與 5xx 要重試', () => {
  assert.equal(isRetryable(429), true);
  assert.equal(isRetryable(503), true);
  assert.equal(isRetryable(500), true);
});

test('isRetryable: 4xx（除了 429）不重試', () => {
  assert.equal(isRetryable(400), false);
  assert.equal(isRetryable(404), false);
  assert.equal(isRetryable(403), false);
});

test('callGemini: 正常回傳文字', async () => {
  await withFetch(async () => okResponse('嗨'), async () => {
    assert.equal(await callGemini({ parts: [{ text: 'x' }] }), '嗨');
  });
});

test('callGemini: 503 之後重試一次就成功', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls++; return calls === 1 ? errResponse(503) : okResponse('第二次成功'); },
    async () => {
      assert.equal(await callGemini({ parts: [{ text: 'x' }] }), '第二次成功');
      assert.equal(calls, 2, '應該打了兩次');
    }
  );
});

test('callGemini: 連續兩次 503 就放棄並丟出錯誤', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls++; return errResponse(503); },
    async () => {
      await assert.rejects(() => callGemini({ parts: [{ text: 'x' }] }), /503/);
      assert.equal(calls, 2, '最多只重試一次');
    }
  );
});

test('callGemini: 400 這種不可重試的錯誤立刻丟出，不浪費第二次額度', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls++; return errResponse(400); },
    async () => {
      await assert.rejects(() => callGemini({ parts: [{ text: 'x' }] }), /400/);
      assert.equal(calls, 1, '不該重試');
    }
  );
});

test('callGemini: 沒設 API key 直接丟錯', async () => {
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(() => callGemini({ parts: [{ text: 'x' }] }), /GEMINI_API_KEY/);
  } finally {
    if (key !== undefined) process.env.GEMINI_API_KEY = key;
  }
});

test('callGemini: json 為 true 時會要求 JSON 輸出', async () => {
  let sent;
  await withFetch(
    async (url, opts) => { sent = JSON.parse(opts.body); return okResponse('{}'); },
    async () => {
      await callGemini({ parts: [{ text: 'x' }], json: true });
      assert.equal(sent.generationConfig.responseMimeType, 'application/json');
    }
  );
});

test('callGemini: 有 system 才送 system_instruction', async () => {
  let sent;
  await withFetch(
    async (url, opts) => { sent = JSON.parse(opts.body); return okResponse('ok'); },
    async () => {
      await callGemini({ parts: [{ text: 'x' }] });
      assert.equal(sent.system_instruction, undefined);
      await callGemini({ system: '你是助理', parts: [{ text: 'x' }] });
      assert.equal(sent.system_instruction.parts[0].text, '你是助理');
    }
  );
});

test('callGemini: 回應沒有文字時丟錯且不重試', async () => {
  let calls = 0;
  await withFetch(
    async () => { calls++; return { ok: true, json: async () => ({ candidates: [] }) }; },
    async () => {
      await assert.rejects(() => callGemini({ parts: [{ text: 'x' }] }), /No text/);
      assert.equal(calls, 1);
    }
  );
});

test('extractJson: 從夾雜文字的輸出裡挖出 JSON', () => {
  assert.deepEqual(extractJson('這是結果：{"a":1} 以上'), { a: 1 });
});

test('extractJson: 找不到 JSON 就丟錯', () => {
  assert.throws(() => extractJson('完全沒有'), /No JSON/);
});

test('callGemini: 每次送出都記一次用量，被 429 擋掉的不算', async () => {
  usageCalls.length = 0;
  let n = 0;
  await withFetch(async () => (++n === 1 ? errResponse(429) : okResponse('ok')), () => callGemini({ parts: [{ text: 'x' }], label: '測試' }));
  assert.equal(usageCalls.length, 1);
  assert.equal(usageCalls[0][1], '測試');
});

test('callGemini: 主模型忙線（503）時，第二次改試備用模型；額度 429 不換', async () => {
  usageCalls.length = 0;
  const urls = [];
  await withFetch(async (url) => { urls.push(String(url)); return urls.length === 1 ? errResponse(503) : okResponse('ok'); },
    () => callGemini({ parts: [{ text: 'x' }], label: '測試' }));
  assert.equal(urls.length, 2);
  assert.ok(urls[0].includes(`/models/${require('../lib/gemini.js').MODEL}:`));
  assert.ok(urls[1].includes('gemini-2.5-flash-lite'), urls[1]);
  assert.equal(usageCalls[usageCalls.length - 1][0], 'gemini-2.5-flash-lite'); // 用量記在實際用的模型上

  const urls429 = [];
  await withFetch(async (url) => { urls429.push(String(url)); return urls429.length === 1 ? errResponse(429) : okResponse('ok'); },
    () => callGemini({ parts: [{ text: 'x' }] }));
  assert.ok(!urls429[1].includes('gemini-2.5-flash-lite'));

  const urlsCustom = [];
  await withFetch(async (url) => { urlsCustom.push(String(url)); return urlsCustom.length === 1 ? errResponse(503) : okResponse('ok'); },
    () => callGemini({ parts: [{ text: 'x' }], model: 'custom-model' }));
  assert.ok(urlsCustom[1].includes('custom-model')); // 呼叫端指定模型時不擅自換
});
