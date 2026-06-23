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

async function pushMessage(text) {
  return client.pushMessage(process.env.LINE_USER_ID, { type: 'text', text });
}

module.exports = { replyMessage, pushMessage };
