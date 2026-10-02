require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { replyToText, needsLineConfirm } = require('../api/dashboard/notes.js')._test;

test('replyToText: 字串、文字訊息、Flex（用 altText）、陣列都轉成純文字', () => {
  assert.equal(replyToText('筆記存好了。'), '筆記存好了。');
  assert.equal(replyToText({ type: 'text', text: '今天沒有事' }), '今天沒有事');
  assert.equal(replyToText({ type: 'flex', altText: '✅ 待辦已記錄', contents: {} }), '✅ 待辦已記錄');
  assert.equal(replyToText(['a', { type: 'text', text: 'b' }, null]), 'a\nb');
  assert.equal(replyToText(null), '');
});

test('needsLineConfirm: 只有要按「確定」才生效的卡片才要提醒到 LINE', () => {
  const saved = { type: 'flex', altText: 'x', contents: { action: { data: 'act=delnote&id=1' } } };
  const confirm = { type: 'flex', altText: 'x', contents: { action: { data: 'act=apply&k=abc' } } };
  assert.equal(needsLineConfirm(saved), false);
  assert.equal(needsLineConfirm(confirm), true);
  assert.equal(needsLineConfirm('純文字'), false);
});
