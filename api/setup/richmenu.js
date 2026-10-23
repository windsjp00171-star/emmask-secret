const https = require('https');
const fs = require('fs');
const path = require('path');
const { loadModules } = require('../../lib/modules');

// 三個分頁，圖在 assets/richmenu/（由 tools/make_richmenu.py 產生）。
// 每個分頁 2×4 格，上面一條是分頁列；格子的順序要和圖上一致。
// 關掉的功能格子仍會顯示，點了小秘書會回「這個功能目前沒有開啟」。
const key = (t) => ({ type: 'postback', data: 'act=noop', inputOption: 'openKeyboard', fillInText: t });
const say = (t) => ({ type: 'message', text: t });
const TAB_IDS = ['a', 'b', 'c'];
const aliasOf = (i) => `emmark-tab-${TAB_IDS[i]}`;

function tabsFor(host, token) {
  return [
    [key('提醒 '), key('待辦 '), key('筆記 '), { type: 'postback', data: 'act=noop', inputOption: 'openVoice' },
      say('記帳'), { type: 'uri', label: '傳照片', uri: 'line://nv/camera/' }, key('收藏 '), say('會議列表')],
    [say('今天'), say('本週'), say('待辦'), say('日曆'),
      key('搜尋 '), say('服事表'), say('週報'), { type: 'uri', label: '後台', uri: `https://${host}?token=${token}` }],
    [say('詩歌庫'), say('敬拜順序'), say('主題清單'), say('專案'),
      say('指令'), say('本月花費'), say('語音測試'), { type: 'uri', label: '設定', uri: `https://${host}/setup.html` }],
  ];
}

function menuDef(i, cells, name) {
  const TAB_W = [833, 834, 833];
  const BAR = 130;
  const areas = TAB_W.map((w, t) => ({
    bounds: { x: TAB_W.slice(0, t).reduce((a, b) => a + b, 0), y: 0, width: w, height: BAR },
    action: t === i ? { type: 'postback', data: 'act=noop' }
      : { type: 'richmenuswitch', richMenuAliasId: aliasOf(t), data: `tab=${TAB_IDS[t]}` },
  }));
  const cw = 625, ch = Math.floor((843 - BAR) / 2);
  cells.forEach((action, k) => {
    areas.push({ bounds: { x: (k % 4) * cw, y: BAR + Math.floor(k / 4) * ch, width: cw, height: ch }, action });
  });
  return { size: { width: 2500, height: 843 }, selected: i === 0, name, chatBarText: '交給小秘書 ▾', areas };
}

function lineRequest(method, path, body, isBuffer) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: isBuffer ? 'api-data.line.me' : 'api.line.me',
      path,
      method,
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        ...(isBuffer
          ? { 'Content-Type': 'image/png', 'Content-Length': body.length }
          : { 'Content-Type': 'application/json' }),
      },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: text }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  const token = req.query.token;
  if (token !== process.env.DASHBOARD_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 用自己的網域，fork 出去的人按「後台」才會開到自己的後台
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  await loadModules(true);

  try {
    const tabs = tabsFor(host, process.env.DASHBOARD_TOKEN);
    const images = [1, 2, 3].map(n => fs.readFileSync(path.join(__dirname, `../../assets/richmenu/tab${n}.png`)));

    // 舊的選單與別名先清掉（別名綁著舊選單，不先刪新的別名會建不起來）
    const created = [];
    const list = await lineRequest('GET', '/v2/bot/richmenu/list');
    const old = ((list.body && list.body.richmenus) || []).filter(m => /^EmmArk/.test(m.name));
    for (let i = 0; i < 3; i++) await lineRequest('DELETE', `/v2/bot/richmenu/alias/${aliasOf(i)}`);

    for (let i = 0; i < 3; i++) {
      const createRes = await lineRequest('POST', '/v2/bot/richmenu', Buffer.from(JSON.stringify(menuDef(i, tabs[i], `EmmArk 分頁選單 ${TAB_IDS[i].toUpperCase()}`))));
      if (createRes.status !== 200) throw new Error(`Create failed: ${JSON.stringify(createRes.body)}`);
      const id = createRes.body.richMenuId;
      created.push(id);
      const up = await lineRequest('POST', `/v2/bot/richmenu/${id}/content`, images[i], true);
      if (up.status !== 200) throw new Error(`Upload failed: ${JSON.stringify(up.body)}`);
      const al = await lineRequest('POST', '/v2/bot/richmenu/alias', Buffer.from(JSON.stringify({ richMenuAliasId: aliasOf(i), richMenuId: id })));
      if (al.status !== 200) throw new Error(`Alias failed: ${JSON.stringify(al.body)}`);
    }

    const defaultRes = await lineRequest('POST', `/v2/bot/user/all/richmenu/${created[0]}`, null);
    if (defaultRes.status !== 200) throw new Error(`Set default failed: ${JSON.stringify(defaultRes.body)}`);

    // 新的都就位了才刪舊的；失敗不影響這次設定
    for (const m of old) await lineRequest('DELETE', `/v2/bot/richmenu/${m.richMenuId}`).catch(e => console.error('richmenu cleanup error:', e));

    return res.status(200).json({ ok: true, richMenuId: created[0], message: '圖文選單設定完成！重新整理 LINE 即可看到。' });
  } catch (err) {
    console.error('Setup richmenu error:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports._test = { tabsFor, menuDef, aliasOf };
