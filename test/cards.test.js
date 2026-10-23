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

test('分享：沒設 LIFF_ID 傳純文字；設了就走 LIFF 網址，內容可以還原，網址不超過上限', () => {
  const zlib = require('zlib');
  const text = '⏰ 排好了：買牛奶\n明天 09:00';
  delete process.env.LIFF_ID;
  assert.ok(cards.shareButton(text).action.uri.startsWith('https://line.me/R/msg/text/?'));

  process.env.LIFF_ID = '1234567890-AbcdEfgh';
  try {
    const uri = cards.shareButton(text).action.uri;
    assert.ok(uri.startsWith('https://liff.line.me/1234567890-AbcdEfgh?i=1234567890-AbcdEfgh&c='));
    const c = new URL(uri).searchParams.get('c');
    const bytes = Buffer.from(c.slice(1).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const json = JSON.parse((c[0] === 'z' ? zlib.inflateRawSync(bytes) : bytes).toString('utf8'));
    assert.equal(json.t, '買牛奶');
    assert.equal(json.k, '⏰ 排好了');
    assert.deepEqual(json.l, ['明天 09:00']);

    const many = '📅 本週\n' + Array.from({ length: 80 }, (_, i) => `・項目 ${i} ${'內容'.repeat(i % 7 + 3)} ${Math.random()}`).join('\n');
    assert.ok(cards.shareButton(many).action.uri.length <= 1000);
  } finally { delete process.env.LIFF_ID; }
});

test('海報：有吉祥物網址就把圖放在右邊，沒有就維持原樣', () => {
  delete process.env.MASCOT_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  assert.equal(cards.poster({ big: 3 }).layout, 'vertical');
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'example.vercel.app';
  try {
    const p = cards.poster({ kicker: 'k', big: 3, sub: 's' });
    assert.equal(p.layout, 'horizontal');
    assert.equal(p.contents[1].url, 'https://example.vercel.app/img/mascot.png');
    process.env.MASCOT_URL = 'https://cdn.example.com/m.png';
    assert.equal(cards.poster({ big: 3 }).contents[1].url, 'https://cdn.example.com/m.png');
  } finally { delete process.env.MASCOT_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL; }
});

test('吉祥物姿勢：各有各的檔案，沒有網域就不放圖；標籤列旁邊放小貓', () => {
  delete process.env.MASCOT_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const fs = require('fs');
  ['mascot', 'mascot-clock', 'mascot-thumbs', 'mascot-stretch', 'mascot-sleep'].forEach(n => assert.ok(fs.existsSync(`public/img/${n}.png`), n));
  assert.equal(cards.mascotUrl('clock'), null);
  const chip = cards.tagChip('⏰ 提醒', 'reminder');
  assert.equal(cards.chipRow(chip, 'clock'), chip); // 沒網址：原樣
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'example.vercel.app';
  try {
    assert.equal(cards.mascotUrl('sleep'), 'https://example.vercel.app/img/mascot-sleep.png');
    assert.equal(cards.mascotUrl('unknown'), null);
    process.env.MASCOT_URL = 'https://cdn.example.com/m.png';
    assert.equal(cards.mascotUrl(), 'https://cdn.example.com/m.png');
    assert.equal(cards.mascotUrl('thumbs'), 'https://example.vercel.app/img/mascot-thumbs.png'); // MASCOT_URL 只換預設那張
    const row = cards.chipRow(chip, 'thumbs');
    assert.equal(row.contents[1].type, 'image');
    assert.equal(row.contents[1].url, 'https://example.vercel.app/img/mascot-thumbs.png');
  } finally { delete process.env.MASCOT_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL; }
});

test('週日曆格：七格，今天深綠，有事的有件數與點擊動作，沒事的沒有動作', () => {
  const cells = ['日', '一', '二', '三', '四', '五', '六'].map((wd, i) => ({ wd, day: 19 + i, key: `2026-10-${19 + i}`, count: i === 2 ? 3 : 0, today: i === 1 }));
  const strip = cards.weekStrip(cells);
  assert.equal(strip.contents.length, 7);
  assert.equal(strip.contents[1].backgroundColor, cards.C.deep);
  assert.ok(strip.contents[2].action.data.includes('date=2026-10-21'));
  assert.equal(strip.contents[0].action, undefined);
  assert.ok(JSON.stringify(strip.contents[2]).includes('3件'));
});
