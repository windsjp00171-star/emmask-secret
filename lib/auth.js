// 後台 API 的密碼檢查，所有 /api/dashboard、/api/worship、/api/setup 端點共用。
//
// 以前每個端點各自寫「token !== process.env.DASHBOARD_TOKEN」，環境變數沒設時
// 兩邊都是 undefined，「沒帶密碼」就等於「密碼正確」，整個後台等於沒鎖。
// 這裡改成：沒設密碼一律拒絕；比對用定時比較，不會從回應速度猜出密碼。
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// 密碼正確回 true。expected 預設讀 DASHBOARD_TOKEN；沒設或沒帶都是 false。
function tokenOk(provided, expected = process.env.DASHBOARD_TOKEN) {
  if (!expected || typeof provided !== 'string' || !provided) return false;
  return safeEqual(provided, expected);
}

// 從 header 或網址取密碼；不對就直接回 401 並回傳 false
function dashboardAuth(req, res) {
  const provided = (req.query && req.query.token) || req.headers['x-dashboard-token'];
  if (tokenOk(provided)) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

module.exports = { tokenOk, dashboardAuth };
