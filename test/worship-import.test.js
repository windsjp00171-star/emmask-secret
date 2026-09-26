require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEntries, splitNames } = require('../lib/worship.js')._test;

const dates = ['2026-10-04', '2026-10-11', '2026-10-18'];

test('splitNames: 頓號與斜線都拆成多人', () => {
  assert.deepEqual(splitNames('采穎、雅竹'), ['采穎', '雅竹']);
  assert.deepEqual(splitNames('弘憲/佩蓉'), ['弘憲', '佩蓉']);
  assert.deepEqual(splitNames('牧師'), ['牧師']);
});

test('buildEntries: 空白格略過、備註不拆', () => {
  const out = buildEntries({ dates, rows: [
    { role: '助唱', cells: ['采穎、雅竹', '', '昭頤'] },
    { role: '備註', cells: ['10/24 和運、昭頤 感恩禮拜', '', ''] },
  ] });
  assert.equal(out.entries.length, 4);
  assert.deepEqual(out.entries.find(e => e.role === '備註'),
    { service_date: '2026-10-04', role: '備註', person_name: '10/24 和運、昭頤 感恩禮拜' });
});

test('buildEntries: PDF 跨頁重複的列只算一次', () => {
  const row = { role: '信息', cells: ['牧師', '惠子', '牧師'] };
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
  const out = buildEntries({ dates: ['2026-10-04'], rows: [{ role: '鼓', cells: ['于巽', '承緯'] }] });
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
