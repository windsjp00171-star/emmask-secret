require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { stageOf, format, buildCard, isCatCommand } = require('../lib/cat-growth');

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

test('buildCard：有網域時是圖＋文字卡（含進度條），沒網域退回純文字', () => {
  const old = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    assert.equal(typeof buildCard(5, 2), 'string');
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'example.vercel.app';
    const card = buildCard(15, 4);
    const b = card.contents;
    assert.equal(b.hero.url, 'https://example.vercel.app/img/cat-stage-2.png');
    assert.match(JSON.stringify(b.body), /小橘貓/);
    assert.match(JSON.stringify(b.body), /累計完成 15 件・這 7 天 4 件/);
    const bar = b.body.contents[3].contents;
    assert.equal(bar[0].flex + bar[1].flex, 100); // 15/30 的進度 → 25%
    assert.equal(bar[0].flex, 25);
    assert.equal(buildCard(250, 1).contents.body.contents[3].contents.length, 1); // 最大隻：滿格
  } finally {
    if (old === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL; else process.env.VERCEL_PROJECT_PRODUCTION_URL = old;
  }
});
