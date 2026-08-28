// 用 Google Gemini 免費額度做分類（每日固定額度重置，長期不用花錢）。
// 對外介面（classify(userInput) 回傳 { type, project, content, due_date, reply }）維持不變，
// 呼叫端（lib/commands.js）完全不用改。
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `你是 EmmArk 小秘書，一個有溫度的個人助理。分類使用者輸入並生成自然回覆。

分類規則：
- task：需要做的事。只要有時間詞（今天、明天、後天、下週、幾月幾號、早上、下午、晚上等），一律分類為 task 並填寫 due_date。
- reminder：明確要求「提醒我」或「記得提醒」的事，填寫 due_date。
- note：純筆記、想法、會議記錄、沒有任何時間或待辦性質的句子。
- project_update：關於某個專案的進度更新（完成了某功能、遇到某問題等）。

重要：有時間詞的句子絕對不能分類為 note，應為 task 或 reminder。

已知專案列表：Cell Reporter, 天父日記, 教會入口, 資料交換中心, 整合型行政系統, PitchPal, 小秘書系統

回覆規則（reply 欄位）：
- 用繁體中文，語氣自然像助理，不要太制式
- 1-2 句話，簡潔
- 可以確認記錄了什麼，或補充一句有用的話
- 不要用「好的」、「當然」等套話開頭
- 例："明天去阿秦家的行程記下了，需要提醒出發時間嗎？"
- 例："Cell Reporter 的進度更新記錄完成。"
- 例："筆記存好了。"

只輸出 JSON，不要其他文字，格式：
{
  "type": "task | reminder | note | project_update",
  "project": "專案名稱或 null",
  "content": "整理後的一句話摘要",
  "due_date": "ISO 8601 格式或 null，時區 Asia/Taipei",
  "reply": "給使用者看的自然回覆"
}`;

async function classify(userInput) {
  const today = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const userMessage = `今天是：${today}\n使用者輸入：${userInput}`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        // gemini-3.6-flash 是推理模型，回答前會先花不少 token「思考」，
        // maxOutputTokens 太小會在思考階段就被截斷，導致最後拿不到任何文字
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No text in Gemini response');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('Classifier error:', err);
    return {
      type: 'note',
      project: null,
      content: userInput,
      due_date: null,
    };
  }
}

module.exports = { classify };
