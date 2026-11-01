// 代禱本：「代禱 王小明 工作順利」記下一筆，蒙應允了就標記起來。
// 存在 notes 裡（project＝代禱，is_done＝蒙應允），跟倒數日一樣是系統專案，不會混進一般筆記。
// 只存自己看得到，不分享、不推播。
const { taipeiKey } = require('./time');

const PRAYER_PROJECT = '代禱';

// 傳回 { kind:'list' | 'add' | 'answer' | 'delete', arg }；不是代禱指令回 null
function parsePrayer(text) {
  const t = String(text || '').trim();
  if (/^代禱(?:本|事項|清單)$/.test(t)) return { kind: 'list' };
  const del = t.match(/^刪(?:除)?代禱[\s:：]+([\s\S]+)$/);
  if (del) return { kind: 'delete', arg: del[1].trim() };
  const m = t.match(/^代禱(?:[\s:：]+([\s\S]*))?$/);
  if (!m) return null;
  const rest = (m[1] || '').trim();
  if (!rest) return { kind: 'list' };
  const ans = rest.match(/^(?:蒙應允|應允|感恩)[\s:：]+([\s\S]+)$/);
  if (ans) return { kind: 'answer', arg: ans[1].trim() };
  return { kind: 'add', arg: rest };
}

const md = (iso) => { const k = taipeiKey(iso); return `${+k.slice(5, 7)}/${+k.slice(8, 10)}`; };

function formatList(items) {
  const open = (items || []).filter(n => !n.is_done).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const answered = (items || []).filter(n => n.is_done);
  if (!open.length && !answered.length) return '代禱本還是空的。\n記錄方式：「代禱 王小明 工作順利」';
  const lines = ['🙏 代禱本'];
  if (open.length) lines.push(...open.slice(0, 20).map(n => `・${n.content}（${md(n.created_at)}）`));
  else lines.push('目前沒有進行中的代禱事項。');
  if (answered.length) lines.push('', `🌿 已蒙應允 ${answered.length} 件`);
  lines.push('', '蒙應允了：「代禱 蒙應允 王小明」', '刪掉一筆：「刪代禱 王小明」');
  return lines.join('\n');
}

module.exports = { PRAYER_PROJECT, parsePrayer, formatList };
