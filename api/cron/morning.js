const { pushMessage } = require('../../lib/line');
const { handleMorning } = require('../../lib/commands');
const { cronAuth } = require('../../lib/cron-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!cronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const digest = await handleMorning();
    await pushMessage(digest);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Cron morning error:', err);
    return res.status(500).json({ error: err.message });
  }
};
