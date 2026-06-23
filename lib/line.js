const { Client } = require('@line/bot-sdk');

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

async function replyMessage(replyToken, reply) {
  return client.replyMessage(replyToken, toMessages(reply));
}

// 接受字串（文字訊息）、訊息物件或陣列
function toMessages(reply) {
  if (typeof reply === 'string') return { type: 'text', text: reply };
  if (Array.isArray(reply)) return reply;
  if (reply && reply.type === 'flex') {
    return { type: 'flex', altText: reply.altText || '訊息', contents: reply.contents };
  }
  return reply;
}

async function pushMessage(reply) {
  return client.pushMessage(process.env.LINE_USER_ID, toMessages(reply));
}

// 下載 LINE 圖片訊息內容，回傳 base64
async function getImageBase64(messageId) {
  const stream = await client.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('base64');
}

module.exports = { replyMessage, pushMessage, getImageBase64 };
