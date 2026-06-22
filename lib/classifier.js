const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `你是一個個人秘書助理。把使用者輸入的一句話分類並萃取成 JSON。

分類規則：
- task：需要做的事。只要有時間詞（今天、明天、後天、下週、幾月幾號、早上、下午、晚上等），一律分類為 task 並填寫 due_date。
- reminder：明確要求「提醒我」或「記得提醒」的事，填寫 due_date。
- note：純筆記、想法、會議記錄、沒有任何時間或待辦性質的句子。
- project_update：關於某個專案的進度更新（完成了某功能、遇到某問題等）。

重要：有時間詞的句子絕對不能分類為 note，應為 task 或 reminder。

已知專案列表：Cell Reporter, 天父日記, 教會入口, 資料交換中心, 整合型行政系統, PitchPal, 小秘書系統

輸出格式（只輸出 JSON，不要其他文字）：
{
  "type": "task | reminder | note | project_update",
  "project": "專案名稱或 null",
  "content": "整理後的一句話摘要",
  "due_date": "ISO 8601 格式或 null，時區 Asia/Taipei"
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
      max_tokens: 256,
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
