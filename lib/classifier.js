// 用 Google Gemini 免費額度做分類（每日固定額度重置，長期不用花錢）。
// 對外介面（classify(userInput) 回傳 { type, project, content, due_date, reply }）維持不變，
// 呼叫端（lib/commands.js）完全不用改。
const { callGemini, extractJson, isDailyQuotaError } = require('./gemini');
const { markExhausted } = require('./quota');
const { normalizeTaipeiISO } = require('./time');
const { getKnownProjects } = require('./projects');

const BASE_PROMPT = `你是 EmmArk 小秘書，一個有溫度的個人助理。分類使用者輸入並生成自然回覆。

分類規則：
- task：需要做的事。只要有時間詞（今天、明天、後天、下週、幾月幾號、早上、下午、晚上等），一律分類為 task 並填寫 due_date。
- reminder：明確要求「提醒我」或「記得提醒」的事，填寫 due_date。
- note：純筆記、想法、會議記錄、沒有任何時間或待辦性質的句子。
- project_update：關於某個專案的進度更新（完成了某功能、遇到某問題等）。

重要：有時間詞的句子絕對不能分類為 note，應為 task 或 reminder。

回覆規則（reply 欄位）：
- 用繁體中文，語氣自然像助理，不要太制式
- 1-2 句話，簡潔
- 可以確認記錄了什麼，或補充一句有用的話
- 不要用「好的」、「當然」等套話開頭
- 例："明天去阿秦家的行程記下了，需要提醒出發時間嗎？"
- 例："教會行事的進度更新記錄完成。"
- 例："筆記存好了。"

只輸出 JSON，不要其他文字，格式：
{
  "type": "task | reminder | note | project_update",
  "project": "專案名稱或 null",
  "content": "整理後的一句話摘要",
  "due_date": "ISO 8601 格式或 null，時區 Asia/Taipei",
  "reply": "給使用者看的自然回覆"
}`;

// 專案清單改成每次從實際資料撈，寫死在 prompt 裡幾個月後就完全過時了
function buildSystemPrompt(projects) {
  if (!projects || projects.length === 0) return BASE_PROMPT;
  return `${BASE_PROMPT}

使用者目前在用的專案（依常用程度排序，判斷 project 欄位時優先從這裡挑，
名稱要完全照抄，不要自己改寫或創新的名稱）：
${projects.join('、')}

挑專案時要注意：
- 內容真的屬於那個專案才填，不確定就填 null。留空比硬塞一個錯的好
- 不要因為字面上剛好有相同的字就硬套。例如專案名稱裡的括號註記
  （像「(安南)」是分堂名稱）跟輸入裡的地名相同，不代表就是那個專案`;
}

async function classify(userInput) {
  const today = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const userMessage = `今天是：${today}\n使用者輸入：${userInput}`;

  try {
    const text = await callGemini({
      system: buildSystemPrompt(await getKnownProjects()),
      parts: [{ text: userMessage }],
      json: true,
    });
    const out = extractJson(text);
    // AI 常常回沒有時區的 ISO 字串，不補時區會整整晚 8 小時
    out.due_date = normalizeTaipeiISO(out.due_date);
    return out;
  } catch (err) {
    console.error('Classifier error:', err);
    if (isDailyQuotaError(err)) await markExhausted();
    return {
      type: 'note',
      project: null,
      content: userInput,
      due_date: null,
      // 讓呼叫端知道這是「AI 沒跑成功」的退回值，而不是 AI 真的判斷成筆記。
      // 沒有這個旗標，使用者會收到一則看起來完全正常的存檔確認。
      ai_failed: true,
      quota_exhausted: isDailyQuotaError(err),
    };
  }
}

module.exports = { classify, _test: { buildSystemPrompt, BASE_PROMPT } };
