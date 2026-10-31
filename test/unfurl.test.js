require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSafeUrl, extractTitle, fetchTitle } = require('../api/unfurl.js')._test;

test('isSafeUrl: 允許一般 http/https 網址', () => {
  assert.equal(isSafeUrl('https://example.com/page'), true);
  assert.equal(isSafeUrl('http://example.com'), true);
});

test('isSafeUrl: 擋掉非 http/https 協定', () => {
  assert.equal(isSafeUrl('file:///etc/passwd'), false);
  assert.equal(isSafeUrl('ftp://example.com'), false);
});

test('isSafeUrl: 擋掉 localhost 跟內網位址', () => {
  assert.equal(isSafeUrl('http://localhost:3000'), false);
  assert.equal(isSafeUrl('http://127.0.0.1'), false);
  assert.equal(isSafeUrl('http://192.168.1.1'), false);
  assert.equal(isSafeUrl('http://10.0.0.5'), false);
  assert.equal(isSafeUrl('http://172.16.0.1'), false);
  assert.equal(isSafeUrl('http://169.254.169.254'), false); // cloud metadata endpoint
});

test('isSafeUrl: 不是合法網址格式就回傳 false', () => {
  assert.equal(isSafeUrl('not a url'), false);
});

test('extractTitle: 優先抓 og:title', () => {
  const html = '<html><head><meta property="og:title" content="測試標題"><title>備用標題</title></head></html>';
  assert.equal(extractTitle(html), '測試標題');
});

test('extractTitle: 沒有 og:title 就退回 <title>', () => {
  const html = '<html><head><title>純標題</title></head></html>';
  assert.equal(extractTitle(html), '純標題');
});

test('extractTitle: 都沒有就回傳 null', () => {
  assert.equal(extractTitle('<html><head></head></html>'), null);
});

test('extractTitle: 會解碼常見 HTML entity', () => {
  const html = '<title>A &amp; B &quot;測試&quot;</title>';
  assert.equal(extractTitle(html), 'A & B "測試"');
});

test('isSafeUrl：IPv6 本機／私有位址、127 整段、.localhost 都擋掉', () => {
  for (const u of ['http://[::1]/', 'http://[fd12:3456::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/',
    'http://127.1.2.3/', 'http://app.localhost/', 'http://0.0.0.0/', 'http://169.254.169.254/latest/meta-data/']) {
    assert.equal(isSafeUrl(u), false, u);
  }
  assert.equal(isSafeUrl('https://example.com/a'), true);
});

test('fetchTitle：轉址到內網位址就放棄，轉到一般網址才繼續', async () => {
  const orig = global.fetch;
  try {
    const seen = [];
    global.fetch = async (url) => {
      seen.push(String(url));
      if (String(url) === 'https://short.example/x') return { status: 302, ok: false, headers: { get: () => 'http://169.254.169.254/latest/meta-data/' } };
      throw new Error('不該連到這裡：' + url);
    };
    assert.equal(await fetchTitle('https://short.example/x'), null);
    assert.deepEqual(seen, ['https://short.example/x']);

    const enc = new TextEncoder();
    global.fetch = async (url) => (String(url) === 'https://a.example/'
      ? { status: 301, ok: false, headers: { get: () => '/final' } }
      : { status: 200, ok: true, headers: { get: () => null }, body: { getReader: () => { let done = false; return { read: async () => (done ? { done: true } : (done = true, { done: false, value: enc.encode('<head><title>終點</title></head>') })), cancel: async () => {} }; } } });
    assert.equal(await fetchTitle('https://a.example/'), '終點');
  } finally {
    global.fetch = orig;
  }
});
