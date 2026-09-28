// 設定精靈的後端：逐項檢查部署有沒有設好，並提供「一鍵設定 Webhook」。
//
// 目的是讓 fork 出去的人不用看 log、不用懂 API，打開 /setup.html 就知道
// 下一步要做什麼。每一項檢查失敗都要回一句「怎麼修」，而不是只有錯誤碼。
const fs = require('fs');
const path = require('path');
const https = require('https');

const REQUIRED_ENV = [
  { key: 'LINE_CHANNEL_SECRET', hint: 'LINE Developers → 你的 Channel → Basic settings → Channel secret' },
  { key: 'LINE_CHANNEL_ACCESS_TOKEN', hint: 'LINE Developers → 你的 Channel → Messaging API → Channel access token（按 Issue）' },
  { key: 'SUPABASE_URL', hint: 'Supabase → Project Settings → API → Project URL' },
  { key: 'SUPABASE_SERVICE_KEY', hint: 'Supabase → Project Settings → API Keys → service_role（不是 anon）' },
  { key: 'GEMINI_API_KEY', hint: 'Google AI Studio → Get API key' },
  { key: 'DASHBOARD_TOKEN', hint: '自己取一組後台密碼' },
  { key: 'LINE_USER_ID', hint: '部署好後，傳任何一句話給小秘書，它會回你的 userId' },
];
const OPTIONAL_ENV = [
  { key: 'CRON_SECRET', hint: '保護提醒排程網址，隨便取一組亂碼' },
  { key: 'WORSHIP_MY_NAME', hint: '你在服事表上的名字，用來查「我的服事」' },
  { key: 'CALENDAR_TOKEN', hint: '行事曆訂閱（.ics）用的密碼' },
];
const TABLES = ['notes', 'worship_dates', 'worship_roles', 'worship_schedule', 'bot_state', 'cron_heartbeats'];
const BUCKET = process.env.IMAGE_BUCKET || 'note-images';

function lineApi(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.line.me',
      path: apiPath,
      method,
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json = null;
        try { json = JSON.parse(text); } catch { /* 有些端點回空字串 */ }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function baseUrl(req) {
  return `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

// 純邏輯：環境變數哪些缺了
function checkEnv(env) {
  const pick = list => list.map(({ key, hint }) => ({ key, hint, ok: Boolean(env[key]) }));
  return { required: pick(REQUIRED_ENV), optional: pick(OPTIONAL_ENV) };
}

async function checkLine(expectedWebhook) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) return { ok: false, error: '還沒填 LINE_CHANNEL_ACCESS_TOKEN' };
  const info = await lineApi('GET', '/v2/bot/info');
  if (info.status !== 200) return { ok: false, error: 'Channel access token 無效，請到 LINE Developers 重新 Issue 一組再貼上' };
  const hook = await lineApi('GET', '/v2/bot/channel/webhook/endpoint');
  const endpoint = hook.body && hook.body.endpoint;
  const menu = await lineApi('GET', '/v2/bot/user/all/richmenu');
  return {
    richMenu: menu.status === 200 && Boolean(menu.body && menu.body.richMenuId),
    ok: true,
    botName: info.body.displayName,
    basicId: info.body.basicId,
    addFriendUrl: info.body.basicId ? `https://line.me/R/ti/p/${encodeURIComponent(info.body.basicId)}` : null,
    webhook: {
      expected: expectedWebhook,
      current: endpoint || null,
      active: Boolean(hook.body && hook.body.active),
      ok: endpoint === expectedWebhook && Boolean(hook.body && hook.body.active),
    },
  };
}

