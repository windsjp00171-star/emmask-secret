// 橘貓成長：完成的事越多，橘貓越大隻。只算已完成的待辦／提醒，階段由件數決定（純程式，不花 AI）。
const supabase = require('./supabase');

const STAGES = [
  { min: 0, name: '小奶貓', emoji: '🐱', line: '剛來報到，還在學走路。' },
  { min: 10, name: '小橘貓', emoji: '🐈', line: '開始有精神了，會跟著你跑。' },
  { min: 30, name: '橘貓', emoji: '🧡', line: '穩穩的，你交代的事牠都記得。' },
  { min: 80, name: '胖橘貓', emoji: '😸', line: '吃得很好，也被你養得很好。' },
  { min: 200, name: '橘貓大王', emoji: '👑', line: '全巷最威風的橘貓，是你一件一件做出來的。' },
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
  return format(total, week);
}

module.exports = { STAGES, stageOf, format, isCatCommand, handleCat };
