require('./helpers/env');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mods = require('../lib/modules.js');
const { dispatch } = require('../lib/commands.js');
const { withQuickReply } = require('../lib/line.js');
const { buildNextStepRows } = require('../lib/nextstep.js');

const ALL = mods.ALL_IDS;
const without = (...ids) => ALL.filter(id => !ids.includes(id));
beforeEach(() => mods._test.setCurrent(ALL));

test('套餐裡的功能代號都是真的、說明文字都有寫', () => {
  for (const p of Object.values(mods.PRESETS)) {
    for (const id of p.ids) assert.ok(ALL.includes(id), `${p.name} 有不認得的 ${id}`);
  }
  for (const m of mods.MODULES) {
    assert.ok(m.name && m.desc && mods.GROUPS.includes(m.group), m.id);
  }
});

test('還沒設定過：全部開啟（升級的人行為不變），只有預設關閉的實驗功能除外；不認得的代號當作開啟', () => {
  mods._test.reset();
  const off = mods.MODULES.filter(m => m.off).map(m => m.id);
  assert.deepEqual(off, ['memory']);
  assert.ok(ALL.filter(id => !off.includes(id)).every(id => mods.isOn(id)));
  assert.ok(off.every(id => !mods.isOn(id)));
  assert.equal(mods.isOn('不存在的'), true);
  assert.ok(!mods.PRESETS.all.ids.includes('memory'), '「全部開啟」不含預設關閉的實驗功能');
});

test('指令對到模組；一般句子不屬於任何模組', () => {
  const m = mods.moduleForCommand;
  assert.equal(m('記帳'), 'expenses');
  assert.equal(m('上個月記帳'), 'expenses');
  assert.equal(m('會議 7/14 討論預算'), 'meetings');
  assert.equal(m('收藏 https://a.com'), 'links');
  assert.equal(m('存歌 奇異恩典 G 72'), 'songs');
  assert.equal(m('看順序'), 'songs');
  assert.equal(m('服事表 10/4'), 'worship');
  assert.equal(m('我的服事'), 'worship');
  assert.equal(m('日曆'), 'calendar');
  assert.equal(m('專案'), 'projects');
  assert.equal(m('存圖'), 'album');
  assert.equal(m('週報'), 'weekly');
  for (const t of ['買牛奶', '今天', '本週', '待辦', '明天下午三點看牙醫', '完成 報告', '提醒 明天開會']) {
    assert.equal(m(t), null, t);
  }
});

test('關掉的功能：打指令回「沒有開啟」，不會默默存成筆記', async () => {
  mods._test.setCurrent(without('expenses'));
  const reply = await dispatch('記帳');
  assert.match(reply, /「記帳」這個功能目前沒有開啟/);
  assert.match(reply, /功能模組/);
});

test('關掉服事表和詩歌庫：說明文字不再提到它們', () => {
  mods._test.setCurrent(without('worship', 'songs', 'meetings'));
  const { filterHelpText } = mods;
  const text = ['⛪ 服事表\n・服事表 → 我的近期服事', '🎵 敬拜順序\n・寫順序 內容', '🎼 詩歌庫\n・存歌 歌名', '📅 查詢\n・今天 ／ 本週\n・服事表 7/6 → 當天', '📝 會議記錄\n・會議 [日期] 內容'].join('\n\n');
  const out = filterHelpText(text);
  assert.doesNotMatch(out, /服事表|順序|詩歌|會議/);
  assert.match(out, /今天 ／ 本週/);
});

test('快捷鈕跟著模組：關掉記帳、服事表、相簿就沒有對應的鈕', () => {
  const labels = (reply) => reply.quickReply.items.map(i => i.action.label).join('|');
  assert.match(labels(withQuickReply('hi')), /記帳.*服事表.*拍照/);
  mods._test.setCurrent(without('expenses', 'worship', 'album'));
  const off = labels(withQuickReply('hi'));
  assert.doesNotMatch(off, /記帳|服事表|拍照|傳照片/);
  assert.match(off, /提醒.*待辦.*筆記.*語音/);
});

test('查詢選單跟著模組：關掉的功能按鈕不出現', async () => {
  mods._test.setCurrent(without('worship', 'songs', 'links', 'meetings', 'themes', 'calendar', 'projects'));
  const flex = await dispatch('選單');
  const labels = JSON.stringify(flex);
  for (const gone of ['我的服事', '詩歌庫', '收藏清單', '會議記錄', '主題清單', '日曆', '專案', '看順序', '範本']) {
    assert.doesNotMatch(labels, new RegExp(gone), gone);
  }
  assert.match(labels, /今日行程/);
  assert.match(labels, /待辦清單/);
});

test('語音模組關掉：存檔卡片不給「到點用語音唸給我聽」', () => {
  const note = { id: 'n1', type: 'reminder', due_date: 'x' };
  assert.match(JSON.stringify(buildNextStepRows(note)), /act=voice/);
  assert.doesNotMatch(JSON.stringify(buildNextStepRows(note, { voice: false })), /act=voice/);
});

test('sanitize：只留認得的代號，順序照清單', () => {
  assert.deepEqual(mods._test.sanitize(['songs', 'xxx', 'briefing']), ['briefing', 'songs']);
  assert.deepEqual(mods._test.sanitize(null), []);
});
