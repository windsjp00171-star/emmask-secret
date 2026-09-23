require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitize, KINDS } = require('../lib/vision.js')._test;
const { buildImageReply, IMAGE_KIND_TARGET } = require('../lib/commands.js')._test;

test('sanitize: found=false 時保留模型給的說明', () => {
  const out = sanitize({ found: false, note: '這是一張風景照' });
  assert.equal(out.found, false);
  assert.equal(out.note, '這是一張風景照');
});

test('sanitize: 完全壞掉的輸入不會丟例外', () => {
  assert.equal(sanitize(null).found, false);
  assert.equal(sanitize('字串').found, false);
  assert.equal(sanitize(undefined).found, false);
});

test('sanitize: 不認識的 kind 退回 event', () => {
  const out = sanitize({ found: true, kind: '亂寫的', items: [{ content: '聚會' }] });
  assert.equal(out.kind, 'event');
});

test('sanitize: 認得的 kind 會保留', () => {
  for (const k of KINDS) {
    const out = sanitize({ found: true, kind: k, items: [{ content: 'x' }] });
    assert.equal(out.kind, k);
  }
});

test('sanitize: 濾掉沒有 content 的項目', () => {
  const out = sanitize({
    found: true, kind: 'event',
    items: [{ content: '有效' }, { content: '' }, { due_date: '2026-01-01' }, null],
  });
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].content, '有效');
});

test('sanitize: 全部項目都無效時視為找不到', () => {
  const out = sanitize({ found: true, kind: 'event', items: [{ content: '  ' }] });
  assert.equal(out.found, false);
});

test('sanitize: meta 不是物件就丟掉，不寫進資料庫', () => {
  const out = sanitize({
    found: true, kind: 'receipt',
    items: [
      { content: 'a', meta: '不是物件' },
      { content: 'b', meta: ['陣列也不行'] },
      { content: 'c', meta: { amount: 100 } },
    ],
  });
  assert.equal(out.items[0].meta, null);
  assert.equal(out.items[1].meta, null);
  assert.deepEqual(out.items[2].meta, { amount: 100 });
});

test('sanitize: due_date 非字串一律轉 null', () => {
  const out = sanitize({ found: true, kind: 'event', items: [{ content: 'a', due_date: 12345 }] });
  assert.equal(out.items[0].due_date, null);
});

test('IMAGE_KIND_TARGET: 每一種 kind 都有對應的 type', () => {
  for (const k of KINDS) {
    assert.ok(IMAGE_KIND_TARGET[k], `${k} 應該要有對應設定`);
    assert.ok(IMAGE_KIND_TARGET[k].type, `${k} 應該要有 type`);
  }
});

test('buildImageReply: 收據會列出店家、金額與分類', () => {
  const out = buildImageReply('receipt', [
    { content: '午餐', meta: { amount: 250, merchant: '泉屋便當', category: '餐飲' } },
  ]);
  assert.match(out, /泉屋便當/);
  assert.match(out, /\$250/);
  assert.match(out, /餐飲/);
});

test('buildImageReply: 多張收據會算合計', () => {
  const out = buildImageReply('receipt', [
    { content: 'a', meta: { amount: 250, merchant: 'A' } },
    { content: 'b', meta: { amount: 1300, merchant: 'B' } },
  ]);
  assert.match(out, /合計/);
  assert.match(out, /1,550/); // 會加上千分位
});

test('buildImageReply: 收據金額沒看清楚時不會顯示 $null', () => {
  const out = buildImageReply('receipt', [{ content: 'a', meta: { merchant: 'A', amount: null } }]);
  assert.ok(!out.includes('null'));
  assert.match(out, /金額沒看清楚/);
});

test('buildImageReply: 名片會列出電話與 email', () => {
  const out = buildImageReply('contact', [
    { content: '黃先生', meta: { name: '黃先生', org: '安南靈糧堂', title: '行政', phone: '0966023100', email: 'a@b.c' } },
  ]);
  assert.match(out, /黃先生/);
  assert.match(out, /安南靈糧堂/);
  assert.match(out, /0966023100/);
  assert.match(out, /a@b\.c/);
});

test('buildImageReply: 名片缺欄位時不會印出 undefined', () => {
  const out = buildImageReply('contact', [{ content: '某人', meta: { name: '某人' } }]);
  assert.ok(!out.includes('undefined'));
  assert.ok(!out.includes('null'));
});

test('buildImageReply: 白板會把待辦列出來', () => {
  const out = buildImageReply('board', [
    { content: '會議記錄全文', meta: { todos: ['訂便當', '寄通知'] } },
  ]);
  assert.match(out, /2 件待辦/);
  assert.match(out, /訂便當/);
  assert.match(out, /寄通知/);
});

test('buildImageReply: 白板沒有待辦時不會出現待辦區塊', () => {
  const out = buildImageReply('board', [{ content: '純記錄', meta: { todos: [] } }]);
  assert.ok(!out.includes('待辦'));
});

test('buildImageReply: 活動維持原本的提醒格式', () => {
  const out = buildImageReply('event', [
    { content: '秋季特會', due_date: '2026-09-14T06:30:00Z' },
  ]);
  assert.match(out, /建立了 1 個提醒/);
  assert.match(out, /秋季特會/);
});

test('buildImageReply: 活動沒抓到時間會提示補時間', () => {
  const out = buildImageReply('event', [{ content: '某聚會', due_date: null }]);
  assert.match(out, /沒抓到時間/);
});

test('buildImageReply: meta 為 null 時各類別都不會爆炸', () => {
  for (const k of KINDS) {
    const out = buildImageReply(k, [{ content: 'x', due_date: null, meta: null }]);
    assert.ok(typeof out === 'string' && out.length > 0, `${k} 應該回傳字串`);
    assert.ok(!out.includes('undefined'), `${k} 不該出現 undefined`);
  }
});
