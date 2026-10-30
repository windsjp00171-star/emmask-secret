const crypto = require('crypto');
const { dispatch, handlePostback, handleImageEvents, handleStoredImage } = require('../lib/commands');
const { replyMessage, pushMessage, getImageBase64, withQuickReply } = require('../lib/line');
const { importSchedulePdf } = require('../lib/worship');
const { extractEventFromImage } = require('../lib/vision');
const { transcribeAudio, withHeard, MAX_SECONDS } = require('../lib/voice');
const { uploadImage } = require('../lib/storage');
const { isStoreImageMode, setState } = require('../lib/botstate');
const { loadModules, isOn, disabledReply } = require('../lib/modules');
const memory = require('../lib/memory');

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
          const mem = await memory.isEnabled();
          const { value: reply, refNoteId } = await memory.track(mem, () => handlePostback(event.postback.data, event.postback.params));
          if (reply) {
            const sent = await replyMessage(replyToken, withQuickReply(reply));
            if (mem) await memory.rememberSent(sent, refNoteId);
          }
          if (mem && reply) await memory.record({ userText: null, botReply: reply, refNoteId });
          return;
        }
        if (event.type !== 'message') return;

        // 文字訊息
        if (event.message.type === 'text') {
          const mem = await memory.isEnabled();
          // 使用者長按小秘書的訊息按「回覆」：查那則訊息對應哪一筆事項
          const quoteRef = mem && event.message.quotedMessageId ? await memory.refForMessage(event.message.quotedMessageId) : null;
          const { value: reply, refNoteId } = await memory.track(mem, () => dispatch(event.message.text), { quoteRef });
          const sent = await replyMessage(replyToken, withQuickReply(reply));
          if (mem) await memory.rememberSent(sent, refNoteId);
          if (mem) await memory.record({ userText: event.message.text, botReply: reply, refNoteId });
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
          const mem = await memory.isEnabled();
          const { value: dispatched, refNoteId } = await memory.track(mem, () => dispatch(heard.text));
          const reply = withHeard(heard.text, dispatched);
          await replyMessage(replyToken, withQuickReply(reply));
          if (mem) await memory.record({ userText: heard.text, botReply: reply, refNoteId });
          return;
        }

        await loadModules();

        // 圖片訊息：一律先存檔留底，再決定要不要跑 AI 辨識
        if (event.message.type === 'image') {
          // 「傳圖辨識與相簿」沒開：不存檔、不辨識，直接說明
          if (!isOn('album')) {
            await replyMessage(replyToken, disabledReply('album'));
            return;
          }
          const { base64, contentType } = await getImageBase64(event.message.id);
          const imagePath = await uploadImage(base64, contentType);

          // 「存圖」模式：只留檔，不燒 AI 額度
          if (await isStoreImageMode()) {
            const reply = await handleStoredImage(imagePath);
            await replyMessage(replyToken, withQuickReply(reply));
            return;
          }

          const extracted = await extractEventFromImage(base64, contentType);
          const reply = await handleImageEvents(extracted, imagePath);
          await replyMessage(replyToken, withQuickReply(reply));
          return;
        }

        // 服事表 PDF（會覆蓋那幾個主日）。讀表要十幾秒，先回覆再推播結果。
        if (event.message.type === 'file' && /\.pdf$/i.test(event.message.fileName || '')) {
          if (!isOn('worship')) {
            await replyMessage(replyToken, disabledReply('worship'));
            return;
          }
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
