require('./helpers/env');
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

test('存檔確認卡：標籤＋大字主角＋細節，撤銷鈕還在', () => {
  const { buildUndoableReply } = require('../lib/commands')._test;
  const card = buildUndoableReply('⏰ 排好了：買牛奶\n明天 09:00', 'n1').contents;
  const body = card.body.contents;
  assert.equal(body[0].type, 'box'); // 標籤
  assert.equal(body[1].text, '買牛奶');
  assert.equal(body[1].size, 'lg');
  assert.equal(body[2].text, '明天 09:00');
  assert.ok(JSON.stringify(card.footer).includes('act=delnote&id=n1'));
});

test('提醒卡：只有日期時，把文字裡的時段補在日期後面；有幾點就不重複', () => {
  const { buildReminderFlex } = require('../lib/commands');
  const timeLine = (n) => JSON.stringify(buildReminderFlex(n).contents.body.contents);
  const dateOnly = new Date('2026-10-23T16:00:00Z').toISOString(); // 台北 10/24 00:00
  assert.ok(timeLine({ id: 'n', content: '感恩禮拜（時間 13:00-16:30）', due_date: dateOnly }).includes('10/24 13:00–16:30'));
  assert.ok(!timeLine({ id: 'n', content: '買牛奶', due_date: dateOnly }).includes('–'));
  assert.ok(!timeLine({ id: 'n', content: '開會 13:00-14:00', due_date: '2026-10-24T05:00:00Z' }).includes('13:00–14:00'));
});

test('extractTimeRange：各種寫法，抓不到回 null', () => {
  const { extractTimeRange } = require('../lib/time');
  assert.equal(extractTimeRange('13:00-16:30'), '13:00–16:30');
  assert.equal(extractTimeRange('9:00～10:30 開會'), '09:00–10:30');
  assert.equal(extractTimeRange('時間：13：00 到 16：30'), '13:00–16:30');
  assert.equal(extractTimeRange('買牛奶 2-3 瓶'), null);
  assert.equal(extractTimeRange('25:00-26:00'), null);
});

test('復原卡（完成／刪除）：標籤＋大字主角，復原鈕還在', () => {
  const { buildRestoreReply } = require('../lib/commands')._test;
  const card = buildRestoreReply('✅ 已標記完成：買牛奶', 'undone', 'n1').contents;
  assert.equal(card.body.contents[1].text, '買牛奶');
  assert.ok(JSON.stringify(card.footer).includes('act=undone&id=n1'));
});

test('選單：左右滑動的輪播，每頁都有按鈕，模組全開時有教會頁', async () => {
  const { dispatch } = require('../lib/commands');
  const flex = await dispatch('選單');
  assert.equal(flex.contents.type, 'carousel');
  assert.ok(flex.contents.contents.length >= 3);
  assert.ok(JSON.stringify(flex).includes('run=今天'));
});
