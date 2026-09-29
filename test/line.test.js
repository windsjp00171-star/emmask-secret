require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toMessages } = require('../lib/line.js')._test;

// 回歸測試：#47 修過的 bug — 陣列裡的純字串沒有被包成 { type: 'text' }，
// 導致 LINE API 收到不合法格式回 400（使用者只看到「發生錯誤，請稍後再試」）。
test('toMessages: 陣列裡的字串會被包成文字訊息物件', () => {
  const flex = { type: 'flex', altText: '選單', contents: { type: 'bubble' } };
  const out = toMessages(['文字內容', flex]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { type: 'text', text: '文字內容' });
  assert.equal(out[1].type, 'flex');
});

test('toMessages: 單一字串轉成文字訊息', () => {
  const out = toMessages('hello');
  assert.deepEqual(out, { type: 'text', text: 'hello' });
});

test('toMessages: 單一 flex 物件補上預設 altText', () => {
  const out = toMessages({ type: 'flex', contents: { type: 'bubble' } });
  assert.equal(out.altText, '訊息');
});

const { withQuickReply } = require('../lib/line.js');

test('withQuickReply: 快捷按鈕只掛在最後一則', () => {
  const out = withQuickReply(['第一則', { type: 'flex', contents: { type: 'bubble' } }]);
  assert.equal(out[0].quickReply, undefined);
  assert.ok(out[1].quickReply.items.length > 0);
  assert.equal(withQuickReply('hi').quickReply.items.length, 7);
});

test('withQuickReply: 已經有自己的快捷按鈕就不蓋掉', () => {
  const own = { type: 'text', text: '選一個', quickReply: { items: [] } };
  assert.equal(withQuickReply(own).quickReply.items.length, 0);
});

test('快捷按鈕：LINE 限制最多 13 個、label 最多 20 字', () => {
  const { QUICK_ITEMS } = require('../lib/line.js')._test;
  assert.ok(QUICK_ITEMS.length <= 13);
  for (const it of QUICK_ITEMS) assert.ok([...it.action.label].length <= 20);
});
