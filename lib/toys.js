// 小玩具：抽籤、骰子、擲硬幣、今天吃什麼。純粹好玩，全部用程式決定，不花 AI。
// rng 可以注入（測試用），預設 Math.random。

const MEALS = [
  '牛肉麵', '便當', '水餃', '拉麵', '咖哩飯', '火鍋', '炒飯', '滷肉飯', '麵線', '漢堡', 'Pizza', '壽司',
  '涼麵', '水煎包', '鍋貼', '三明治', '粥', '蛋餅', '鱔魚意麵', '碗粿', '肉燥飯', '牛肉湯', '虱目魚粥', '鍋燒意麵',
];

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function handleToy(text, rng = Math.random) {
  const t = String(text || '').trim();

  const draw = t.match(/^(?:抽籤|抽一個|選一個|幫我選)[\s:：]+([\s\S]+)$/);
  if (draw) {
    const items = [...new Set(draw[1].split(/[\s,，、/／]+/).map(s => s.trim()).filter(Boolean))];
    if (items.length < 2) return '要給我至少兩個選項喔，例如「抽籤 拉麵 便當 水餃」。';
    return `🎯 抽到：${pick(items, rng)}\n（從 ${items.length} 個選項裡挑的）`;
  }

  const dice = t.match(/^(?:擲|丟|骰)?骰子\s*(\d{1,2})?$/);
  if (dice) {
    const n = Math.min(Math.max(Number(dice[1]) || 1, 1), 6);
    const rolls = Array.from({ length: n }, () => 1 + Math.floor(rng() * 6));
    return n === 1 ? `🎲 擲出 ${rolls[0]}` : `🎲 擲出 ${rolls.join('、')}（共 ${rolls.reduce((a, b) => a + b, 0)}）`;
  }

  if (/^(?:擲|丟)?(?:硬幣|銅板)$/.test(t)) return rng() < 0.5 ? '🪙 正面' : '🪙 反面';

  if (/^(?:今天|中午|晚上|午餐|晚餐|早餐|宵夜)?吃什麼[?？]?$/.test(t)) {
    const a = pick(MEALS, rng);
    return `🍽 ${a} 如何？\n（不滿意再問一次「吃什麼」）`;
  }
  return null;
}

module.exports = { handleToy, MEALS };
