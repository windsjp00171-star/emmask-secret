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

async function getFileContent(messageId) {
  const stream = await client.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = { replyMessage, pushMessage, getFileContent };
