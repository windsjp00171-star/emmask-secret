const { Client } = require('@line/bot-sdk');

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

async function replyMessage(replyToken, text) {
  return client.replyMessage(replyToken, { type: 'text', text });
}

async function pushMessage(text) {
  return client.pushMessage(process.env.LINE_USER_ID, { type: 'text', text });
}

module.exports = { replyMessage, pushMessage };
