const crypto = require('crypto');
const { dispatch } = require('../lib/commands');
const { replyMessage, pushMessage, getFileContent } = require('../lib/line');
const { importSchedulePdf } = require('../lib/worship');

// Only the owner may import a schedule PDF (it overwrites those Sundays)
async function handlePdf(event) {
  if (event.source.userId !== process.env.LINE_USER_ID) return;
  await replyMessage(event.replyToken, '📄 收到服事表，解析中，約需 30 秒…');
  try {
    const pdf = await getFileContent(event.message.id);
    await pushMessage(await importSchedulePdf(pdf));
  } catch (err) {
    console.error('PDF import error:', err);
    await pushMessage('❌ 服事表匯入失敗，請稍後再試。');
  }
}

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
      if (event.type !== 'message') return;
      if (event.message.type === 'file' && /\.pdf$/i.test(event.message.fileName || '')) return handlePdf(event);
      if (event.message.type !== 'text') return;
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

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
