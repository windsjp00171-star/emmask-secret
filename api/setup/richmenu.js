const zlib = require('zlib');
const https = require('https');

// Generate a simple 2500x843 PNG (compact rich menu, 2 rows x 3 cols)
function generateRichMenuImage() {
  const W = 2500, H = 843, ROWS = 2, COLS = 3;
  const COLORS = [
    [41, 128, 185],   // 今天
    [39, 174, 96],    // 本週
    [243, 156, 18],   // 筆記
    [142, 68, 173],   // 專案
    [231, 76, 60],    // 幫助
    [52, 152, 219],   // Dashboard
  ];
  const cw = Math.floor(W / COLS), ch = Math.floor(H / ROWS);

  const raw = Buffer.alloc((W * 3 + 1) * H);
  let pos = 0;
  for (let y = 0; y < H; y++) {
    raw[pos++] = 0;
    for (let x = 0; x < W; x++) {
      const row = Math.min(Math.floor(y / ch), ROWS - 1);
      const col = Math.min(Math.floor(x / cw), COLS - 1);
      const [r, g, b] = COLORS[row * COLS + col];
      const border = x % cw < 4 || x % cw >= cw - 4 || y % ch < 4 || y % ch >= ch - 4;
      raw[pos++] = border ? 255 : r;
      raw[pos++] = border ? 255 : g;
      raw[pos++] = border ? 255 : b;
    }
  }

  const compressed = zlib.deflateSync(raw);

  const crcTable = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    return c >>> 0;
  });
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const typeB = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeB, data])));
    return Buffer.concat([len, typeB, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function lineRequest(method, path, body, isBuffer) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.line.me',
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

  try {
    // 1. Create rich menu
    const menuDef = {
      size: { width: 2500, height: 843 },
      selected: true,
      name: 'EmmArk 主選單',
      chatBarText: '功能選單',
      areas: [
        { bounds: { x: 0,    y: 0,   width: 833, height: 421 }, action: { type: 'message', text: '今天' } },
        { bounds: { x: 833,  y: 0,   width: 834, height: 421 }, action: { type: 'message', text: '本週' } },
        { bounds: { x: 1667, y: 0,   width: 833, height: 421 }, action: { type: 'message', text: '筆記' } },
        { bounds: { x: 0,    y: 421, width: 833, height: 422 }, action: { type: 'message', text: '專案' } },
        { bounds: { x: 833,  y: 421, width: 834, height: 422 }, action: { type: 'message', text: '幫助' } },
        { bounds: { x: 1667, y: 421, width: 833, height: 422 }, action: { type: 'uri', uri: `https://emmask-secret.vercel.app?token=${process.env.DASHBOARD_TOKEN}`, label: 'Dashboard' } },
      ],
    };

    const createRes = await lineRequest('POST', '/v2/bot/richmenu', Buffer.from(JSON.stringify(menuDef)));
    if (createRes.status !== 200) throw new Error(`Create failed: ${JSON.stringify(createRes.body)}`);
    const richMenuId = createRes.body.richMenuId;

    // 2. Upload image
    const png = generateRichMenuImage();
    const uploadRes = await lineRequest('POST', `/v2/bot/richmenu/${richMenuId}/content`, png, true);
    if (uploadRes.status !== 200) throw new Error(`Upload failed: ${JSON.stringify(uploadRes.body)}`);

    // 3. Set as default
    const defaultRes = await lineRequest('POST', `/v2/bot/user/all/richmenu/${richMenuId}`, null);
    if (defaultRes.status !== 200) throw new Error(`Set default failed: ${JSON.stringify(defaultRes.body)}`);

    return res.status(200).json({ ok: true, richMenuId, message: '圖文選單設定完成！重新整理 LINE 即可看到。' });
  } catch (err) {
    console.error('Setup richmenu error:', err);
    return res.status(500).json({ error: err.message });
  }
};
