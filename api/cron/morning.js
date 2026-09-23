const { pushMessage } = require('../../lib/line');
const { handleMorning } = require('../../lib/commands');
const { cronAuth } = require('../../lib/cron-auth');
const { getStaleHeartbeats } = require('../../lib/heartbeat');

// 提醒輪詢（api/cron/remind）是靠外部排程服務戳的，不在 vercel.json 裡，
// 萬一外部排程忘記設定或停用，提醒會整批悄悄失效卻沒人知道。
// 這裡順便在每天的早安簡報檢查一次它的心跳，太久沒執行就主動示警。
const REMIND_HEARTBEAT_MAX_AGE_MIN = Number(process.env.REMIND_HEARTBEAT_MAX_AGE_MIN || 30);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!cronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const stale = await getStaleHeartbeats([{ name: 'remind', maxAgeMinutes: REMIND_HEARTBEAT_MAX_AGE_MIN }]);
    if (stale.length) {
      const last = stale[0].lastRunAt
        ? new Date(stale[0].lastRunAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
        : '從未記錄';
      await pushMessage(
        `⚠️ 提醒輪詢好像沒有正常運作\n最後執行時間：${last}\n請檢查外部排程服務（例如 cron-job.org）是不是還在正常戳 /api/cron/remind。`
      );
    }

    const digest = await handleMorning();
    await pushMessage(digest);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Cron morning error:', err);
    return res.status(500).json({ error: err.message });
  }
};
