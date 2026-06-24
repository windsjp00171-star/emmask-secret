const { Client } = require('@line/bot-sdk');
const https = require('https');

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

module.exports = { replyMessage, pushMessage, getImageBase64 };
