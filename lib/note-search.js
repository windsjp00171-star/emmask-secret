// 在 LINE 找以前的筆記：「找 音控 報價」「找 上個月」「找 音控 10月」
// 空格分開的每個字都要出現（內容或專案）；可以加時間詞縮小範圍。純程式，不花 AI。
const { taipeiKey } = require('./time');
const cards = require('./cards');

const PAGE = 5;
const MAX_RESULTS = 40;
const DAY = 86400000;

const dayNum = (key) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY);
const keyOf = (num) => new Date(num * DAY).toISOString().slice(0, 10);

// 把句子裡的時間詞拿掉，剩下的當關鍵字。回傳 { words, range:{from,to,label}|null }
function parseQuery(text, now = new Date()) {
  const today = taipeiKey(now.toISOString());
  const [ty, tm] = today.split('-').map(Number);
  let range = null;
  const set = (from, to, label) => { range = { from, to, label }; };
  const words = [];
  for (const tok of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    let m;
    if (/^(?:本週|這週|這禮拜|本周|這周)$/.test(tok)) {
      const sun = dayNum(today) - new Date(`${today}T00:00:00Z`).getUTCDay();
      set(keyOf(sun), keyOf(sun + 6), '本週');
    } else if (/^(?:上週|上星期|上禮拜|上周)$/.test(tok)) {
      const sun = dayNum(today) - new Date(`${today}T00:00:00Z`).getUTCDay() - 7;
      set(keyOf(sun), keyOf(sun + 6), '上週');
    } else if (/^(?:本月|這個月|這月)$/.test(tok)) {
      set(`${ty}-${String(tm).padStart(2, '0')}-01`, `${ty}-${String(tm).padStart(2, '0')}-31`, '這個月');
    } else if (/^(?:上個月|上月)$/.test(tok)) {
      const y = tm === 1 ? ty - 1 : ty, mo = tm === 1 ? 12 : tm - 1;
      set(`${y}-${String(mo).padStart(2, '0')}-01`, `${y}-${String(mo).padStart(2, '0')}-31`, '上個月');
    } else if ((m = tok.match(/^(\d{1,2})月(?:份)?$/)) && +m[1] >= 1 && +m[1] <= 12) {
      const mo = +m[1], y = mo > tm ? ty - 1 : ty;
      set(`${y}-${String(mo).padStart(2, '0')}-01`, `${y}-${String(mo).padStart(2, '0')}-31`, `${mo} 月`);
    } else if ((m = tok.match(/^最近(\d{1,3})天$/))) {
      set(keyOf(dayNum(today) - (+m[1] - 1)), today, `最近 ${m[1]} 天`);
    } else words.push(tok.toLowerCase());
  }
  return { words, range };
}

function matches(n, { words, range }) {
  if (range) {
    const k = taipeiKey(n.created_at);
    if (k < range.from || k > range.to) return false;
  }
  const hay = `${n.content || ''} ${n.project || ''}`.toLowerCase();
  return words.every(w => hay.includes(w));
}

// 比對到的字不在前面時，顯示比對處前後幾個字，才看得出為什麼找到它
function snippet(content, words, max = 90) {
  const t = String(content || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const low = t.toLowerCase();
  let at = -1;
  for (const w of words) { const i = low.indexOf(w); if (i !== -1 && (at === -1 || i < at)) at = i; }
  if (at === -1 || at < max - 30) return t.slice(0, max) + '…';
  const start = Math.max(0, at - 20);
  return '…' + t.slice(start, start + max) + (start + max < t.length ? '…' : '');
}

function search(rows, query) {
  return (rows || []).filter(n => matches(n, query)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

const dateLabel = (iso) => {
  const k = taipeiKey(iso);
  return k.slice(0, 4) === taipeiKey(new Date().toISOString()).slice(0, 4) ? `${+k.slice(5, 7)}/${+k.slice(8, 10)}` : k.replace(/-/g, '/');
};

function describe(query) {
  return [...query.words, query.range && query.range.label].filter(Boolean).join(' ');
}

// 每頁 5 筆左右滑；點一筆回完整內容（長筆記、會議記錄不會被截斷）
function buildCards(query, found, typeLabel = {}) {
  const shown = found.slice(0, MAX_RESULTS);
  const title = describe(query);
  const rows = shown.map(n => ({
    type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '8px',
    action: { type: 'postback', label: '看全文', data: `act=notefull&id=${n.id}`, displayText: '看全文' },
    contents: [
      { type: 'text', text: snippet(n.content, query.words), size: 'sm', wrap: true, color: n.is_done ? cards.C.muted : cards.C.ink, maxLines: 4 },
      { type: 'text', text: [dateLabel(n.created_at), typeLabel[n.type] || n.type, n.project ? `🗂 ${n.project}` : ''].filter(Boolean).join('　'), size: 'xs', color: cards.C.muted, wrap: true },
    ],
  }));
  const pages = [];
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE).flatMap((r, j) => (j ? [{ type: 'separator' }, r] : [r]));
    const tag = `🔍 ${title.length > 10 ? `${title.slice(0, 10)}…` : title}　${found.length} 筆${rows.length > PAGE ? `（${i / PAGE + 1}/${Math.ceil(rows.length / PAGE)}）` : ''}`;
    const foot = found.length > shown.length && i + PAGE >= rows.length
      ? [{ type: 'text', text: `只列最新 ${shown.length} 筆，還有 ${found.length - shown.length} 筆；多加一個字或時間（例如「上個月」）可以縮小`, size: 'xs', color: cards.C.muted, wrap: true, margin: 'md' }] : [];
    pages.push(cards.bubble({ body: [cards.tagChip(tag, 'note'), ...chunk, ...foot] }));
  }
  const alt = [`🔍 「${title}」找到 ${found.length} 筆`, ...shown.slice(0, 10).map(n => `• ${dateLabel(n.created_at)} ${snippet(n.content, query.words, 40)}`)].join('\n');
  return cards.flex(alt, pages);
}

function emptyReply(query) {
  const t = describe(query);
  return `🔍 找不到「${t}」。\n少打幾個字、換個說法，或加時間縮小範圍（例如「找 音控 上個月」）。\n想用意思去找，可以傳「問 你要問的話」。`;
}

const HELP = '🔍 找以前的筆記：\n「找 音控 報價」（幾個字都要有）\n「找 上個月」「找 音控 10月」「找 最近7天」';

module.exports = { parseQuery, matches, search, snippet, buildCards, emptyReply, describe, HELP, MAX_RESULTS };
