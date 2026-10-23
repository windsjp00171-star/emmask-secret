const { Client } = require('@line/bot-sdk');
const https = require('https');
const { loadModules, isOn } = require('./modules');

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

async function replyMessage(replyToken, reply) {
  // 所有回覆（含錯誤訊息、收到檔案的提示）都掛快捷鈕；已經掛過的不會重複
  await loadModules();
  return client.replyMessage(replyToken, withQuickReply(reply));
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
// 第一排是「交辦」：點了直接打開鍵盤並預填開頭（或直接開語音），不用背指令。
// postback 的 fillInText／inputOption 在不支援的舊版 LINE 會被忽略。
const COMPOSE_ITEMS = [
  ['⏰ 提醒', '提醒 '],
  ['✅ 待辦', '待辦 '],
  ['📝 筆記', '筆記 '],
].map(([label, fill]) => ({
  type: 'action',
  action: { type: 'postback', label, data: 'act=noop', inputOption: 'openKeyboard', fillInText: fill },
}));
COMPOSE_ITEMS.push({ type: 'action', action: { type: 'postback', label: '🎤 語音', data: 'act=noop', inputOption: 'openVoice' } });

// 第三個欄位：這顆屬於哪個功能模組（沒有就是核心功能，永遠顯示）
const QUICK_DEFS = [
  ['📅 今天', '今天'],
  ['✅ 待辦清單', '待辦'],
  ['🗓 本週', '本週'],
  ['💰 記帳', '記帳', 'expenses'],
  ['⛪ 服事表', '服事表', 'worship'],
];
const CAMERA_DEFS = [
  { type: 'action', action: { type: 'camera', label: '📷 拍照' } },
  { type: 'action', action: { type: 'cameraRoll', label: '🖼 傳照片' } },
];
const QUICK_ITEMS = [
  ...COMPOSE_ITEMS,
  ...QUICK_DEFS.map(([label, text]) => ({ type: 'action', action: { type: 'message', label, text } })),
  ...CAMERA_DEFS,
];

// 依目前開啟的功能模組組出快捷鈕：關掉的功能不放按鈕，介面才不會一堆用不到的東西
function quickItems() {
  const msg = QUICK_DEFS
    .filter(([, , mod]) => !mod || isOn(mod))
    .map(([label, text]) => ({ type: 'action', action: { type: 'message', label, text } }));
  return [...COMPOSE_ITEMS, ...msg, ...(isOn('album') ? CAMERA_DEFS : [])];
}

// 掛在最後一則訊息上（LINE 只看最後一則）；已經有自己的快捷按鈕就不蓋掉
function withQuickReply(reply) {
  const msgs = toMessages(reply);
  const list = Array.isArray(msgs) ? msgs : [msgs];
  const last = list[list.length - 1];
  if (!last || last.quickReply) return msgs;
  list[list.length - 1] = { ...last, quickReply: { items: quickItems() } };
  return Array.isArray(msgs) ? list : list[0];
}

async function pushMessage(reply) {
  // 主動推播（提醒、簡報、回顧）底下也掛快捷鈕，不然要等回覆過一則訊息才有
  await loadModules();
  return client.pushMessage(process.env.LINE_USER_ID, withQuickReply(reply));
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