async function checkDatabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { ok: false, error: '還沒填 SUPABASE_URL / SUPABASE_SERVICE_KEY', tables: [] };
  }
  // 用來組出「直接打開你自己的 SQL Editor」的連結
  const projectRef = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
  const sqlEditorUrl = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;
  const supabase = require('../../lib/supabase');
  const tables = await Promise.all(TABLES.map(async name => {
    const { error } = await supabase.from(name).select('*', { count: 'exact', head: true });
    return { name, ok: !error };
  }));
  const { error: bucketErr } = await supabase.storage.getBucket(BUCKET);
  const bucket = { name: BUCKET, ok: !bucketErr };
  return { ok: tables.every(t => t.ok) && bucket.ok, tables, bucket, sqlEditorUrl };
}

async function checkGemini() {
  if (!process.env.GEMINI_API_KEY) return { ok: false, error: '還沒填 GEMINI_API_KEY' };
  // 列出模型不吃額度，只驗證金鑰有效
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${process.env.GEMINI_API_KEY}`);
  return res.ok ? { ok: true } : { ok: false, error: 'Gemini API key 無效，請到 Google AI Studio 重新建立' };
}

async function checkReminder(base) {
  const secret = process.env.CRON_SECRET;
  const url = `${base}/api/cron/remind${secret ? `?token=${encodeURIComponent(secret)}` : ''}`;
  let lastRunAt = null;
  try {
    const supabase = require('../../lib/supabase');
    const { data } = await supabase.from('cron_heartbeats').select('last_run_at').eq('name', 'remind').maybeSingle();
    lastRunAt = data ? data.last_run_at : null;
  } catch { /* 資料庫還沒好時，上面會另外顯示 */ }
  const fresh = lastRunAt && Date.now() - new Date(lastRunAt).getTime() < 30 * 60 * 1000;
  return { ok: Boolean(fresh), url, lastRunAt };
}

async function pendingOwnerId() {
  if (process.env.LINE_USER_ID) return null;
  try {
    const { getState } = require('../../lib/botstate');
    const row = await getState('pending_owner_id');
    return row && row.value ? row.value.userId : null;
  } catch {
    return null;
  }
}

// 每一項都包起來：某一項壞掉（例如網路），其他項照樣回報
async function safe(fn) {
  try { return await fn(); } catch (err) { return { ok: false, error: err.message }; }
}

module.exports = async function handler(req, res) {
  const token = req.headers['x-dashboard-token'];
  if (!process.env.DASHBOARD_TOKEN) {
    return res.status(503).json({ error: '還沒設定 DASHBOARD_TOKEN：請到 Vercel → Settings → Environment Variables 新增後 Redeploy' });
  }
  if (token !== process.env.DASHBOARD_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

  const base = baseUrl(req);
  const webhookUrl = `${base}/api/webhook`;

  if (req.method === 'POST' && req.query.action === 'webhook') {
    const set = await lineApi('PUT', '/v2/bot/channel/webhook/endpoint', { endpoint: webhookUrl });
    if (set.status !== 200) {
      return res.status(400).json({ ok: false, error: (set.body && set.body.message) || `LINE 回應 ${set.status}` });
    }
    const test = await lineApi('POST', '/v2/bot/channel/webhook/test', { endpoint: webhookUrl });
    const ok = test.status === 200 && test.body && test.body.success;
    return res.status(200).json({
      ok,
      message: ok ? 'Webhook 已設定並測試成功' : `Webhook 已填入，但測試失敗：${(test.body && test.body.detail) || '請確認 LINE Developers 裡的 Use webhook 已打開'}`,
    });
  }

  if (req.method === 'GET' && req.query.action === 'schema') {
    const sql = fs.readFileSync(path.join(__dirname, '../../supabase/schema.sql'), 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(sql);
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const [line, database, gemini, reminder, ownerId] = await Promise.all([
    safe(() => checkLine(webhookUrl)),
    safe(checkDatabase),
    safe(checkGemini),
    safe(() => checkReminder(base)),
    pendingOwnerId(),
  ]);

  return res.status(200).json({
    baseUrl: base,
    env: checkEnv(process.env),
    line,
    database,
    gemini,
    reminder,
    pendingOwnerId: ownerId,
  });
};

module.exports._test = { checkEnv, REQUIRED_ENV };
