require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSafeUrl, extractTitle } = require('../api/unfurl.js')._test;

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
