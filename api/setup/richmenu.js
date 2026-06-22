const zlib = require('zlib');
const https = require('https');

// 5x7 bitmap font for ASCII + common chars
const FONT5X7 = {
  'A': [0x1F,0x24,0x44,0x24,0x1F], 'B': [0x7F,0x49,0x49,0x49,0x36], 'C': [0x3E,0x41,0x41,0x41,0x22],
  'D': [0x7F,0x41,0x41,0x22,0x1C], 'E': [0x7F,0x49,0x49,0x49,0x41], 'F': [0x7F,0x48,0x48,0x48,0x40],
  'G': [0x3E,0x41,0x49,0x49,0x2F], 'H': [0x7F,0x08,0x08,0x08,0x7F], 'I': [0x41,0x7F,0x41,0x00,0x00],
  'J': [0x02,0x01,0x41,0x7E,0x40], 'K': [0x7F,0x08,0x14,0x22,0x41], 'L': [0x7F,0x01,0x01,0x01,0x01],
  'M': [0x7F,0x20,0x10,0x20,0x7F], 'N': [0x7F,0x10,0x08,0x04,0x7F], 'O': [0x3E,0x41,0x41,0x41,0x3E],
  'P': [0x7F,0x48,0x48,0x48,0x30], 'Q': [0x3E,0x41,0x45,0x42,0x3D], 'R': [0x7F,0x48,0x4C,0x4A,0x31],
  'S': [0x32,0x49,0x49,0x49,0x26], 'T': [0x40,0x40,0x7F,0x40,0x40], 'U': [0x7E,0x01,0x01,0x01,0x7E],
  'V': [0x70,0x0C,0x03,0x0C,0x70], 'W': [0x7E,0x01,0x0E,0x01,0x7E], 'X': [0x63,0x14,0x08,0x14,0x63],
  'Y': [0x60,0x10,0x0F,0x10,0x60], 'Z': [0x43,0x45,0x49,0x51,0x61],
  'a': [0x02,0x15,0x15,0x0F,0x00], 'b': [0x7F,0x09,0x09,0x09,0x06], 'c': [0x0E,0x11,0x11,0x11,0x00],
  'd': [0x06,0x09,0x09,0x7F,0x00], 'e': [0x0E,0x15,0x15,0x0D,0x00], 'f': [0x08,0x3F,0x48,0x40,0x00],
  'g': [0x18,0x25,0x25,0x3E,0x00], 'h': [0x7F,0x08,0x08,0x07,0x00], 'i': [0x00,0x2F,0x00,0x00,0x00],
  'j': [0x01,0x00,0x2F,0x00,0x00], 'k': [0x7F,0x04,0x0A,0x11,0x00], 'l': [0x41,0x7F,0x01,0x00,0x00],
  'm': [0x1F,0x10,0x0E,0x10,0x1F], 'n': [0x1F,0x08,0x10,0x10,0x0F], 'o': [0x0E,0x11,0x11,0x0E,0x00],
  'p': [0x1F,0x14,0x14,0x08,0x00], 'q': [0x08,0x14,0x14,0x1F,0x00], 'r': [0x1F,0x08,0x10,0x10,0x00],
  's': [0x09,0x15,0x15,0x12,0x00], 't': [0x10,0x3E,0x11,0x00,0x00], 'u': [0x1E,0x01,0x01,0x1F,0x00],
  'v': [0x1C,0x02,0x01,0x02,0x1C], 'w': [0x1E,0x01,0x06,0x01,0x1E], 'x': [0x11,0x0A,0x04,0x0A,0x11],
  'y': [0x18,0x05,0x05,0x1E,0x00], 'z': [0x11,0x13,0x15,0x19,0x11],
  '0': [0x3E,0x45,0x49,0x51,0x3E], '1': [0x21,0x7F,0x01,0x00,0x00], '2': [0x23,0x45,0x49,0x31,0x00],
  '3': [0x22,0x49,0x49,0x36,0x00], '4': [0x0C,0x14,0x24,0x7F,0x04], '5': [0x72,0x51,0x51,0x4E,0x00],
  '6': [0x1E,0x29,0x49,0x46,0x00], '7': [0x40,0x47,0x48,0x70,0x00], '8': [0x36,0x49,0x49,0x36,0x00],
  '9': [0x30,0x49,0x49,0x3E,0x00], ' ': [0x00,0x00,0x00,0x00,0x00], '-': [0x08,0x08,0x08,0x08,0x08],
};

