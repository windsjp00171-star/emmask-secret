// Gemini API 的共用呼叫層。
//
// 原本 classifier / vision / summarize / ask 各自寫了一份 fetch，
// 模型名稱、token 上限、錯誤處理都是複製貼上的，改一個地方要改四次。
// 這裡收斂成一支，順便統一處理「暫時性錯誤要重試」。
//
// 模型選擇：預設用 gemini-3.1-flash-lite。
// - gemini-3.6-flash 免費額度每天只有 20 次（實測撞到 429，quotaValue: 20），
//   對一個每則訊息都要分類的 bot 來說完全不夠用。
// - flash-lite 不是推理模型（thoughtsTokenCount 為 0），不會在「思考」階段
//   燒掉 token，速度較快，也不會發生回答被截斷的問題。
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const URL_FOR = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

// 429（額度用盡/太頻繁）與 5xx（服務忙碌）都是暫時性的，值得重試一次。
// 實測就遇過 503 "This model is currently experiencing high demand"。
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
// 主要模型忙線（5xx）時，第二次改試備用模型：實測就遇過主模型整段時間 503 "high demand"，
// 同一個模型連打兩次都一樣忙。備用模型的額度也是分開算的。GEMINI_FALLBACK_MODEL 設成空字串就關掉。
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL === undefined ? 'gemini-3.5-flash-lite' : process.env.GEMINI_FALLBACK_MODEL;
const RETRY_DELAY_MS = Number(process.env.GEMINI_RETRY_DELAY_MS || 800);

function isRetryable(status) {
  return RETRYABLE.has(status);
}

// 429 有兩種：每分鐘太頻繁（幾秒後就好），跟每日額度用完（要等重置）。
// 錯誤內容裡的 quotaId 會寫 PerDay 或 PerMinute，差很多，要分開處理。
function isQuotaError(err) {
  return Boolean(err && err.status === 429);
}
function isDailyQuotaError(err) {
  return isQuotaError(err) && /PerDay/i.test(String(err.message || ''));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// parts：Gemini 的 contents[].parts，可以是 [{text}] 或 [{inline_data}, {text}]
// json：true 時要求模型回傳 application/json
async function callGemini({ system, parts, json = false, maxOutputTokens = 2000, model = MODEL, label = '其他' }) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens },
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };
  if (json) body.generationConfig.responseMimeType = 'application/json';

  let lastErr;
  let primaryErr = null; // 主模型那次的錯誤；備用模型也失敗時，使用者該看到的是這個原因
  const requested = model;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS);
      // 只有呼叫端用預設模型、而且上一次是忙線（不是額度 429）才換備用模型
      if (FALLBACK_MODEL && requested === MODEL && FALLBACK_MODEL !== MODEL && lastErr && lastErr.status >= 500) {
        primaryErr = lastErr;
        model = FALLBACK_MODEL;
      }
    }

    const res = await fetch(`${URL_FOR(model)}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // 被擋掉的 429 不算用掉額度；其餘只要有送出去就記一次
    if (res.status !== 429) await require('./usage').note(model, label);

    if (!res.ok) {
      const detail = await res.text();
      lastErr = new Error(`Gemini HTTP ${res.status}: ${detail}`);
      lastErr.status = res.status;
      if (isRetryable(res.status)) continue;
      // 備用模型不能用（例如 404 已下架）：不要讓這個錯誤蓋掉真正的原因（主模型忙線）
      if (primaryErr && model !== requested) {
        console.error(`備用模型 ${model} 不能用，請檢查 GEMINI_FALLBACK_MODEL：${lastErr.message.slice(0, 200)}`);
        throw primaryErr;
      }
      throw lastErr;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      lastErr = new Error('No text in Gemini response');
      // 沒拿到文字通常不是暫時性問題（例如被安全設定擋掉），不重試
      throw lastErr;
    }
    return text;
  }

  throw lastErr;
}

// 從模型輸出裡挖出 JSON 物件。要求 JSON 輸出時偶爾還是會包在說明文字裡。
function extractJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON found in response');
  return JSON.parse(m[0]);
}

module.exports = {
  callGemini, extractJson, MODEL, isQuotaError, isDailyQuotaError,
  _test: { isRetryable },
};
