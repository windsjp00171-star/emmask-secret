const crypto = require('crypto');
const { dispatch, handlePostback, handleImageEvents, handleStoredImage } = require('../lib/commands');
const { replyMessage, pushMessage, getImageBase64, withQuickReply } = require('../lib/line');
const { importSchedulePdf } = require('../lib/worship');
const { extractEventFromImage } = require('../lib/vision');
const { transcribeAudio, withHeard, MAX_SECONDS } = require('../lib/voice');
const { uploadImage } = require('../lib/storage');
const { isStoreImageMode, setState } = require('../lib/botstate');

// 還沒設定 LINE_USER_ID（剛部署好）時，直接告訴對方自己的 userId，
// 並記下來讓設定精靈頁面可以一鍵複製，不用再去翻 LINE Developers。
async function replyOwnerSetup(event) {
  const userId = event.source && event.source.userId;
  if (!userId || !event.replyToken) return;
  await setState('pending_owner_id', { userId, at: new Date().toISOString() });
  await replyMessage(event.replyToken, [
    '👋 嗨！小秘書還不知道誰是主人。',
    '',
    '你的 LINE userId 是：',
    userId,
    '',
    '請把它填到 Vercel 的環境變數 LINE_USER_ID，然後 Redeploy。',
    '（設定精靈頁面 /setup.html 也有一鍵複製）',
  ].join('\n'));
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
      const replyToken = event.replyToken;
      try {
        // 這是私人小秘書：只服務主人。其他人加好友傳訊息一律不理，也不會寫進資料庫。
        const owner = process.env.LINE_USER_ID;
        if (!owner) {
          if (event.type === 'message') await replyOwnerSetup(event);
          return;
        }
        if (!event.source || event.source.userId !== owner) return;

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
          await replyMessage(replyToken, withQuickReply(reply));
          return;
        }

        // 語音訊息：轉成文字後照打字處理，回覆最上面附「聽到：…」方便核對
        if (event.message.type === 'audio') {
          if ((event.message.duration || 0) > MAX_SECONDS * 1000) {
            await replyMessage(replyToken, `🎤 語音太長了，${MAX_SECONDS / 60} 分鐘以內比較聽得準，分段說或直接打字吧。`);
            return;
          }
          const { base64, contentType } = await getImageBase64(event.message.id);
          const heard = await transcribeAudio(base64, contentType);
          if (heard.error) {
            await replyMessage(replyToken, heard.error);
            return;
          }
          await replyMessage(replyToken, withQuickReply(withHeard(heard.text, await dispatch(heard.text))));
          return;
        }

        // 圖片訊息：一律先存檔留底，再決定要不要跑 AI 辨識
        if (event.message.type === 'image') {
          const { base64, contentType } = await getImageBase64(event.message.id);
          const imagePath = await uploadImage(base64, contentType);

          // 「存圖」模式：只留檔，不燒 AI 額度
          if (await isStoreImageMode()) {
            const reply = await handleStoredImage(imagePath);
            await replyMessage(replyToken, reply);
            return;
          }

          const extracted = await extractEventFromImage(base64, contentType);
          const reply = await handleImageEvents(extracted, imagePath);
          await replyMessage(replyToken, reply);
          return;
        }

        // 服事表 PDF（會覆蓋那幾個主日）。讀表要十幾秒，先回覆再推播結果。
        if (event.message.type === 'file' && /\.pdf$/i.test(event.message.fileName || '')) {
          await replyMessage(replyToken, '📄 收到服事表，解析中…');
          try {
            const { base64 } = await getImageBase64(event.message.id);
            await pushMessage(await importSchedulePdf(base64));
          } catch (err) {
            // replyToken 已用掉，失敗只能用推播告知
            console.error('Worship PDF import error:', err);
            await pushMessage('❌ 服事表匯入失敗，請稍後再試。');
          }
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