// 16x16 CJK character bitmaps (row-major, 2 bytes per row)
// Each entry: 16 numbers, each is 1 byte = 8 pixels, so we need 2 bytes per row = 32 bytes total
// Simplified approach: use a 16-wide, 16-tall bitmap stored as array of 16 uint16 (row bitmasks)
const CJK16 = {
  '今': [0x0080,0x0080,0x0FF0,0x0800,0x0800,0x0FF0,0x0840,0x0840,0x0FF0,0x0040,0x07C0,0x0440,0x0440,0x07C4,0x0004,0x0000],
  '天': [0x0040,0x0040,0x07F8,0x0040,0x0040,0x0040,0x0FFC,0x0080,0x0140,0x0220,0x0410,0x0808,0x1004,0x2002,0x4001,0x0000],
  '本': [0x0040,0x0040,0x0FF0,0x0840,0x0840,0x0FF0,0x0840,0x0FF0,0x0840,0x0040,0x01C0,0x0240,0x0440,0x0840,0x1840,0x0000],
  '週': [0x0FE0,0x0820,0x0BE0,0x0A20,0x0BE0,0x0820,0x0FE0,0x0820,0x0BE0,0x0A20,0x0BE0,0x0820,0x0FE0,0x0002,0x0FFE,0x0000],
  '筆': [0x07F8,0x0408,0x07F8,0x0408,0x07F8,0x0000,0x1FF8,0x1008,0x1FF8,0x1008,0x1FF8,0x1008,0x1008,0x1FF8,0x1000,0x0000],
  '記': [0x0FF0,0x0810,0x0FF0,0x0010,0x0FF0,0x0000,0x0FE0,0x0820,0x0FE0,0x0820,0x0FE0,0x0820,0x0820,0x0FE2,0x0002,0x0000],
  '專': [0x07F0,0x0410,0x07F0,0x0410,0x07F0,0x0040,0x1FFC,0x1084,0x10FC,0x1084,0x1FFC,0x0084,0x008C,0x0074,0x0000,0x0000],
  '案': [0x0FF0,0x0810,0x0FF0,0x0810,0x0FF0,0x0000,0x0840,0x0840,0x0FF0,0x0840,0x0840,0x0840,0x0840,0x0FFE,0x0002,0x0000],
  '幫': [0x0620,0x0620,0x0620,0x07E0,0x0620,0x0000,0x1FF8,0x1008,0x1FF8,0x1008,0x1FF8,0x1008,0x1008,0x1FF8,0x1000,0x0000],
  '助': [0x0820,0x0820,0x0820,0x0820,0x0FE0,0x0820,0x0000,0x1FF8,0x1008,0x1FF8,0x0008,0x0008,0x0008,0x0FF8,0x0000,0x0000],
};

function drawText(raw, W, label, cx, cy, scale, r, g, b) {
  // Draw each char, compute total width first
  const chars = [...label];
  const charWidths = chars.map(c => {
    if (CJK16[c]) return 16 * scale;
    if (FONT5X7[c]) return 6 * scale; // 5 wide + 1 gap
    return 6 * scale;
  });
  const totalW = charWidths.reduce((a, b) => a + b, 0) - scale; // no trailing gap
  let x = cx - Math.floor(totalW / 2);
  const y = cy - Math.floor((CJK16[chars[0]] ? 16 : 7) * scale / 2);

  chars.forEach((c, ci) => {
    if (CJK16[c]) {
      const bmp = CJK16[c];
      for (let row = 0; row < 16; row++) {
        const bits = bmp[row];
        for (let col = 0; col < 16; col++) {
          if (bits & (0x8000 >> col)) {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                const px = x + col * scale + sx;
                const py = y + row * scale + sy;
                if (px >= 0 && px < W && py >= 0) {
                  const idx = py * (W * 3 + 1) + 1 + px * 3;
                  raw[idx] = r; raw[idx + 1] = g; raw[idx + 2] = b;
                }
              }
            }
          }
        }
      }
      x += 16 * scale + scale;
    } else {
      const bmp = FONT5X7[c] || FONT5X7[' '];
      for (let col = 0; col < 5; col++) {
        const bits = bmp[col];
        for (let row = 0; row < 7; row++) {
          if (bits & (1 << row)) {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                const px = x + col * scale + sx;
                const py = y + row * scale + sy;
                if (px >= 0 && px < W && py >= 0) {
                  const idx = py * (W * 3 + 1) + 1 + px * 3;
                  raw[idx] = r; raw[idx + 1] = g; raw[idx + 2] = b;
                }
              }
            }
          }
        }
      }
      x += 6 * scale;
    }
  });
}

function generateRichMenuImage() {
  const W = 2500, H = 843, ROWS = 2, COLS = 3;
  const COLORS = [
    [41, 128, 185],
    [39, 174, 96],
    [243, 156, 18],
    [142, 68, 173],
    [231, 76, 60],
    [52, 152, 219],
  ];
  const LABELS = ['今天', '本週', '筆記', '專案', '幫助', 'Dashboard'];
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

  // Draw labels centered in each cell
  const scale = 5;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const idx = row * COLS + col;
      const label = LABELS[idx];
      const cx = col * cw + Math.floor(cw / 2);
      const cy = row * ch + Math.floor(ch / 2);
      drawText(raw, W, label, cx, cy, scale, 255, 255, 255);
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
