// 收藏連結用：抓目標網頁的標題（og:title 優先，其次 <title>），
// 讓「收藏」清單顯示可讀的標題而不是一整串網址。
function authCheck(req, res) {
  const token = req.query.token || req.headers['x-dashboard-token'];
  if (token !== process.env.DASHBOARD_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// 只允許 http/https，擋掉 localhost / 內網位址，避免這個端點被拿去當內網探測的跳板
function isSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return false;
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./.test(host)) return false;
  return true;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
}

function extractTitle(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  if (og && og[1]) return decodeEntities(og[1]).trim();
  const t = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (t && t[1]) return decodeEntities(t[1]).trim();
  return null;
}

async function fetchTitle(target) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmmArkBot/1.0)' },
    });
    if (!resp.ok || !resp.body) return null;
    const reader = resp.body.getReader();
    let html = '';
    let total = 0;
    const MAX = 100 * 1024; // title 通常在 <head> 裡，只讀前 100KB 就夠
    while (total < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      html += Buffer.from(value).toString('utf8');
      total += value.length;
      if (/<\/head>/i.test(html)) break;
    }
    try { await reader.cancel(); } catch (e) { /* 忽略 */ }
    return extractTitle(html);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!authCheck(req, res)) return;

  const target = req.query.url;
  if (!target || !isSafeUrl(target)) return res.status(400).json({ error: 'invalid url' });

  try {
    const title = await fetchTitle(target);
    return res.status(200).json({ title });
  } catch (err) {
    return res.status(200).json({ title: null });
  }
};

module.exports._test = { isSafeUrl, extractTitle };
