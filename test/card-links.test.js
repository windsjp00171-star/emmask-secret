require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const commands = require('../lib/commands.js');
const { extractUrls, buildRestoreReply, todoActionRows } = commands._test;
const { buildReminderFlex } = commands;

const PA = 'https://www.pythonanywhere.com/user/emmark/webapps/';

// 收集卡片裡所有的 action（任意深度）
function actions(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => actions(n, out));
  else if (node && typeof node === 'object') {
    if (node.action) out.push(node.action);
    Object.values(node).forEach((v) => typeof v === 'object' && actions(v, out));
  }
  return out;
}
const reminder = (content) => buildReminderFlex({ id: 'n1', content, due_date: new Date(Date.now() + 60000).toISOString() });

test('extractUrls: 抓出網址、去掉結尾標點與中文括號', () => {
  assert.deepEqual(extractUrls(`去 ${PA} 點延展。`), [PA]);
  assert.deepEqual(extractUrls(`（${PA}）`), [PA]);
  assert.deepEqual(extractUrls('沒有網址'), []);
});

test('extractUrls: 重複的只算一次、最多兩個', () => {
  assert.equal(extractUrls('http://a.com http://a.com http://b.com http://c.com').length, 2);
});

test('提醒卡：內容有網址就有「開啟」和「複製」，兩個都指向同一個網址', () => {
  const acts = actions(reminder(`每月1號 ${PA} 點延展`));
  const open = acts.find((a) => a.type === 'uri' && a.label.startsWith('🔗'));
  const copy = acts.find((a) => a.type === 'clipboard');
  assert.equal(open.uri, PA);
  assert.equal(copy.clipboardText, PA);
});

test('提醒卡：內容那段文字本身也能點', () => {
  const card = reminder(`看 ${PA}`);
  const body = card.contents.body.contents.find((c) => c.text && c.text.includes('pythonanywhere'));
  assert.equal(body.action.uri, PA);
});

test('提醒卡：沒有網址就沒有任何連結動作，原本的按鈕不變', () => {
  const acts = actions(reminder('買牛奶'));
  assert.equal(acts.filter((a) => (a.type === 'uri' || a.type === 'clipboard') && !a.label.includes('分享')).length, 0);
  assert.ok(acts.some((a) => a.type === 'postback' && a.label.includes('完成')));
});

test('提醒卡：連結按鈕排在完成之前，且完成鈕還在', () => {
  const footer = reminder(`x ${PA}`).contents.footer.contents;
  assert.equal(footer[0].type, 'box');
  assert.ok(actions(footer).some((a) => a.type === 'postback' && a.label.includes('完成')));
});

test('復原卡（已標記完成）：網址可以開、可以複製，復原鈕還在', () => {
  const acts = actions(buildRestoreReply(`✅ 已標記完成：${PA}`, 'undone', 'n1'));
  assert.ok(acts.some((a) => a.type === 'uri' && a.uri === PA));
  assert.ok(acts.some((a) => a.type === 'clipboard' && a.clipboardText === PA));
  assert.ok(acts.some((a) => a.type === 'postback' && a.label.includes('復原')));
});

test('待辦清單：有網址的那一筆，文字可以點；沒網址的不受影響', () => {
  const rows = todoActionRows([
    { id: '1', content: `延展 ${PA}`, due_date: null },
    { id: '2', content: '買牛奶', due_date: null },
  ]).filter((r) => r.type === 'box');
  const text = (r) => r.contents[0].contents[0];
  assert.equal(text(rows[0]).action.uri, PA);
  assert.equal(text(rows[1]).action, undefined);
});

test('超過 LINE 長度上限的網址不產生連結動作（否則整張卡會被 LINE 退回）', () => {
  const long = 'https://a.com/' + 'x'.repeat(1100);
  assert.deepEqual(extractUrls(long), []);
  assert.equal(actions(reminder(long)).filter((a) => a.type === 'uri' && !a.label.includes('分享')).length, 0);
});

test('明天預告頁：有網址的項目文字可以點，下面有「開啟／複製」按鈕；沒網址的不加', () => {
  const url = 'https://church-data-hub.onrender.com/p/vZFZ_DK1opVNGEUc?openExternalBrowser=1';
  const page = commands._test.buildTomorrowPage([
    { due_date: '2026-10-25T04:15:00Z', content: `後製上傳用的資料 ${url}` },
    { due_date: '2026-10-25T02:00:00Z', content: '聖誕節創意小組開會' },
  ], 'x');
  const acts = actions(page.body);
  const open = acts.filter(a => a.type === 'uri' && a.uri === url);
  assert.ok(open.length >= 2, '文字本身和「開啟」按鈕都開得了網址');
  const copy = acts.filter(a => a.type === 'clipboard');
  assert.equal(copy.length, 1);
  assert.equal(copy[0].clipboardText, url);
  assert.equal(commands._test.buildTomorrowPage([], ''), null);
});

test('明天預告頁的分享，分享出去也帶橘貓場景', () => {
  process.env.LIFF_ID = '123-abc';
  try {
    const page = commands._test.buildTomorrowPage([{ due_date: '2026-10-25T04:15:00Z', content: '開會' }], '・10/25 開會');
    const uri = actions(page.footer).find(a => a.type === 'uri').uri;
    const c = new URL(uri).searchParams.get('c');
    const raw = c[0] === 'z' ? require('zlib').inflateRawSync(Buffer.from(c.slice(1), 'base64url')) : Buffer.from(c.slice(1), 'base64url');
    assert.ok(require('../lib/cards').RANDOM_SCENES.includes(JSON.parse(raw.toString()).s));
  } finally { delete process.env.LIFF_ID; }
});

test('多條連結：每條一顆自己名稱的按鈕（名稱取網址前後的文字），各自可開、可複製', () => {
  const { linkButtons, extractLinks } = commands._test;
  const text = '地點：萬華車站 https://maps.example/a 振華公園 https://maps.example/b';
  assert.deepEqual(extractLinks(text).map(l => l.label), ['萬華車站', '振華公園']);
  const rows = linkButtons(text);
  assert.equal(rows.length, 2);
  const labels = rows.map(r => r.contents[0].action.label);
  assert.deepEqual(labels, ['🔗 萬華車站', '🔗 振華公園']);
  assert.deepEqual(rows.map(r => r.contents[0].action.uri), ['https://maps.example/a', 'https://maps.example/b']);
  assert.deepEqual(rows.map(r => r.contents[1].action.clipboardText), ['https://maps.example/a', 'https://maps.example/b']);
});

test('連結按鈕名稱：去掉開頭的日期時間；沒有文字就叫「開啟」；超過 20 字會截短', () => {
  const { linkButtons, extractLinks } = commands._test;
  assert.equal(extractLinks('10/25 12:15 後製上傳用的資料 https://a.com/x')[0].label, '後製上傳用的資料');
  assert.equal(extractLinks('・10/25 12:15 後製上傳用的資料 https://a.com/x')[0].label, '後製上傳用的資料');
  assert.equal(linkButtons('https://a.com/x')[0].contents[0].action.label, '🔗 開啟');
  const long = linkButtons('這是一段非常非常非常非常長的連結名稱文字內容 https://a.com/x')[0].contents[0].action.label;
  assert.ok(long.length <= 20);
});
