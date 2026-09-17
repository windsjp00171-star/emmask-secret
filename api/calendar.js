// 日曆訂閱端點：吐出 .ics 讓 Google 日曆／Apple 行事曆訂閱。
//
// 驗證方式跟其他端點不同：Google 抓這個網址時不會帶任何 header，
// 所以 token 只能放在網址裡，等於「知道網址的人就看得到」。
// 因此刻意用獨立的 CALENDAR_TOKEN，而不是共用 DASHBOARD_TOKEN ——
// 這個網址會被存在 Google 的伺服器上，萬一外流只要換這一把，
// 後台密碼不受影響。
const supabase = require('../lib/supabase');
const { buildCalendar } = require('../lib/ics');

// 往前保留一段時間，這樣剛過去的行程在日曆上還看得到
const PAST_DAYS = Number(process.env.CALENDAR_PAST_DAYS || 90);
const MAX_EVENTS = Number(process.env.CALENDAR_MAX_EVENTS || 1000);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = process.env.CALENDAR_TOKEN;
  // 沒設定就整個關掉。預設開放等於把所有行程公開在網路上。
  if (!expected) return res.status(404).send('Not found');

  const token = req.query.token;
  if (token !== expected) return res.status(404).send('Not found');

  const since = new Date(Date.now() - PAST_DAYS * 86400000).toISOString();

  const { data, error } = await supabase
    .from('notes')
    .select('id, type, project, content, raw_text, due_date')
    .in('type', ['task', 'reminder'])
    .eq('is_done', false)
    .not('due_date', 'is', null)
    .gte('due_date', since)
    .order('due_date')
    .limit(MAX_EVENTS);

  if (error) {
    console.error('Calendar feed error:', error);
    return res.status(500).send('calendar unavailable');
  }

  const ics = buildCalendar(data, { domain: req.headers.host || 'emmask-secret' });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="emmark.ics"');
  // 訂閱方本來就會自己排程重抓，這裡給短快取避免被打爆
  res.setHeader('Cache-Control', 'public, max-age=600');
  return res.status(200).send(ics);
};
