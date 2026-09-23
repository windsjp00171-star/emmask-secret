// AI 額度用完時的警示。
//
// 為什麼需要這個：分類器的失敗路徑是「靜靜退回無標籤筆記」，使用者會收到
// 一則看起來完全正常的存檔確認，但分類沒了、時間也沒抓到。先前 Anthropic
// 帳號沒儲值時就是這樣壞了好幾個月都沒人發現。
//
// 這裡做兩件事：
//   1. 第一次撞到每日額度時，主動推一則 LINE 訊息（只推一次，不然每則訊息都會吵）
//   2. 之後的回覆改用「額度用完」的說法，而不是含糊的「暫時不能用」
const { getState, setState } = require('./botstate');

const KEY = 'ai_quota_exhausted';
// 旗標保留幾分鐘。時間到就自動清掉，下一次呼叫會重新探測 ——
// 這樣額度重置後不用手動處理，也不必猜 Google 幾點重置。
const FLAG_TTL_MIN = Number(process.env.QUOTA_FLAG_TTL_MIN || 90);

const NOTICE = [
  '⚠️ 今天的 AI 免費額度用完了',
  '',
  '額度重置後會自動恢復，不用做任何事。',
  '',
  '這段期間這些還是照常可以用（本來就不經過 AI）：',
  '・待辦 / 筆記 / 提醒 + 內容',
  '・搜尋、收藏、會議、存歌、順序',
  '・存圖（傳圖只存檔不辨識）',
  '',
  '受影響的是：直接打一句話自動分類、傳圖辨識、問答查詢。',
].join('\n');

// 使用者看到的短訊息，附在各功能的失敗回覆後面
const SHORT = 'AI 今天的免費額度用完了，重置後會自動恢復。現在可以用「待辦 內容」這類指令，不需要 AI。';

async function isExhausted() {
  return Boolean(await getState(KEY));
}

// 撞到每日額度時呼叫。第一次會推播通知，之後只更新旗標不再吵。
// pushMessage 是延遲載入的，避免 lib/line.js 在測試環境沒有 token 就爆掉。
async function markExhausted() {
  const already = await isExhausted();
  await setState(KEY, { at: new Date().toISOString() }, FLAG_TTL_MIN);
  if (already) return false;

  try {
    const { pushMessage } = require('./line');
    await pushMessage(NOTICE);
  } catch (err) {
    console.error('Quota notice push failed:', err);
  }
  return true;
}

module.exports = { isExhausted, markExhausted, KEY, SHORT, NOTICE, FLAG_TTL_MIN };
