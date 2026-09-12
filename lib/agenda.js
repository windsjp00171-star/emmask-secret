// 從會議記錄裡把「有日期的議程」抽出來，變成行事曆上的項目。
//
// 為什麼用 AI 而不是正規表示式：實際的會議記錄長這樣
//   5.全台聯合禱告會：9/02(三)澎湖靈糧福音中心←9/9看回放、10/06(二)夏凱納靈糧堂、11/03(二)花蓮美崙浸信會
//   8.8/29小組長月會-泉屋便當140 06-2411062
//   10.孟偉吉他課費用一個月送一次(300/次)
// 一行可能有三個不同日期的活動、各自有地點；而且同一段文字裡混著電話號碼、
// 金額、數量。用規則拆不乾淨，也很容易把「06-2411062」當成日期。
//
// AI 失敗時回空陣列 —— 會議記錄本身照常存檔，只是沒有自動排進日曆。
const { callGemini, extractJson, isDailyQuotaError } = require('./gemini');
const { markExhausted } = require('./quota');
const { normalizeTaipeiISO } = require('./time');

const SYSTEM_PROMPT = `你從教會的會議記錄裡，找出「已經確定日期的活動或行程」，好排進行事曆。

只抽出這種：在某個特定日期會發生的事，或必須在某個日期前完成的事。

絕對不要抽出：
- 金額、價格、電話號碼、數量、頁數（例如「便當140」「06-2411062」「300/次」「100張」「80份」）
- 沒有明確日期的事項（例如「持續研擬中」「要做回報」）
- 會議本身（這場會議的日期和名稱不用再排一次）

注意事項：
- 同一行可能有好幾個不同日期的活動，要拆成好幾筆，各自帶自己的地點或說明
- 內容重複的（同一件事在記錄裡被提到兩次）只留一筆，把資訊合併起來
- content 寫成簡短好讀的一句話，有地點就帶上地點
- 日期沒寫年份時，用會議日期往後推最近的那個（例如會議在 2026/08，寫 9/02 就是 2026-09-02，寫 1/26 就是 2027-01-26）
- 有寫年份就照寫的年份
- 日期區間（例如 1/26~29）用開始那天
- 只有月份沒有日（例如「9月份核心同工會」）就不要抽，那不算確定日期
- 但同一項裡若有括號補上確切日期（例如「9月份核心同工會(9/2)」），就用括號裡的日期抽出來

只輸出 JSON，不要其他文字：
{"items": [{"content": "活動描述", "date": "YYYY-MM-DD"}]}
沒有任何符合的就回 {"items": []}`;

// 同一份記錄裡同一天的同一件事只留一筆。
// 實際資料就有「4.8/29小組長月會」跟「8.8/29小組長月會-泉屋便當」這種重複。
function dedupe(items) {
  const seen = new Map();
  for (const it of items) {
    const key = `${it.due_date}|${it.content}`;
    if (!seen.has(key)) seen.set(key, it);
  }
  return [...seen.values()];
}

// 把模型輸出整理成可以直接寫進資料庫的樣子。純函式，方便測試。
function sanitizeItems(raw) {
  const list = raw && Array.isArray(raw.items) ? raw.items : [];
  const out = [];
  for (const it of list) {
    if (!it || typeof it.content !== 'string') continue;
    const content = it.content.trim();
    if (!content) continue;
    // 只收 YYYY-MM-DD，其他格式一律丟掉，不要猜
    if (typeof it.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(it.date.trim())) continue;
    const due = normalizeTaipeiISO(it.date.trim());
    if (!due) continue;
    out.push({ content, due_date: due });
  }
  return dedupe(out);
}

async function extractAgendaItems(content, meetingDateISO) {
  if (!process.env.GEMINI_API_KEY) return [];
  const text = String(content || '').trim();
  if (!text) return [];

  const meetingDay = meetingDateISO
    ? new Date(meetingDateISO).toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    })
    : '未知';

  try {
    const out = await callGemini({
      system: SYSTEM_PROMPT,
      parts: [{ text: `會議日期：${meetingDay}\n\n會議記錄：\n${text}` }],
      json: true,
    });
    return sanitizeItems(extractJson(out));
  } catch (err) {
    console.error('Agenda extract error:', err);
    if (isDailyQuotaError(err)) await markExhausted();
    return [];
  }
}

module.exports = { extractAgendaItems, _test: { sanitizeItems, dedupe, SYSTEM_PROMPT } };
