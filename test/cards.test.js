const test = require('node:test');
const assert = require('node:assert/strict');
const cards = require('../lib/cards');

test('shareUri：網址不超過 LINE 上限，太長會截短', () => {
  const uri = cards.shareUri('字'.repeat(2000));
  assert.ok(uri.startsWith('https://line.me/R/msg/text/?'));
  assert.ok(uri.length <= 1000);
  assert.equal(cards.shareUri('  '), null);
  assert.equal(cards.shareButton(''), null);
});

test('shareVoiceButton：語音網址完整保留', () => {
  const url = 'https://x.supabase.co/storage/v1/object/sign/voice-notes/voice/a.m4a?token=abc';
  const b = cards.shareVoiceButton('買牛奶'.repeat(300), url);
  assert.ok(decodeURIComponent(b.action.uri).endsWith(url));
  assert.equal(cards.shareVoiceButton('x', null), null);
});

test('flex：單張是 bubble、多張是 carousel、最多 12 張、濾掉 null', () => {
  const b = cards.bubble({ body: [{ type: 'text', text: 'a' }] });
  assert.equal(cards.flex('x', [b, null]).contents.type, 'bubble');
  const many = cards.flex('x', Array(20).fill(b));
  assert.equal(many.contents.type, 'carousel');
  assert.equal(many.contents.contents.length, 12);
});

test('bubble：沒有 footer 內容就不產生 footer', () => {
  assert.equal(cards.bubble({ body: [], footer: [null] }).footer, undefined);
});

test('bigDate：回傳月/日與週幾', () => {
  const d = cards.bigDate(new Date('2026-10-23T04:00:00Z'));
  assert.equal(d.md, '10/23');
  assert.equal(d.weekday, '週五');
});
