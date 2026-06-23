const crypto = require('crypto');
const { dispatch, handlePostback, handleImageEvents } = require('../lib/commands');
const { replyMessage, getImageBase64 } = require('../lib/line');
const { extractEventFromImage } = require('../lib/vision');

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET || '';
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  console.log(`[webhook] bodyLen=${rawBody.length} secretLen=${secret.length} match=${hash === signature}`);
  return hash === signature;
}

const handler = async function (req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-line-signature'];

  if (!verifySignature(rawBody, signature)) {
    console.error('Invalid LINE signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  const body = JSON.parse(rawBody.toString('utf8'));
  const events = body.events || [];

  await Promise.all(
    events.map(async event => {
      const replyToken = event.replyToken;
      try {
        // Flex 按鈕（完成／延後／改明天）
        if (event.type === 'postback') {
          const reply = await handlePostback(event.postback.data);
          if (reply) await replyMessage(replyToken, reply);
          return;
        }
        if (event.type !== 'message') return;

        // 文字訊息
        if (event.message.type === 'text') {
          const reply = await dispatch(event.message.text);
          await replyMessage(replyToken, reply);
          return;
        }

        // 圖片訊息 → Claude 視覺擷取活動並建立提醒
        if (event.message.type === 'image') {
          const b64 = await getImageBase64(event.message.id);
          const extracted = await extractEventFromImage(b64, 'image/jpeg');
          const reply = await handleImageEvents(extracted);
          await replyMessage(replyToken, reply);
          return;
        }
      } catch (err) {
        console.error('Handler error:', err);
        if (replyToken) await replyMessage(replyToken, '❌ 發生錯誤，請稍後再試。');
      }
    })
  );

  return res.status(200).json({ ok: true });
};

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
