require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { _test: { tabsFor, menuDef, aliasOf } } = require('../api/setup/richmenu');

const tabs = tabsFor('x.vercel.app', 'tok');

test('三個分頁各 8 格，每個分頁共 11 個區域（3 個分頁鈕＋8 格）', () => {
  assert.equal(tabs.length, 3);
  tabs.forEach((cells, i) => {
    assert.equal(cells.length, 8);
    assert.equal(menuDef(i, cells, 'n').areas.length, 11);
  });
});

test('所有區域都在 2500×1686 之內，彼此不重疊', () => {
  tabs.forEach((cells, i) => {
    const areas = menuDef(i, cells, 'n').areas.map(a => a.bounds);
    areas.forEach(b => { assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 2500 && b.y + b.height <= 1686); });
    for (let a = 0; a < areas.length; a++) for (let b = a + 1; b < areas.length; b++) {
      const p = areas[a], q = areas[b];
      assert.ok(p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y);
    }
  });
});

test('分頁鈕切到另外兩個別名，自己這一個不動作', () => {
  const areas = menuDef(1, tabs[1], 'n').areas.slice(0, 3);
  assert.equal(areas[1].action.type, 'postback');
  assert.equal(areas[0].action.richMenuAliasId, aliasOf(0));
  assert.equal(areas[2].action.richMenuAliasId, aliasOf(2));
});

test('圖文選單的設定符合 LINE 限制，圖片檔存在且小於 1MB', () => {
  const def = menuDef(0, tabs[0], 'n');
  assert.ok(def.chatBarText.length <= 14);
  [1, 2, 3].forEach(n => assert.ok(fs.statSync(`assets/richmenu/tab${n}.png`).size < 1024 * 1024));
});
