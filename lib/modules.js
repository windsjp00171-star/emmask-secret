// 功能模組：讓每個人自己選要開哪些功能，不用的就關掉，介面和指令都會跟著變簡單。
//
// 核心功能（待辦／提醒／筆記、今天／本週、完成／刪除／改時間、搜尋、問答、語音輸入、後台待辦頁）
// 永遠開著，不在這份清單裡。下面這些才是可以開關的。
//
// 設定存在 bot_state 的 'modules' 這一列（沒有期限），不需要改資料表。
// 還沒存過設定時全部開啟，這樣已經在用的人升級後行為完全不變。
const { getState, setState } = require('./botstate');

const KEY = 'modules';
const CACHE_MS = 15 * 1000;

const GROUPS = ['每天陪伴', '記錄工具', '行事曆', '進階', '教會專用'];

const MODULES = [
  { id: 'briefing', group: '每天陪伴', name: '早安簡報', desc: '每天早上 8 點，小秘書主動傳今天的提醒、待辦和逾期事項。' },
  { id: 'evening', group: '每天陪伴', name: '晚間收工回顧', desc: '每晚 9 點後傳一次：今天沒做完的事、明天預告，可以一鍵全部延到明天。' },
  { id: 'weekly', group: '每天陪伴', name: '每週週報', desc: '每週五早上傳本週完成了幾件事、還積壓多少。' },
  { id: 'expenses', group: '記錄工具', name: '記帳', desc: '打「午餐 120」或拍收據就記一筆帳，可以看每月統計。' },
  { id: 'meetings', group: '記錄工具', name: '會議記錄', desc: '貼上會議內容，自動拆出待辦，把有日期的議程排進行事曆。' },
  { id: 'links', group: '記錄工具', name: '收藏與稍後讀', desc: '貼網址就收進收藏箱，之後可以查清單。' },
  { id: 'album', group: '記錄工具', name: '傳圖辨識與相簿', desc: '傳活動海報自動建提醒、傳收據自動記帳；傳過的圖都留在後台相簿。' },
  { id: 'themes', group: '記錄工具', name: '主題式批次提醒', desc: '一次貼好幾行「日期 時間 行程」（例如特會），整批建立提醒。' },
  { id: 'calendar', group: '行事曆', name: '萬年曆與行事曆訂閱', desc: 'LINE 的「日曆」、後台的日曆檢視，以及可以訂閱到手機行事曆的網址。' },
  { id: 'projects', group: '進階', name: '專案進度', desc: '依專案整理進度更新，週報可以附上 GitHub 本週的動態。' },
  { id: 'voice', group: '進階', name: '語音提醒（實驗）', desc: '提醒到點時，除了卡片再附一則小秘書唸出來的語音。' },
  { id: 'worship', group: '教會專用', name: '服事表', desc: '查自己和某天的服事、傳服事表 PDF 自動排好整季、服事前一晚提醒。' },
  { id: 'songs', group: '教會專用', name: '詩歌庫與敬拜順序', desc: '存詩歌（調性、BPM、歌詞）、寫敬拜順序、套用順序範本。' },
];

const ALL_IDS = MODULES.map(m => m.id);
const BY_ID = Object.fromEntries(MODULES.map(m => [m.id, m]));

const PRESETS = {
  basic: { name: '基本版', desc: '只留最單純的：待辦提醒＋早安簡報＋日曆', ids: ['briefing', 'calendar'] },
  personal: { name: '個人效率', desc: '基本版＋收工回顧、週報、記帳、會議記錄、收藏、傳圖辨識', ids: ['briefing', 'evening', 'weekly', 'expenses', 'meetings', 'links', 'album', 'themes', 'calendar'] },
  church: { name: '教會同工', desc: '個人效率＋服事表、詩歌庫與敬拜順序', ids: ['briefing', 'evening', 'weekly', 'expenses', 'meetings', 'links', 'album', 'themes', 'calendar', 'worship', 'songs'] },
  all: { name: '全部開啟', desc: '所有功能都打開', ids: ALL_IDS },
};

let current = null; // Set；還沒載入過就當作全開
let configured = false;
let loadedAt = 0;

function sanitize(ids) {
  return ALL_IDS.filter(id => (ids || []).includes(id));
}

async function loadModules(force = false) {
  if (!force && current && Date.now() - loadedAt < CACHE_MS) return current;
  try {
    const value = await getState(KEY);
    if (value && Array.isArray(value.enabled)) {
      current = new Set(sanitize(value.enabled));
      configured = true;
    } else {
      current = new Set(ALL_IDS);
      configured = false;
    }
  } catch (err) {
    console.error('loadModules error:', err);
    if (!current) current = new Set(ALL_IDS); // 讀不到就維持全開，不要讓功能突然消失
  }
  loadedAt = Date.now();
  return current;
}

