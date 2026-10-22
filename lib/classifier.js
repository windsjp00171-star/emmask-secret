const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `你是 EmmArk 小秘書，一個有溫度的個人助理。分類使用者輸入並生成自然回覆。

分類規則：
- task：需要做的事。只要有時間詞（今天、明天、後天、下週、幾月幾號、早上、下午、晚上等），一律分類為 task 並填寫 due_date。
- reminder：明確要求「提醒我」或「記得提醒」的事，填寫 due_date。
- note：純筆記、想法、會議記錄、沒有任何時間或待辦性質的句子。
- project_update：關於某個專案的進度更新（完成了某功能、遇到某問題等）。

重要：有時間詞的句子絕對不能分類為 note，應為 task 或 reminder。

已知專案列表：Cell Reporter, 天父日記, 教會入口, 資料交換中心, 整合型行政系統, PitchPal, 小秘書系統, 群體共讀靈修, 聖經互動全書, 美食獵人, 教會帳務系統, 作品集官網

專案別名對照（使用者可能用任一種說法，一律歸到左邊的正式名稱）：
- Cell Reporter：小組回報、小組回報系統、cell_reporter
- 天父日記：靈修日記、tianfu、tianfu-diary
- 教會入口：活動報名、活動報名系統、報名系統、event-registration
- 資料交換中心：檔案分享、data hub、church-data-hub
- 整合型行政系統：整合系統、教會管理系統、demo 站、Church-Management-System-demo
- PitchPal：移調工具、Key 工具、pitchpal
- 小秘書系統：小秘書、emmask、emmask-secret
- 群體共讀靈修：GROUP、GROUP-Devotion、共讀、群讀
- 聖經互動全書：聖經全書、標註引擎、actionbook、bibile-actionbook
- 美食獵人：獵人執照、美食狩獵、fooding-hunter
- 教會帳務系統：帳務、財報、財務報表、Church-Financial-Statements
- 作品集官網：作品集、個人網站、CLAUDE-DESIGN

判斷不出屬於哪個專案時，project 留空，不要硬猜一個。

回覆規則（reply 欄位）：
- 用繁體中文，語氣自然像助理，不要太制式
- 1-2 句話，簡潔
- 可以確認記錄了什麼，或補充一句有用的話
- 不要用「好的」、「當然」等套話開頭
- 例："明天去阿秦家的行程記下了，需要提醒出發時間嗎？"
- 例："Cell Reporter 的進度更新記錄完成。"
- 例："筆記存好了。"

輸出格式（只輸出 JSON，不要其他文字）：
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
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].text.trim();
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
