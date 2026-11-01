require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { stageOf, format, isCatCommand } = require('../lib/cat-growth');

test('isCatCommand：只認整句', () => {
  assert.equal(isCatCommand('橘貓'), true);
  assert.equal(isCatCommand(' 我的橘貓成長 '), true);
  assert.equal(isCatCommand('橘貓怎麼這麼胖'), false);
});

test('stageOf：邊界件數落在正確階段', () => {
  assert.equal(stageOf(0).stage.name, '小奶貓');
  assert.equal(stageOf(9).stage.name, '小奶貓');
  assert.equal(stageOf(10).stage.name, '小橘貓');
  assert.equal(stageOf(79).stage.name, '橘貓');
  assert.equal(stageOf(80).stage.name, '胖橘貓');
  assert.equal(stageOf(200).stage.name, '橘貓大王');
  assert.equal(stageOf(200).next, null);
  assert.equal(stageOf(-5).stage.name, '小奶貓');
});

test('format：顯示累計、本週與離下一階段的差距', () => {
  const out = format(7, 3);
  assert.match(out, /小奶貓/);
  assert.match(out, /累計完成 7 件・這 7 天完成 3 件/);
  assert.match(out, /再完成 3 件，就會長成「小橘貓」/);
  assert.match(format(250, 5), /最大隻/);
});
