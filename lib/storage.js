// 圖片存檔：把 LINE 傳來的圖片放進 Supabase Storage。
//
// LINE 的圖片內容只保留一段時間就會被清掉，所以不能只記 message id，
// 一定要自己把 bytes 抓下來存。bucket 是私有的，前台要看圖時再簽短效網址。
const supabase = require('./supabase');

const BUCKET = process.env.IMAGE_BUCKET || 'note-images';
// 前台看圖用的簽名網址有效期限（秒）
const SIGNED_URL_TTL = Number(process.env.IMAGE_URL_TTL || 3600);

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// 依日期分資料夾，之後要人工翻檔案比較好找
function buildPath(contentType, now = new Date()) {
  const ext = EXT_BY_TYPE[contentType] || 'jpg';
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const y = taipei.getFullYear();
  const m = String(taipei.getMonth() + 1).padStart(2, '0');
  const d = String(taipei.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 10);
  return `${y}/${m}/${y}${m}${d}-${Date.now()}-${rand}.${ext}`;
}

// 存圖失敗不該讓整個流程掛掉（AI 辨識的結果還是要能存進去），
// 所以這裡失敗就回 null，呼叫端自己決定要不要提示。
async function uploadImage(base64, contentType = 'image/jpeg') {
  try {
    const path = buildPath(contentType);
    const buffer = Buffer.from(base64, 'base64');
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (error) throw error;
    return path;
  } catch (err) {
    console.error('Image upload error:', err);
    return null;
  }
}

// 私有 bucket，要看圖得簽一個短效網址
async function getSignedUrl(path) {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    if (error) throw error;
    return data ? data.signedUrl : null;
  } catch (err) {
    console.error('Signed URL error:', err);
    return null;
  }
}

async function deleteImage(path) {
  if (!path) return false;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Image delete error:', err);
    return false;
  }
}

module.exports = { uploadImage, getSignedUrl, deleteImage, BUCKET, _test: { buildPath, EXT_BY_TYPE } };
