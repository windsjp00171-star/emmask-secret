require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// share.html 的卡片組裝邏輯在頁面的 <script> 裡；把「立刻執行的那段」去掉，只取函式來測
function loadCardOf() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'share.html'), 'utf8');
  const js = html.match(/<script>\n([\s\S]*?)<\/script>/)[1].split('(async () => {')[0];
  return new Function('location', 'document', `${js}\nreturn { cardOf, urlOf };`)(
    { origin: 'https://x.app', search: '' }, { getElementById: () => ({}) });
}
const { cardOf, urlOf } = loadCardOf();

const URL = 'https://church-data-hub.onrender.com/p/vZFZ_DK1opVNGEUc?openExternalBrowser=1';
const uriActions = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((n) => uriActions(n, out));
  else if (node && typeof node === 'object') {
    if (node.action && node.action.type) out.push(node.action);
    Object.values(node).forEach((v) => uriActions(v, out));
  }
  return out;
};

test('分享卡：有網址的行，文字和「開啟」按鈕都開得了網址；沒網址的不加', () => {
  const plain = cardOf({ k: '📅', t: '明天的行程', l: ['・10/25 聖誕節開會', `・10/25 12:15 後製資料 ${URL}`], b: 'b' });
  const acts = uriActions(plain);
  assert.equal(acts.length, 2);
  assert.ok(acts.every((a) => a.type === 'uri' && a.uri === URL));
  assert.ok(!acts.some((a) => a.type === 'clipboard'), '分享的卡片只能用開網址的動作');
});

test('分享卡（橘貓輪播）：行程頁也一樣，名單（職位：人名）不受影響', () => {
  const agenda = cardOf({ s: 'rain', t: 'x', l: ['・a', `・b ${URL}`], b: 'b' });
  assert.equal(uriActions(agenda).length, 2);
  const roles = cardOf({ s: 'worship', t: 'x', l: ['信息：師母', '助唱：雅竹'], b: 'b' });
  assert.equal(uriActions(roles).length, 0);
});

test('urlOf：去掉結尾標點、太長的不收', () => {
  assert.equal(urlOf('看 https://a.com/x。'), 'https://a.com/x');
  assert.equal(urlOf('沒有網址'), null);
  assert.equal(urlOf('https://a.com/' + 'x'.repeat(1100)), null);
});
