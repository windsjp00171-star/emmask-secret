// 筆記裡的 #標籤：「#教會 音控設備報價」→ 專案＝教會（程式決定，不靠 AI，最穩）。
// 回覆卡上也會帶標籤，之後在 LINE 對話框用放大鏡搜「#教會」，自己打的那則和小秘書的回覆都會跳出來。
// 只認「開頭或空白後面」的 #，網址裡的 #錨點（https://x.com/a#b）不算；純數字（#1）不算。
function extractTag(text) {
  const m = String(text || '').match(/(?:^|\s)#([^\s#,，。、;；!！?？]{1,20})/);
  if (!m || /^\d+$/.test(m[1])) return null;
  return m[1];
}

// 存檔回覆最後一行：「🏷 #教會 #筆記」（筆記一律帶 #筆記，待辦／提醒只有在有專案時才帶專案標籤，避免每張卡都多一行）。沒有標籤就回空字串
function tagLine(note) {
  const tags = [];
  if (note && note.project) tags.push(`#${String(note.project).replace(/\s+/g, '')}`);
  if (note && note.type === 'note') tags.push('#筆記');
  return tags.length ? `🏷 ${tags.join(' ')}` : '';
}

module.exports = { extractTag, tagLine };
