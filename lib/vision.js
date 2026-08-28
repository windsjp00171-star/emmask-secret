// 圖片辨識改用 Gemini（跟 classifier.js 同一套免費額度），不用再靠 Anthropic 儲值。
const { callGemini, extractJson } = require('./gemini');

// 從圖片擷取活動/事件與時間（海報、聚會通知、截圖、白板…）
async function extractEventFromImage(base64, mediaType = 'image/jpeg') {
  const today = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });

  const system = `你是行程擷取助手。使用者傳來一張圖片（可能是活動海報、聚會通知、訊息截圖、白板或手寫行程）。
請找出其中的「活動／事件」與對應「時間」。今天是 ${today}（時區 Asia/Taipei）。

規則：
- 沒寫年份就用最近的未來日期；沒寫時間 due_date 可為 null。
- content 用簡短一句話描述事件（含地點若有）。
- 只輸出 JSON，不要其他文字：
{"found": true/false, "items": [{"content": "事件描述", "due_date": "ISO 8601 或 null"}], "note": "若 found=false，用一句話描述圖片內容"}`;

  try {
    const text = await callGemini({
      system,
      parts: [
        { inline_data: { mime_type: mediaType, data: base64 } },
        { text: '請擷取圖片中的活動與時間，照規則輸出 JSON。' },
      ],
      json: true,
    });
    try {
      return extractJson(text);
    } catch (e) {
      return { found: false, note: '我看了圖片，但讀不太出明確的活動資訊。' };
    }
  } catch (err) {
    console.error('Vision error:', err);
    return { found: false, note: '圖片辨識失敗了，稍後再試試。' };
  }
}

module.exports = { extractEventFromImage };
