// 驗證 cron 端點呼叫者：若有設 CRON_SECRET，需帶對的 token
// - Vercel Cron 設了 CRON_SECRET 後會自動帶 Authorization: Bearer <secret>
// - GitHub Actions 我們也帶同一個 header
// 若未設 CRON_SECRET，維持開放（向後相容）
function cronAuth(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers['authorization'];
  const token = req.query && req.query.token;
  return auth === `Bearer ${secret}` || token === secret;
}

module.exports = { cronAuth };
