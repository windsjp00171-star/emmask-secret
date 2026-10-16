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
  const open = acts.find((a) => a.type === 'uri' && a.label.includes('開啟'));
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
  assert.equal(acts.filter((a) => a.type === 'uri' || a.type === 'clipboard').length, 0);
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
  assert.equal(actions(reminder(long)).filter((a) => a.type === 'uri').length, 0);
});