// 同步版：要先 await loadModules() 過。沒載入過或不認得的模組一律當作開啟。
function isOn(id) {
  if (!BY_ID[id]) return true;
  return (current || new Set(ALL_IDS)).has(id);
}

async function saveModules(ids) {
  const enabled = sanitize(ids);
  const row = await setState(KEY, { enabled, at: new Date().toISOString() }, null);
  if (!row) throw new Error('存不進資料庫，請確認資料表都建好了');
  current = new Set(enabled);
  configured = true;
  loadedAt = Date.now();
  return enabled;
}

function state() {
  return { enabled: ALL_IDS.filter(isOn), configured };
}

// ── 指令 → 模組 ──
// 打了某個指令，但那個模組關著，就回「沒有開啟」而不是默默存成一則奇怪的筆記。
const COMMAND_MODULES = [
  ['expenses', /^(記帳|記帳統計|花費|本月花費|這個月花費|上個月記帳|上月記帳|上個月花費)$/],
  ['meetings', /^(會議列表|會議清單|所有會議)$|^(寫|記錄|看|查|叫|顯示)\s*會議|^會議/],
  ['links', /^(收藏清單|稍後讀)$|^收藏/],
  ['themes', /^(主題清單|主題列表|所有主題|看主題|看特會|特會清單)$|^看\s*(主題|特會)|^刪(除)?\s*(主題|特會)|^(主題|特會)[\s:：]/],
  ['songs', /^(詩歌庫|歌庫|範本|範本清單)$|^找歌|^存歌|^套範本|^存範本|^(寫|記錄|看|查|叫|顯示)[\s\S]*順序|^(敬拜)?順序/],
  ['worship', /^(服事表|我的服事|我的服事表)$|^服事表?\s*\d|^\d{1,2}[\/\-]\d{1,2}\s*服事|^\d{1,2}\s*月份?\s*服事表/],
  ['projects', /^專案$/],
  ['calendar', /^(日曆|行事曆)$/],
  ['album', /^存圖|^相簿$/],
  ['weekly', /^(週報|周報)(清單|列表)?$/],
  ['voice', /^(語音測試|測試語音)$/],
];

function moduleForCommand(text) {
  const t = String(text || '').trim();
  const hit = COMMAND_MODULES.find(([, re]) => re.test(t));
  return hit ? hit[0] : null;
}

function disabledReply(id) {
  const m = BY_ID[id];
  return `「${m ? m.name : id}」這個功能目前沒有開啟。\n要用的話，到設定精靈（你的網址後面加 /setup.html）最下面的「功能模組」打開就好。`;
}

// ── 說明文字依模組過濾 ──
// 說明是一整段文字，用空行分段，每段開頭有表情符號和標題；先整段判斷，再看個別行。
const HELP_GROUP_RULES = [
  ['worship', /^⛪/],
  ['songs', /^(🎵|🎼|📑)/],
  ['themes', /^📋 主題式/],
  ['links', /^🔗/],
  ['meetings', /^📝 會議記錄/],
  ['album', /^📷/],
  ['weekly', /^📊 週報/],
];
const HELP_LINE_RULES = [
  ['expenses', /記帳|收據/],
  ['calendar', /^・日曆/],
  ['meetings', /貼一整段會議記錄|白板\/會議記錄/],
  ['album', /^　 (海報|收據|白板|名片)|^・傳圖片/],
  ['worship', /^・服事表/],
];

function filterHelpText(text) {
  const groups = String(text).split('\n\n').map(g => g.split('\n')).filter(lines => {
    const rule = HELP_GROUP_RULES.find(([, re]) => re.test(lines[0]));
    return !(rule && !isOn(rule[0]));
  });
  return groups
    .map(lines => lines.filter(l => !HELP_LINE_RULES.some(([id, re]) => re.test(l) && !isOn(id))))
    .filter(lines => lines.length > 1 || (lines.length === 1 && lines[0].trim()))
    .map(lines => lines.join('\n'))
    .join('\n\n');
}

module.exports = {
  MODULES, GROUPS, PRESETS, ALL_IDS,
  loadModules, isOn, saveModules, state, moduleForCommand, disabledReply, filterHelpText,
  _test: { sanitize, reset() { current = null; configured = false; loadedAt = 0; }, setCurrent(ids) { current = new Set(ids); loadedAt = Date.now(); } },
};
