// 驗證 cron 端點呼叫者：一定要帶對的 CRON_SECRET。
// - Vercel Cron 設了 CRON_SECRET 後會自動帶 Authorization: Bearer <secret>
// - 外部排程（設定頁顯示的提醒網址）用 ?token=<secret>
// 沒設 CRON_SECRET 一律拒絕：以前沒設就放行，任何人都能呼叫排程網址刷 LINE 推播額度。
const { tokenOk } = require('./auth');

function cronAuth(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers && req.headers['authorization'];
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const queryToken = req.query && req.query.token;
  return tokenOk(bearer, secret) || tokenOk(queryToken, secret);
}

module.exports = { cronAuth };
