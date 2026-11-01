require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePrayer, formatList } = require('../lib/prayer');

test('parsePrayer：新增、列表、蒙應允、刪除', () => {
  assert.deepEqual(parsePrayer('代禱 王小明 工作順利'), { kind: 'add', arg: '王小明 工作順利' });
  assert.deepEqual(parsePrayer('代禱本'), { kind: 'list' });
  assert.deepEqual(parsePrayer('代禱'), { kind: 'list' });
  assert.deepEqual(parsePrayer('代禱 蒙應允 王小明'), { kind: 'answer', arg: '王小明' });
  assert.deepEqual(parsePrayer('刪代禱 王小明'), { kind: 'delete', arg: '王小明' });
  assert.equal(parsePrayer('代禱事項很重要要記得'), null);
  assert.equal(parsePrayer('買牛奶'), null);
});

test('formatList：進行中依記下順序、已應允只顯示件數', () => {
  assert.match(formatList([]), /還是空的/);
  const out = formatList([
    { content: '李大華 手術平安', created_at: '2026-10-30T02:00:00Z', is_done: false },
    { content: '王小明 工作順利', created_at: '2026-10-28T02:00:00Z', is_done: false },
    { content: '陳小美 考試', created_at: '2026-10-01T02:00:00Z', is_done: true },
  ]);
  assert.ok(out.indexOf('王小明') < out.indexOf('李大華'));
  assert.doesNotMatch(out, /陳小美/);
  assert.match(out, /已蒙應允 1 件/);
  assert.match(out, /10\/28/);
});
