require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractTag, tagLine } = require('../lib/hashtag');

test('extractTag：開頭或空白後面的 #標籤；網址錨點、純數字不算', () => {
  assert.equal(extractTag('#教會 音控設備報價'), '教會');
  assert.equal(extractTag('音控設備報價 #教會'), '教會');
  assert.equal(extractTag('筆記 #We R One 特會'), 'We');
  assert.equal(extractTag('看這個 https://example.com/a#section'), null);
  assert.equal(extractTag('第 #1 名'), null);
  assert.equal(extractTag('沒有標籤'), null);
  assert.equal(extractTag('#教會，今天開會'), '教會');
});

test('tagLine：筆記帶專案和 #筆記；待辦／提醒只有有專案才帶；空白專案名去掉空格', () => {
  assert.equal(tagLine({ type: 'note', project: '教會' }), '🏷 #教會 #筆記');
  assert.equal(tagLine({ type: 'note', project: null }), '🏷 #筆記');
  assert.equal(tagLine({ type: 'task', project: null }), '');
  assert.equal(tagLine({ type: 'reminder', project: 'We r one' }), '🏷 #Werone');
});
