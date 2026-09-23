// 動態專案清單：每次分類前，從實際資料撈出使用者真的在用的專案，
// 注入 prompt 給模型參考。
//
// 為什麼要這樣做：原本的清單是寫死在 prompt 裡的，幾個月後就完全過時了
// （實測寫死的 7 個專案，有 4 個在 241 筆資料裡出現 0 次，而使用者最常用的
// 「教會行事」「代禱事項」模型根本不知道存在）。模型本身不會學習，
// 所以只能由我們每次把最新的情境餵給它。
//
// 這不是機器學習，是「自適應提示」：模型沒變，但它看到的情境跟著資料變。
const supabase = require('./supabase');

// 快取幾分鐘，避免每則訊息都多查一次資料庫。
// 專案清單變動很慢，晚幾分鐘生效完全沒差。
const TTL_MS = Number(process.env.PROJECT_CACHE_MS || 5 * 60 * 1000);
const MAX_PROJECTS = 20;
// 只出現一兩次的多半是打錯字或一次性的，列進去反而會誤導模型
const MIN_COUNT = 2;

let cache = { at: 0, list: [] };

// 只有大小寫或空白不同的視為同一個專案。
// 實例：資料裡「We R One特會」21 筆跟「We r one」17 筆其實是同一件事，
// 兩個都餵給模型等於叫它在同義詞裡猜，結果就是繼續分裂下去。
function normalizeKey(name) {
  return name.toLowerCase().replace(/\s+/g, '');
}

// 從 notes 統計出常用專案，依使用次數排序。純函式，方便測試。
function rankProjects(rows, { minCount = MIN_COUNT, max = MAX_PROJECTS } = {}) {
  // key（正規化後）→ { total, variants: 各種寫法各出現幾次 }
  const groups = new Map();
  for (const r of rows || []) {
    const p = r && typeof r.project === 'string' ? r.project.trim() : '';
    if (!p) continue;
    const key = normalizeKey(p);
    const g = groups.get(key) || { total: 0, variants: new Map() };
    g.total += 1;
    g.variants.set(p, (g.variants.get(p) || 0) + 1);
    groups.set(key, g);
  }

  return [...groups.values()]
    .filter(g => g.total >= minCount)
    // 同一群裡挑最常用的那種寫法當代表，讓之後的記錄逐漸收斂到同一個名稱
    .map(g => ({
      name: [...g.variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      total: g.total,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, max)
    .map(g => g.name);
}

async function getKnownProjects() {
  if (Date.now() - cache.at < TTL_MS && cache.list.length) return cache.list;

  const { data, error } = await supabase
    .from('notes')
    .select('project')
    .not('project', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('getKnownProjects error:', error);
    return cache.list; // 查不到就沿用上一次的，總比沒有好
  }

  cache = { at: Date.now(), list: rankProjects(data) };
  return cache.list;
}

function resetCache() {
  cache = { at: 0, list: [] };
}

module.exports = { getKnownProjects, resetCache, _test: { rankProjects, MIN_COUNT, MAX_PROJECTS } };
