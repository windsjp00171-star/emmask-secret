require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

const modules = require('../lib/modules');
let meetingsOn = true;
modules.loadModules = async () => {};
modules.isOn = (id) => (id === 'meetings' ? meetingsOn : id !== 'memory');
const { dispatch, _test } = require('../lib/commands');

const pagesOf = (flex) => flex.contents.contents;
const textOf = (flex) => JSON.stringify(flex);

test('你可以這樣說：六頁，含補充、天氣、AI額度、會議模式的範例句', () => {
  meetingsOn = true;
  const flex = _test.handleExamples();
  assert.equal(flex.type, 'flex');
  assert.equal(pagesOf(flex).length, 6);
  const all = textOf(flex);
  for (const phrase of ['補充 還有一件事', '明天天氣如何', 'AI額度', '整理這週的筆記', '歸類筆記', 'AI 幫手', '收工回顧', '倒數 12/25', '抽籤', '會議開始', '會議結束', '撤銷']) {
    assert.ok(all.includes(phrase), phrase);
  }
});

test('你可以這樣說：會議記錄功能沒開就不列那一頁', () => {
  meetingsOn = false;
  const flex = _test.handleExamples();
  assert.equal(pagesOf(flex).length, 5);
  assert.ok(!textOf(flex).includes('會議開始'));
  meetingsOn = true;
});

test('傳「你可以這樣說」「範例」會出範例卡；功能選單的說明頁也有入口', async () => {
  for (const t of ['你可以這樣說', '範例']) {
    const r = await dispatch(t);
    assert.match(textOf(r), /你可以這樣說（左右滑動）/);
  }
  assert.match(textOf(await dispatch('選單')), /run=你可以這樣說/);
  assert.match(textOf(await dispatch('指令')), /傳「你可以這樣說」看範例/);
});

test('選單第一頁是「最常用」五顆按鈕；單打「找」不會被存成筆記', async () => {
  const menu = JSON.stringify(require('../lib/commands.js')._test.handleMenu());
  const first = menu.indexOf('最常用');
  assert.ok(first > 0 && first < menu.indexOf('📅 查看'));
  for (const label of ['今天', '待辦清單', '最近筆記', '找筆記', '你可以這樣說']) assert.ok(menu.includes(label), label);
});
