require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCountdown, daysLeft, briefingLines, formatList, describe } = require('../lib/countdown');
const { handleToy, MEALS } = require('../lib/toys');

const NOW = new Date('2026-10-31T04:00:00Z'); // 台北 10/31 12:00
const iso = (md) => new Date(`2026-${md}T09:00:00+08:00`).toISOString();

test('parseCountdown：要有日期；標題是去掉日期後剩下的字', () => {
  const a = parseCountdown('12/25 聖誕節');
  assert.equal(a.title, '聖誕節');
  assert.ok(a.dateISO);
  assert.equal(parseCountdown('聖誕節 12/25').title, '聖誕節');
  assert.equal(parseCountdown('2027/1/3 考試').title, '考試');
  assert.equal(parseCountdown('12月25日').title, '那一天');
  assert.equal(parseCountdown('聖誕節'), null);
  assert.equal(parseCountdown('明天'), null); // 光說「明天」不算日期
  assert.equal(parseCountdown(''), null);
});

test('daysLeft：台北日期相減，今天是 0，過了是負的', () => {
  assert.equal(daysLeft(iso('10-31'), NOW), 0);
  assert.equal(daysLeft(iso('11-01'), NOW), 1);
  assert.equal(daysLeft(iso('12-25'), NOW), 55);
  assert.equal(daysLeft(iso('10-30'), NOW), -1);
  // 台北已經跨日（UTC 還是前一天 20:00）
  assert.equal(daysLeft(iso('11-01'), new Date('2026-10-31T20:00:00Z')), 0);
});

test('describe／briefingLines：今天、明天、N 天；只取 90 天內最近 2 個，過了的不顯示', () => {
  assert.equal(describe('聖誕節', 55), '⏳ 聖誕節還有 55 天');
  assert.equal(describe('考試', 1), '⏳ 考試是明天');
  assert.equal(describe('生日', 0), '🎉 生日就是今天！');
  const items = [
    { content: '遠的', due_date: iso('12-25') }, { content: '過了', due_date: iso('10-01') },
    { content: '近的', due_date: iso('11-14') }, { content: '太遠', due_date: new Date('2027-06-01T01:00:00Z').toISOString() },
    { content: '明天', due_date: iso('11-01') },
  ];
  assert.deepEqual(briefingLines(items, NOW), ['⏳ 明天是明天', '⏳ 近的還有 14 天']);
  assert.deepEqual(briefingLines([], NOW), []);
});

test('formatList：由近到遠，沒有時教怎麼記', () => {
  assert.match(formatList([], NOW), /倒數 12\/25 聖誕節/);
  const t = formatList([{ content: '聖誕節', due_date: iso('12-25') }, { content: '考試', due_date: iso('11-14') }], NOW);
  assert.ok(t.indexOf('考試') < t.indexOf('聖誕節'));
  assert.match(t, /11\/14 考試：還有 14 天/);
});

test('小玩具：抽籤、骰子、硬幣、吃什麼；其他句子不理', () => {
  const rng = (v) => () => v;
  assert.match(handleToy('抽籤 拉麵 便當 水餃', rng(0.0)), /抽到：拉麵/);
  assert.match(handleToy('抽籤 拉麵、便當，水餃', rng(0.99)), /抽到：水餃/);
  assert.match(handleToy('抽籤 拉麵', rng(0)), /至少兩個選項/);
  assert.match(handleToy('抽籤 拉麵 拉麵', rng(0)), /至少兩個選項/); // 重複的不算兩個
  assert.equal(handleToy('骰子', rng(0)), '🎲 擲出 1');
  assert.equal(handleToy('擲骰子', rng(0.99)), '🎲 擲出 6');
  assert.match(handleToy('骰子 3', rng(0.5)), /擲出 4、4、4（共 12）/);
  assert.match(handleToy('骰子 99', rng(0)), /共 6）/); // 最多 6 顆
  assert.equal(handleToy('擲硬幣', rng(0.1)), '🪙 正面');
  assert.equal(handleToy('丟硬幣', rng(0.9)), '🪙 反面');
  assert.match(handleToy('吃什麼', rng(0)), new RegExp(MEALS[0]));
  assert.match(handleToy('今天吃什麼？', rng(0)), /如何？/);
  assert.equal(handleToy('明天吃什麼時候開會', rng(0)), null);
  assert.equal(handleToy('買牛奶', rng(0)), null);
});
