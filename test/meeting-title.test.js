require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { meetingTitle } = require('../lib/commands.js')._test;

test('meetingTitle: 取第一行當標題', () => {
  assert.equal(meetingTitle('全職同工會\n1.這個\n2.那個'), '全職同工會');
});

// 以下四個都是資料庫裡真實出現過的寫法
test('meetingTitle: 結尾的冒號會去掉', () => {
  assert.equal(meetingTitle('全職同工會：\n1.這個'), '全職同工會');
});

test('meetingTitle: 只有一行也能取', () => {
  assert.equal(meetingTitle('小組長月會'), '小組長月會');
});

test('meetingTitle: 逗號結尾的引言整句保留（不亂猜哪裡是標題）', () => {
  assert.equal(meetingTitle('小組長月會，討論事項如下：\n1.這個'), '小組長月會，討論事項如下');
});

test('meetingTitle: 全職同工會議', () => {
  assert.equal(meetingTitle('全職同工會議\n內容'), '全職同工會議');
});

test('meetingTitle: 前面的空行會跳過', () => {
  assert.equal(meetingTitle('\n\n  全職同工會  \n1.這個'), '全職同工會');
});

test('meetingTitle: 第一行重複寫日期時會拿掉（旁邊已經有日期了）', () => {
  assert.equal(meetingTitle('8/29 小組長月會\n1.這個'), '小組長月會');
  assert.equal(meetingTitle('8月29日 小組長月會'), '小組長月會');
  assert.equal(meetingTitle('8/29：小組長月會'), '小組長月會');
});

test('meetingTitle: 標題本身就是日期時不會被清成空字串', () => {
  // 拿掉日期後沒東西了，這種情況寧可留原樣也不要回空的
  const out = meetingTitle('8/29\n1.這個');
  assert.equal(out, '');
});

test('meetingTitle: 空內容不會爆炸', () => {
  assert.equal(meetingTitle(''), '');
  assert.equal(meetingTitle(null), '');
  assert.equal(meetingTitle(undefined), '');
  assert.equal(meetingTitle('   \n  \n '), '');
});

test('meetingTitle: 不會把整篇內容當標題', () => {
  const long = '全職同工會\n' + '很長的內容'.repeat(50);
  assert.equal(meetingTitle(long), '全職同工會');
});
