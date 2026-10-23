// 卡片的共用零件：讓小秘書所有的卡看起來是同一套。
//
// 原則（參考做得好的官方帳號）：
// - 每張卡只講一件事，重點用大字，細項用小字
// - 同一種動作永遠在同一個位置（主按鈕在上、次要在下）
// - 簡報／回顧／週報做成「海報」：特大的日期或數字當主角
// - 長清單用左右滑動的輪播，不要一張卡一直往下捲（輪播算一則訊息，也省推播額度）
// - 可以轉傳給別人的內容附「📤 分享」
const BRAND = process.env.BRAND_NAME || 'EmmArk 小秘書';

const C = {
  ink: '#1b2420',
  muted: '#8e8e93',
  green: '#2e9d63',
  deep: '#16513d',
  greenInk: '#04833a',
  greenTint: '#e2f6e9',
  amberInk: '#a34f00',
  amberTint: '#fdecd6',
  blueInk: '#3f67a8',
  blueTint: '#e2e9f5',
  redInk: '#b3322a',
  redTint: '#fbe4e7',
  white: '#ffffff',
};

// 標籤的顏色：待辦綠、提醒琥珀、筆記藍、警示紅
const KINDS = {
  task: { ink: C.greenInk, tint: C.greenTint },
  reminder: { ink: C.amberInk, tint: C.amberTint },
  note: { ink: C.blueInk, tint: C.blueTint },
  alert: { ink: C.redInk, tint: C.redTint },
  brand: { ink: C.deep, tint: C.greenTint },
};

// 小標籤（例如「⏰ 提醒」），只佔內容的寬度
function tagChip(label, kind = 'brand') {
  const k = KINDS[kind] || KINDS.brand;
  return {
    type: 'box', layout: 'horizontal',
    contents: [
      {
        type: 'box', layout: 'vertical', flex: 0, backgroundColor: k.tint, cornerRadius: '12px',
        paddingTop: '3px', paddingBottom: '3px', paddingStart: '10px', paddingEnd: '10px',
        contents: [{ type: 'text', text: label, size: 'xs', weight: 'bold', color: k.ink }],
      },
      { type: 'filler' },
    ],
  };
}

// 海報區塊：特大的主角（日期或數字）＋一行說明
function poster({ kicker, big, bigSuffix, sub, tone = 'deep' }) {
  const dark = tone === 'deep';
  const ink = dark ? C.white : C.deep;
  const soft = dark ? '#cfe9dc' : '#4f6b5f';
  return {
    type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '18px', cornerRadius: '14px',
    backgroundColor: dark ? C.deep : C.greenTint,
    contents: [
      ...(kicker ? [{ type: 'text', text: kicker, size: 'sm', color: soft, wrap: true }] : []),
      {
        type: 'box', layout: 'baseline', spacing: 'sm',
        contents: [
          { type: 'text', text: String(big), size: '4xl', weight: 'bold', color: ink, flex: 0 },
          ...(bigSuffix ? [{ type: 'text', text: bigSuffix, size: 'md', weight: 'bold', color: soft, flex: 0 }] : []),
        ],
      },
      ...(sub ? [{ type: 'text', text: sub, size: 'sm', color: ink, wrap: true }] : []),
    ],
  };
}

// LINE 的分享網址：點了會跳出選朋友的畫面，內容預先填好。uri 動作長度上限 1000 字元。
const URI_MAX = 1000;
const SHARE_BASE = 'https://line.me/R/msg/text/?';

function shareUri(text) {
  let t = String(text || '').trim();
  while (t && (SHARE_BASE + encodeURIComponent(t)).length > URI_MAX - 10) {
    t = t.slice(0, Math.max(0, t.length - Math.ceil(t.length * 0.15) - 1));
  }
  return t ? SHARE_BASE + encodeURIComponent(t) : null;
}

// 沒有東西可分享就回 null（呼叫端用 filter(Boolean) 濾掉）
function shareButton(text, label = '📤 分享') {
  const uri = shareUri(text);
  if (!uri) return null;
  return {
    type: 'button', style: 'secondary', height: 'sm',
    action: { type: 'uri', label, uri },
  };
}

// 分享語音：網址一定要完整保留，只截內容的部分；放不下就不給按鈕
function shareVoiceButton(content, url) {
  if (!url) return null;
  const tail = `\n${url}`;
  if ((SHARE_BASE + encodeURIComponent(`🔊 ${tail}`)).length > URI_MAX - 10) return null;
  let head = `🔊 ${String(content || '').replace(/\s+/g, ' ').trim()}`;
  while (head.length > 3 && (SHARE_BASE + encodeURIComponent(head + tail)).length > URI_MAX - 10) head = head.slice(0, -2);
  return shareButton(head + tail, '📤 分享語音');
}

function brandLine(label) {
  return { type: 'text', text: label ? `${BRAND} · ${label}` : BRAND, size: 'xxs', color: C.muted, align: 'center', margin: 'md' };
}

function bubble({ body, footer, size = 'mega' }) {
  const b = {
    type: 'bubble', size,
    body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: body },
  };
  const f = (footer || []).filter(Boolean);
  if (f.length) b.footer = { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '10px', contents: f };
  return b;
}

// 一個以上用輪播（最多 12 張，LINE 的上限），只有一個就單張
function flex(altText, bubbles) {
  const list = bubbles.filter(Boolean).slice(0, 12);
  return {
    type: 'flex',
    altText: String(altText).slice(0, 400),
    contents: list.length === 1 ? list[0] : { type: 'carousel', contents: list },
  };
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 台北時間的「10/23」與「週五」
function bigDate(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(date);
  const get = (t) => (p.find(x => x.type === t) || {}).value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { md: `${get('month')}/${get('day')}`, weekday: `週${WEEKDAYS[wd] || ''}` };
}

// 稱呼：有設定 OWNER_NAME 就叫名字
function callName() {
  const n = (process.env.OWNER_NAME || '').trim();
  return n || '';
}

module.exports = {
  BRAND, C, KINDS, tagChip, poster, shareUri, shareButton, shareVoiceButton, brandLine, bubble, flex, bigDate, callName,
};
