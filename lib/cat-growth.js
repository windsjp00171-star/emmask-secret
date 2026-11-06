// 橘貓成長：完成的事越多，橘貓越大隻。只算已完成的待辦／提醒，階段由件數決定（純程式，不花 AI）。
const supabase = require('./supabase');
const cards = require('./cards');

// img：public/img/ 底下的插畫。橘貓大王的專屬插畫還沒畫好（Canva 額度用完），先借用橘貓那張，畫好換成 cat-stage-5.png 即可
const STAGES = [
  { min: 0, name: '小奶貓', emoji: '🐱', line: '剛來報到，還在學走路。', img: 'cat-stage-1.png' },
  { min: 10, name: '小橘貓', emoji: '🐈', line: '開始有精神了，會跟著你跑。', img: 'cat-stage-2.png' },
  { min: 30, name: '橘貓', emoji: '🧡', line: '穩穩的，你交代的事牠都記得。', img: 'cat-stage-3.png' },
  { min: 80, name: '胖橘貓', emoji: '😸', line: '吃得很好，也被你養得很好。', img: 'cat-stage-4.png' },
  { min: 200, name: '橘貓大王', emoji: '👑', line: '全巷最威風的橘貓，是你一件一件做出來的。', img: 'cat-stage-3.png' },
];

function stageOf(done) {
  const n = Math.max(0, Number(done) || 0);
  let i = 0;
  STAGES.forEach((s, idx) => { if (n >= s.min) i = idx; });
  return { stage: STAGES[i], next: STAGES[i + 1] || null, done: n };
}

function format(done, week) {
  const { stage, next } = stageOf(done);
  const progress = next
    ? `再完成 ${next.min - done} 件，就會長成「${next.name}」`
    : '已經是最大隻的了 🎉';
  return `${stage.emoji} 你的橘貓：${stage.name}\n${stage.line}\n\n累計完成 ${done} 件・這 7 天完成 ${week} 件\n${progress}`;
}

// 圖＋文字卡：上面是這個階段的橘貓插畫，下面是名字、累計／本週件數，和離下一階段的進度條。沒有網域就回純文字
function buildCard(done, week) {
  const host = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  const { stage, next } = stageOf(done);
  const text = format(done, week);
  if (!host) return text;
  const pct = next ? Math.min(99, Math.max(1, Math.round(((done - stage.min) / (next.min - stage.min)) * 100))) : 100;
  const body = [
    { type: 'text', text: `${stage.emoji} ${stage.name}`, weight: 'bold', size: 'xl', color: cards.C.deep },
    { type: 'text', text: stage.line, size: 'sm', wrap: true, color: '#3a3a3c', margin: 'sm' },
    { type: 'text', text: `累計完成 ${done} 件・這 7 天 ${week} 件`, size: 'sm', color: cards.C.muted, margin: 'md' },
    {
      type: 'box', layout: 'horizontal', height: '8px', margin: 'md', backgroundColor: '#e5e5ea', cornerRadius: '4px',
      contents: [{ type: 'box', layout: 'vertical', flex: pct, backgroundColor: '#f08a24', cornerRadius: '4px', contents: [] }, ...(pct < 100 ? [{ type: 'box', layout: 'vertical', flex: 100 - pct, contents: [] }] : [])],
    },
    { type: 'text', text: next ? `再完成 ${next.min - done} 件，長成「${next.name}」` : '已經是最大隻的了 🎉', size: 'xs', color: cards.C.muted, margin: 'sm', wrap: true },
  ];
  const bubble = {
    type: 'bubble', size: 'mega',
    hero: { type: 'image', url: `https://${host}/img/${stage.img}`, size: 'full', aspectRatio: '1:1', aspectMode: 'cover' },
    body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: body },
  };
  return cards.flex(text.replace(/\n/g, ' '), [bubble]);
}

function isCatCommand(t) {
  return /^(?:我的)?橘貓(?:成長)?$/.test(String(t || '').trim());
}

async function countDone(sinceIso) {
  let q = supabase.from('notes').select('id', { count: 'exact', head: true }).eq('is_done', true).in('type', ['task', 'reminder']);
  if (sinceIso) q = q.gte('updated_at', sinceIso);
  const { count } = await q;
  return count || 0;
}

async function handleCat(now = new Date()) {
  const total = await countDone();
  const week = await countDone(new Date(now.getTime() - 7 * 86400000).toISOString());
  return buildCard(total, week);
}

module.exports = { STAGES, stageOf, format, buildCard, isCatCommand, handleCat };
