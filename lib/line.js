const { Client } = require('@line/bot-sdk');
const https = require('https');

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

async function replyMessage(replyToken, reply) {
  return client.replyMessage(replyToken, toMessages(reply));
}

// 接受字串（文字訊息）、訊息物件或陣列
function toMessage(reply) {
  if (typeof reply === 'string') return { type: 'text', text: reply };
  if (reply && reply.type === 'flex') {
    return { type: 'flex', altText: reply.altText || '訊息', contents: reply.contents };
  }
  return reply;
}

function toMessages(reply) {
  if (Array.isArray(reply)) return reply.map(toMessage);
  return toMessage(reply);
}

// 輸入框上方的快捷按鈕：常用查詢點一下就好，不用打字。
// 圖文選單在鍵盤打開時會被收起來，這排按鈕剛好補上那個時候。
const QUICK_ITEMS = [
  ['📅 今天', '今天'],
  ['✅ 待辦', '待辦'],
  ['🗓 本週', '本週'],
  ['💰 記帳', '記帳'],
  ['⛪ 服事表', '服事表'],
].map(([label, text]) => ({ type: 'action', action: { type: 'message', label, text } }));
QUICK_ITEMS.push(
  { type: 'action', action: { type: 'camera', label: '📷 拍照' } },
  { type: 'action', action: { type: 'cameraRoll', label: '🖼 傳照片' } },
);

// 掛在最後一則訊息上（LINE 只看最後一則）；已經有自己的快捷按鈕就不蓋掉
function withQuickReply(reply) {
  const msgs = toMessages(reply);
  const list = Array.isArray(msgs) ? msgs : [msgs];
  const last = list[list.length - 1];
  if (!last || last.quickReply) return msgs;
  list[list.length - 1] = { ...last, quickReply: { items: QUICK_ITEMS } };
  return Array.isArray(msgs) ? list : list[0];
}

async function pushMessage(reply) {
  return client.pushMessage(process.env.LINE_USER_ID, toMessages(reply));
}

// 下載 LINE 圖片訊息內容（直接打 api-data.line.me，避開 SDK 版本差異）
function getImageBase64(messageId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-data.line.me',
      path: `/v2/bot/message/${messageId}/content`,
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    };
    const req = https.request(options, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`LINE content HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        base64: Buffer.concat(chunks).toString('base64'),
        contentType: (res.headers['content-type'] || 'image/jpeg').split(';')[0].trim(),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { replyMessage, pushMessage, getImageBase64, withQuickReply };
module.exports._test = { toMessage, toMessages, QUICK_ITEMS };
