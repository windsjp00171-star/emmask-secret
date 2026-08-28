// 圖片辨識：先判斷這是哪一種圖，再抽出對應的結構化欄位。
//
// 支援四種：
//   event   活動海報/聚會通知 → 建立提醒（原本就有的功能）
//   receipt 收據/發票        → 記一筆帳
//   board   白板/會議記錄     → 存成會議記錄，並把待辦拆出來
//   contact 名片            → 存成聯絡人
// 判斷不出來就回 found=false，讓使用者自己打字，不要亂猜。
const { callGemini, extractJson } = require('./gemini');
const { normalizeTaipeiISO } = require('./time');

const KINDS = ['event', 'receipt', 'board', 'contact'];

function buildPrompt(today) {
  return `你是圖片理解助手。使用者傳來一張圖片，請先判斷它屬於哪一類，再抽出對應資訊。
今天是 ${today}（時區 Asia/Taipei）。

類別與對應欄位：

1. event（活動海報、聚會通知、行程截圖）
   items: [{ "content": "事件描述（含地點）", "due_date": "ISO 8601 或 null" }]

2. receipt（收據、發票、帳單、消費明細）
   items: [{ "content": "消費描述", "due_date": null,
             "meta": { "amount": 數字, "merchant": "店家", "category": "餐飲/交通/文具/設備/其他",
                       "date": "YYYY-MM-DD 或 null" } }]
   - amount 一律填「總金額」的數字，不要帶貨幣符號或逗號
   - 看不清楚金額就不要猜，填 null

3. board（白板、手寫會議記錄、便條紙）
   items: [{ "content": "整理後的會議記錄全文（保留條列）", "due_date": null,
             "meta": { "todos": ["待辦一", "待辦二"] } }]
   - todos 只放明確是「要有人去做」的事，沒有就給空陣列

4. contact（名片）
   items: [{ "content": "姓名（公司/職稱）", "due_date": null,
             "meta": { "name": "姓名", "org": "公司", "title": "職稱",
                       "phone": "電話", "email": "email" } }]
   - 沒有的欄位填 null，不要編造

規則：
- 沒寫年份的日期就用最近的未來日期
- 判斷不出屬於哪一類，或圖片裡沒有有用資訊，就回 found: false
- 只輸出 JSON，不要其他文字：
{"found": true/false, "kind": "event|receipt|board|contact",
 "items": [...],
 "note": "若 found=false，用一句話描述圖片內容"}`;
}

// 只留下我們認得的欄位，避免模型自由發揮的東西直接寫進資料庫
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') {
    return { found: false, note: '我看了圖片，但讀不太出有用的資訊。' };
  }
  if (!raw.found) {
    return { found: false, note: typeof raw.note === 'string' && raw.note ? raw.note : '我看了圖片，但讀不太出有用的資訊。' };
  }

  const kind = KINDS.includes(raw.kind) ? raw.kind : 'event';
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((it) => it && typeof it.content === 'string' && it.content.trim())
    .map((it) => ({
      content: it.content.trim(),
      due_date: normalizeTaipeiISO(it.due_date),
      meta: it.meta && typeof it.meta === 'object' && !Array.isArray(it.meta) ? it.meta : null,
    }));

  if (items.length === 0) {
    return { found: false, note: typeof raw.note === 'string' && raw.note ? raw.note : '我看了圖片，但讀不太出有用的資訊。' };
  }
  return { found: true, kind, items };
}

async function extractEventFromImage(base64, mediaType = 'image/jpeg') {
  const today = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });

  try {
    const text = await callGemini({
      system: buildPrompt(today),
      parts: [
        { inline_data: { mime_type: mediaType, data: base64 } },
        { text: '請判斷圖片類別並照規則輸出 JSON。' },
      ],
      json: true,
    });
    try {
      return sanitize(extractJson(text));
    } catch (e) {
      return { found: false, note: '我看了圖片，但讀不太出有用的資訊。' };
    }
  } catch (err) {
    console.error('Vision error:', err);
    return { found: false, note: '圖片辨識失敗了，稍後再試試。' };
  }
}

module.exports = { extractEventFromImage, _test: { sanitize, KINDS } };
