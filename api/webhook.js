const crypto = require('crypto');
const { dispatch } = require('../lib/commands');
const { replyMessage } = require('../lib/line');

function verifySignature(body, signature) {
  const hash = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['x-line-signature'];
  const rawBody = JSON.stringify(req.body);

  if (!verifySignature(rawBody, signature)) {
    console.error('Invalid LINE signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  const events = req.body.events || [];

  await Promise.all(
    events.map(async event => {
      if (event.type !== 'message' || event.message.type !== 'text') return;

      const text = event.message.text;
      const replyToken = event.replyToken;

      try {
        const reply = await dispatch(text);
        await replyMessage(replyToken, reply);
      } catch (err) {
        console.error('Handler error:', err);
        await replyMessage(replyToken, '❌ 發生錯誤，請稍後再試。');
      }
    })
  );

  return res.status(200).json({ ok: true });
};
