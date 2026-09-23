require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rankProjects } = require('../lib/projects.js')._test;
const { buildSystemPrompt, BASE_PROMPT } = require('../lib/classifier.js')._test;

const rows = (...names) => names.map(project => ({ project }));

test('rankProjects: 依使用次數由多到少排序', () => {
  const out = rankProjects(rows('A', 'B', 'B', 'B', 'A', 'C', 'C'));
  assert.deepEqual(out, ['B', 'A', 'C']);
});

test('rankProjects: 只出現一次的濾掉（多半是打錯字）', () => {
  const out = rankProjects(rows('常用', '常用', '手滑打錯的'));
  assert.deepEqual(out, ['常用']);
});

test('rankProjects: 空值與空字串不列入', () => {
  const out = rankProjects([
    { project: null }, { project: '' }, { project: '   ' }, {},
    { project: '真的' }, { project: '真的' },
  ]);
  assert.deepEqual(out, ['真的']);
});

test('rankProjects: 前後空白會被修掉，視為同一個專案', () => {
  const out = rankProjects([{ project: ' 教會行事' }, { project: '教會行事 ' }]);
  assert.deepEqual(out, ['教會行事']);
});

test('rankProjects: 超過上限只留前幾名', () => {
  const many = [];
  for (let i = 0; i < 30; i++) many.push({ project: `P${i}` }, { project: `P${i}` });
  const out = rankProjects(many, { max: 5 });
  assert.equal(out.length, 5);
});

test('rankProjects: 空輸入回空陣列，不會爆炸', () => {
  assert.deepEqual(rankProjects([]), []);
  assert.deepEqual(rankProjects(null), []);
  assert.deepEqual(rankProjects(undefined), []);
});

test('rankProjects: 次數相同時用名稱排序，結果才穩定', () => {
  const a = rankProjects(rows('乙', '乙', '甲', '甲'));
  const b = rankProjects(rows('甲', '甲', '乙', '乙'));
  assert.deepEqual(a, b, '同樣的資料不管順序都該得到同樣結果');
});

test('buildSystemPrompt: 沒有專案時就用原本的 prompt', () => {
  assert.equal(buildSystemPrompt([]), BASE_PROMPT);
  assert.equal(buildSystemPrompt(null), BASE_PROMPT);
});

test('buildSystemPrompt: 有專案時會附在 prompt 後面', () => {
  const p = buildSystemPrompt(['教會行事', '代禱事項']);
  assert.ok(p.startsWith(BASE_PROMPT), '原本的規則要保留');
  assert.match(p, /教會行事、代禱事項/);
});

test('BASE_PROMPT: 不該再寫死任何專案名稱', () => {
  // 寫死的清單過期後會誤導模型，這個測試就是要擋住有人不小心加回去
  for (const stale of ['Cell Reporter', '天父日記', '資料交換中心', 'PitchPal']) {
    assert.ok(!BASE_PROMPT.includes(stale), `不該出現寫死的專案名稱：${stale}`);
  }
});

// 資料裡「We R One特會」跟「We r one」其實是同一個專案，被大小寫拆成兩個。
// 兩個都餵給模型等於叫它在同義詞裡猜，分裂會一直持續下去。
test('rankProjects: 只有大小寫不同的合併成一個', () => {
  const out = rankProjects(rows('We R One特會', 'We R One特會', 'we r one特會'));
  assert.equal(out.length, 1, `應該只剩一個，實際 ${JSON.stringify(out)}`);
});

test('rankProjects: 合併時挑最常用的寫法當代表', () => {
  const out = rankProjects(rows('教會行事', '教會行事', '教會行事', '教會 行事'));
  assert.deepEqual(out, ['教會行事']);
});

test('rankProjects: 合併後次數要相加，不是各算各的', () => {
  // 各自只有 1 次會被 minCount 濾掉，合併後有 2 次就該留下
  const out = rankProjects(rows('ABC', 'abc'));
  assert.equal(out.length, 1, '合併後總數達標就該保留');
});

test('rankProjects: 空白差異也視為同一個', () => {
  const out = rankProjects(rows('We R One', 'WeROne', 'we r one'));
  assert.equal(out.length, 1);
});
