require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEntries, splitNames } = require('../lib/worship.js')._test;

const dates = ['2026-10-04', '2026-10-11', '2026-10-18'];

test('splitNames: 頓號與斜線都拆成多人', () => {
  assert.deepEqual(splitNames('小美、小華'), ['小美', '小華']);
  assert.deepEqual(splitNames('弘憲/佩蓉'), ['弘憲', '佩蓉']);
  assert.deepEqual(splitNames('牧師'), ['牧師']);
});

test('buildEntries: 空白格略過、備註不拆', () => {
  const out = buildEntries({ dates, rows: [
    { role: '助唱', cells: ['小美、小華', '', '小芳'] },
    { role: '備註', cells: ['10/24 大明、小芳 感恩禮拜', '', ''] },
  ] });
  assert.equal(out.entries.length, 4);
  assert.deepEqual(out.entries.find(e => e.role === '備註'),
    { service_date: '2026-10-04', role: '備註', person_name: '10/24 大明、小芳 感恩禮拜' });
});

test('buildEntries: PDF 跨頁重複的列只算一次', () => {
  const row = { role: '信息', cells: ['牧師', '志明', '牧師'] };
  const out = buildEntries({ dates, rows: [row, row] });
  assert.equal(out.entries.length, 3);
});

test('buildEntries: 整列空白的職位列入尚未排人', () => {
  const out = buildEntries({ dates, rows: [
    { role: '信息', cells: ['牧師', '', ''] },
    { role: '第一堂內場招待', cells: ['', ' ', ''] },
  ] });
  assert.deepEqual(out.blankRoles, ['第一堂內場招待']);
  assert.deepEqual(out.filledRoles, ['信息']);
});

test('buildEntries: 日期格式不對就回 null', () => {
  assert.equal(buildEntries({ dates: ['10/04'], rows: [] }), null);
  assert.equal(buildEntries({ rows: [] }), null);
  assert.equal(buildEntries(null), null);
});

test('buildEntries: cells 比日期多的部分忽略', () => {
  const out = buildEntries({ dates: ['2026-10-04'], rows: [{ role: '鼓', cells: ['阿傑', '阿宏'] }] });
  assert.equal(out.entries.length, 1);
});

const { pickNearest, shiftIso } = require('../lib/worship.js')._test;

test('shiftIso: 跨月加減天數', () => {
  assert.equal(shiftIso('2026-10-01', -3), '2026-09-28');
  assert.equal(shiftIso('2026-12-30', 3), '2027-01-02');
});

test('pickNearest: 打錯一天找到最近的主日', () => {
  assert.equal(pickNearest('2026-10-03', ['2026-10-04']), '2026-10-04');
  assert.equal(pickNearest('2026-10-07', ['2026-10-04', '2026-10-11']), '2026-10-04');
  assert.equal(pickNearest('2026-10-03', []), null);
});

const { findSimilarNames, importFailureReason, buildEveMessage } = require('../lib/worship.js')._test;

test('findSimilarNames: 只差一個字的名字會被挑出來', () => {
  assert.deepEqual(findSimilarNames(['惠娟', '慧娟', '小明', '惠娟', '小華']), [['惠娟', '慧娟'], ['小明', '小華']]);
});

test('findSimilarNames: 長度不同或差兩個字以上不算', () => {
  assert.deepEqual(findSimilarNames(['牧師', '師母', '王小明', '小明', '一']), []);
});

test('importFailureReason: AI 忙碌、JSON 壞掉、其他錯誤各有說法', () => {
  const busy = Object.assign(new Error('Gemini HTTP 503'), { status: 503 });
  assert.match(importFailureReason(busy), /太忙/);
  assert.match(importFailureReason(new SyntaxError('Unexpected end of JSON input')), /再傳一次/);
  assert.match(importFailureReason(new Error('boom')), /讀取失敗/);
});

test('buildEveMessage: 有我的服事就列出職位與當天備註', () => {
  const rows = [
    { role: '助唱', person_name: '小明' },
    { role: '教會禱告會', person_name: '小明' },
    { role: '信息', person_name: '牧師' },
    { role: '備註', person_name: '聖餐' },
  ];
  const text = buildEveMessage('小明', rows, '2026-10-04');
  assert.match(text, /明天（10\/4）你要服事：助唱、教會禱告會/);
  assert.match(text, /當天：聖餐/);
  assert.match(text, /服事表 10\/4/);
});

test('buildEveMessage: 明天沒有我就不提醒', () => {
  assert.equal(buildEveMessage('小明', [{ role: '信息', person_name: '牧師' }], '2026-10-04'), null);
});

const { findSimilarGroups } = require('../lib/worship.js')._test;

test('findSimilarGroups: 只比同職位，並把彼此相似的名字併成一組', () => {
  const e = (role, person_name) => ({ role, person_name });
  const groups = findSimilarGroups([
    e('第二堂服務台', '惠娟'), e('第二堂服務台', '慧娟'), e('第二堂服務台', '惠純'), e('第二堂服務台', '慧純'),
    e('助唱', '淑如'), e('第一堂服務台', '淑閔'),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].role, '第二堂服務台');
  assert.deepEqual(groups[0].names.sort(), ['惠娟', '惠純', '慧娟', '慧純'].sort());
});
