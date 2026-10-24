// 語音提醒（實驗中）：文字 → Gemini TTS → m4a → 存到 Supabase → LINE 語音訊息。
//
// 為什麼要轉檔：LINE 的語音訊息只收 m4a，而 Gemini TTS 吐的是 24kHz 的原始 PCM。
// Vercel 上沒有 ffmpeg，所以用 ffmpeg-static 帶一支進來（約 80MB，在函式大小上限內）。
//
// 每個階段失敗都回得出是「哪一步」壞掉，因為這是實驗功能，要靠錯誤訊息知道卡在哪。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const supabase = require('./supabase');
const { isDailyQuotaError } = require('./gemini');
const { markExhausted } = require('./quota');

// 圖片的 bucket 有限制只收圖片格式（上傳 audio/mp4 會被擋），所以語音另開一個 bucket
const VOICE_BUCKET = process.env.VOICE_BUCKET || 'voice-notes';
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Charon';
const PCM_RATE = 24000; // Gemini TTS 固定輸出 24kHz、16-bit、單聲道
const MAX_CHARS = 120; // LINE 語音上限 1 分鐘，提醒也不需要唸很長
// LINE 抓音檔用的簽名網址要撐到使用者點開來播
const URL_TTL_SEC = 7 * 24 * 3600;

// 要唸的稿：去掉網址（唸出來是一長串亂碼），太長就截斷
function buildSpeech(content) {
  const clean = String(content || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const body = [...clean].length > MAX_CHARS ? `${[...clean].slice(0, MAX_CHARS).join('')}……` : clean;
  return `用溫柔、低沉、帶磁性的男聲，語速放慢、語氣親切地說：提醒你，${body}`;
}

function pcmDurationMs(pcm) {
  return Math.round((pcm.length / 2 / PCM_RATE) * 1000);
}

async function synthesizePcm(speech) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: speech }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
        },
      }),
    },
  );
  if (!res.ok) {
    const err = new Error(`Gemini TTS HTTP ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const b64 = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
  const inline = b64 && (b64.inlineData || b64.inline_data);
  if (!inline || !inline.data) throw new Error('No audio in Gemini TTS response');
  return Buffer.from(inline.data, 'base64');
}

// PCM → m4a。mp4 容器要能回頭寫檔頭，所以輸出到暫存檔而不是 pipe。
function pcmToM4a(pcm) {
  return new Promise((resolve, reject) => {
    let ffmpegPath;
    try { ffmpegPath = require('ffmpeg-static'); } catch (e) { return reject(new Error('ffmpeg-static not installed')); }
    if (!ffmpegPath) return reject(new Error('ffmpeg binary not found'));
    const out = path.join(os.tmpdir(), `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`);
    const p = spawn(ffmpegPath, ['-y', '-f', 's16le', '-ar', String(PCM_RATE), '-ac', '1', '-i', 'pipe:0',
      '-c:a', 'aac', '-b:a', '64k', '-f', 'ipod', out], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', d => { stderr += d; });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) { fs.rmSync(out, { force: true }); return reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-200)}`)); }
      const buf = fs.readFileSync(out);
      fs.rmSync(out, { force: true });
      resolve(buf);
    });
    p.stdin.on('error', () => {}); // ffmpeg 提早結束時別讓 EPIPE 變成未處理例外
    p.stdin.end(pcm);
  });
}

// 第一次用時自動建 bucket（私有，沒有格式限制）；已經存在就略過
let bucketReady = false;
async function ensureVoiceBucket() {
  if (bucketReady) return;
  const { error } = await supabase.storage.createBucket(VOICE_BUCKET, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message || '')) throw error;
  bucketReady = true;
}

async function uploadAudio(m4a) {
  await ensureVoiceBucket();
  const key = `voice/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`;
  const { error } = await supabase.storage.from(VOICE_BUCKET).upload(key, m4a, { contentType: 'audio/mp4', upsert: false });
  if (error) throw error;
  const { data, error: e2 } = await supabase.storage.from(VOICE_BUCKET).createSignedUrl(key, URL_TTL_SEC);
  if (e2 || !data) throw e2 || new Error('no signed url');
  return data.signedUrl;
}

// 回傳 { message }（可直接丟給 LINE 的 audio 訊息）或 { error, stage }
async function makeVoiceMessage(content) {
  const speech = buildSpeech(content);
  if (!speech) return { error: '沒有可以唸的文字', stage: 'text' };

  let pcm;
  try { pcm = await synthesizePcm(speech); } catch (err) {
    console.error('TTS synth error:', err);
    if (isDailyQuotaError(err)) await markExhausted();
    return { error: err.message.slice(0, 160), stage: 'synthesize' };
  }
  let m4a;
  try { m4a = await pcmToM4a(pcm); } catch (err) {
    console.error('TTS convert error:', err);
    return { error: err.message.slice(0, 160), stage: 'convert' };
  }
  let url;
  try { url = await uploadAudio(m4a); } catch (err) {
    console.error('TTS upload error:', err);
    return { error: String(err.message || err).slice(0, 160), stage: 'upload' };
  }
  return { message: { type: 'audio', originalContentUrl: url, duration: pcmDurationMs(pcm) }, bytes: m4a.length };
}

// ── 清理舊語音檔 ──
// 簽名網址 7 天就失效，超過這個天數的音檔沒人聽得到了，留著只佔空間。
const KEEP_DAYS = Number(process.env.VOICE_KEEP_DAYS || 8);

// 純函式：從 storage list 的結果挑出該刪的路徑
function pickExpiredVoice(files, nowMs = Date.now(), keepDays = KEEP_DAYS) {
  const cutoff = nowMs - keepDays * 24 * 3600 * 1000;
  return (files || [])
    .filter(f => f && f.name && f.created_at && new Date(f.created_at).getTime() < cutoff)
    .map(f => `voice/${f.name}`);
}

// 由 api/cron/remind 每 5 分鐘呼叫，每天只真的清一次。回傳刪掉幾個。
async function cleanupOldVoice(now = new Date()) {
  const { getState, setState } = require('./botstate');
  const { taipeiKey } = require('./time');
  const key = `voice_cleanup:${taipeiKey(now.toISOString())}`;
  if (await getState(key)) return 0;
  await setState(key, { at: now.toISOString() }, 2 * 24 * 60);
  const { data, error } = await supabase.storage.from(VOICE_BUCKET).list('voice', { limit: 1000 });
  if (error || !data) return 0; // bucket 還沒建立（從沒用過語音）就算了
  const expired = pickExpiredVoice(data, now.getTime());
  if (!expired.length) return 0;
  const { error: delErr } = await supabase.storage.from(VOICE_BUCKET).remove(expired);
  if (delErr) { console.error('voice cleanup error:', delErr); return 0; }
  return expired.length;
}

const STAGE_LABEL = { text: '準備稿子', synthesize: 'AI 合成語音', convert: '轉成 m4a', upload: '上傳音檔' };

module.exports = { makeVoiceMessage, cleanupOldVoice, STAGE_LABEL, _test: { buildSpeech, pcmDurationMs, pcmToM4a, pickExpiredVoice } };
