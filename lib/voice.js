// 語音訊息：先轉成文字，再當成一般打字訊息處理。
//
// 用說的比打字快，尤其是走路、開車、手上有東西的時候。
// 轉完的文字直接丟進 dispatch，所以「明天下午三點看牙醫」「這個月花了多少」
// 這些口語用法講出來也一樣能用，不用另外寫一套。
const { callGemini, isDailyQuotaError } = require('./gemini');
const { markExhausted, SHORT: QUOTA_SHORT } = require('./quota');

// 太長的多半不是指令，而是想錄音存檔；而且越長越容易轉錯、越花額度
const MAX_SECONDS = 120;

const PROMPT = `你是逐字稿助手。把語音內容轉成繁體中文文字。
- 只輸出講的內容本身，不要加引號、標題或任何說明
- 數字、日期、時間照講的內容寫（例如「明天下午三點」「10/4」「120 元」）
- 聽不到人聲或完全聽不清楚，就只輸出：（聽不清楚）`;

// LINE 的語音是 m4a（AAC 裝在 MP4 容器裡），標準 MIME 是 audio/mp4
function audioMime(contentType) {
  const t = String(contentType || '').toLowerCase();
  // 沒帶或帶了奇怪的類型（下載函式缺省會填 image/jpeg）都當 m4a
  if (!t.startsWith('audio/') || t === 'audio/x-m4a' || t === 'audio/m4a') return 'audio/mp4';
  return t;
}

// 回傳 { text } 或 { error: '給使用者看的訊息' }
async function transcribeAudio(base64, contentType) {
  try {
    const raw = await callGemini({
      system: PROMPT,
      parts: [
        { inline_data: { mime_type: audioMime(contentType), data: base64 } },
        { text: '請轉成文字。' },
      ],
      maxOutputTokens: 1000,
    });
    const text = cleanTranscript(raw);
    if (!text) return { error: '🎤 沒聽清楚，再說一次，或直接打字也可以。' };
    return { text };
  } catch (err) {
    console.error('Voice transcribe error:', err);
    if (isDailyQuotaError(err)) {
      await markExhausted();
      return { error: QUOTA_SHORT };
    }
    return { error: '🎤 語音轉文字失敗了，稍後再試，或直接打字。' };
  }
}

function cleanTranscript(raw) {
  const text = String(raw || '').trim().replace(/^["「『]+|["」』]+$/g, '').trim();
  if (!text || /^[（(]?聽不清楚[）)]?$/.test(text)) return '';
  return text;
}

// 在回覆最前面加一行「聽到：…」，說錯了一眼就看得出來。
// LINE 一次最多回 5 則訊息，超過就把最後幾則丟掉（實際上指令回覆不會超過 2 則）。
function withHeard(text, reply) {
  const heard = `🎤 聽到：「${text}」`;
  if (!reply) return heard;
  if (typeof reply === 'string') return `${heard}\n\n${reply}`;
  const rest = Array.isArray(reply) ? reply : [reply];
  return [heard, ...rest].slice(0, 5);
}

module.exports = { transcribeAudio, withHeard, MAX_SECONDS, _test: { audioMime, cleanTranscript } };
