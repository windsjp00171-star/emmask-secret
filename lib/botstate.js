// 小秘書的短暫狀態（存在 bot_state 表）。
// 目前只有一個用途：使用者打「存圖」之後，接下來一小段時間傳的圖只存檔、不跑 AI。
//
// 為什麼要有時效：忘記關掉的話，之後傳海報就不會建提醒了，使用者會覺得壞掉。
// 給一個到期時間，忘了關也會自己恢復正常。
const supabase = require('./supabase');

const STORE_IMAGE_KEY = 'store_image_mode';
const DEFAULT_TTL_MINUTES = Number(process.env.STORE_IMAGE_TTL_MIN || 5);

function isExpired(row, now = new Date()) {
  if (!row) return true;
  if (!row.expires_at) return false; // 沒設到期就是不會過期
  return new Date(row.expires_at).getTime() <= now.getTime();
}

// 通用的狀態讀寫，讓別的短暫旗標（例如 AI 額度用完）也能共用同一張表
async function setState(key, value, minutes) {
  const row = {
    key,
    value,
    expires_at: minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('bot_state').upsert(row);
  if (error) {
    console.error(`setState(${key}) error:`, error);
    return null;
  }
  return row;
}

async function getState(key) {
  const { data, error } = await supabase.from('bot_state').select('*').eq('key', key).maybeSingle();
  if (error) {
    console.error(`getState(${key}) error:`, error);
    return null;
  }
  if (!data) return null;
  if (isExpired(data)) {
    await supabase.from('bot_state').delete().eq('key', key);
    return null;
  }
  return data.value;
}

async function clearState(key) {
  const { error } = await supabase.from('bot_state').delete().eq('key', key);
  if (error) console.error(`clearState(${key}) error:`, error);
}

async function setStoreImageMode(minutes = DEFAULT_TTL_MINUTES) {
  const expires = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const { error } = await supabase.from('bot_state').upsert({
    key: STORE_IMAGE_KEY,
    value: { on: true },
    expires_at: expires,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('setStoreImageMode error:', error);
    return null;
  }
  return { minutes, expiresAt: expires };
}

async function clearStoreImageMode() {
  const { error } = await supabase.from('bot_state').delete().eq('key', STORE_IMAGE_KEY);
  if (error) console.error('clearStoreImageMode error:', error);
}

// 過期的狀態順手刪掉，免得一直留著
async function isStoreImageMode() {
  const { data, error } = await supabase.from('bot_state').select('*').eq('key', STORE_IMAGE_KEY).maybeSingle();
  if (error) {
    console.error('isStoreImageMode error:', error);
    return false;
  }
  if (!data) return false;
  if (isExpired(data)) {
    await clearStoreImageMode();
    return false;
  }
  return Boolean(data.value && data.value.on);
}

module.exports = {
  setState,
  getState,
  clearState,
  setStoreImageMode,
  clearStoreImageMode,
  isStoreImageMode,
  STORE_IMAGE_KEY,
  DEFAULT_TTL_MINUTES,
  _test: { isExpired },
};
