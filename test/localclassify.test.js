require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localClassify } = require('../lib/localclassify.js');

const DUE = '2026-10-24T07:00:00.000Z';
const PROJECTS = ['Cell Reporter', '教會入口', '教會入口 安南'];

test('明確的「時間＋事情」短句：本地直接分成待辦，帶上時間', () => {
  const r = localClassify('明天下午三點看牙醫', DUE, PROJECTS);
  assert.equal(r.type, 'task');
  assert.equal(r.due_date, DUE);
  assert.equal(r.content, '明天下午三點看牙醫');
  assert.equal(r.reply, null);
});

test('各種時間寫法都算：幾點、幾:幾、M/D、N分鐘後', () => {
  for (const t of ['週五晚上8點 禱告會', '明天 14:30 開會', '10/30 繳費', '3分鐘後關火', '半小時後吃藥']) {
    assert.ok(localClassify(t, DUE), t);
  }
});

test('提到已知專案就帶上，挑最長的符合', () => {
  assert.equal(localClassify('明天3點 Cell Reporter 修 bug', DUE, PROJECTS).project, 'Cell Reporter');
  assert.equal(localClassify('明天3點 教會入口 安南 改版', DUE, PROJECTS).project, '教會入口 安南');
  assert.equal(localClassify('明天3點看牙醫', DUE, PROJECTS).project, null);
});

test('沒把握的一律交給 AI（回 null）', () => {
  const cases = [
    '今天好累',                    // 只有「今天」沒有時間點
    '明天要不要去',                // 問句
    '明天下午3點有什麼事',         // 問句
    '我昨天看了6/29的新聞',        // 過去式
    '看牙醫改到後天下午三點',      // 口語改動既有事項
    '讀書會取消了',                // 取消
    '明天繳房租 15000 元',         // 含金額
    '明天下午3點開會\n議程：預算',  // 多行
    '買牛奶',                      // 沒時間
    '字'.repeat(61) + '明天3點',   // 太長
  ];
  for (const t of cases) assert.equal(localClassify(t, DUE, PROJECTS), null, t);
});

test('沒解出時間就不處理', () => {
  assert.equal(localClassify('明天下午三點看牙醫', null, PROJECTS), null);
});
