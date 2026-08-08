const supabase = require('./supabase');
const { classify } = require('./classifier');
const { getWeeklyActivity } = require('./github');
const { getScheduleByDate, getMySchedule, getMonthSchedule, getMyMonthSchedule } = require('./worship');

const TYPE_LABEL = {
  task: '待辦',
  reminder: '提醒',
  note: '筆記',
  project_update: '專案更新',
};

function formatTaipeiDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildSaveReply(note) {
  const typeLabel = TYPE_LABEL[note.type] || note.type;
  const meta = [`✅ ${typeLabel}已記錄`];
  if (note.project) meta.push(`🗂 ${note.project}`);
  if (note.due_date) meta.push(`⏰ ${formatTaipeiDate(note.due_date)}`);
  if (note.remind_lead_minutes != null) meta.push(`🔔 提前${leadLabel(note.remind_lead_minutes)}`);
  const header = meta.join('　');
  return note.content ? `${header}\n${note.content}` : header;
}

function leadLabel(min) {
  if (min % 1440 === 0) return `${min / 1440}天`;
  if (min % 60 === 0) return `${min / 60}小時`;
  return `${min}分鐘`;
}

// 已知的指令關鍵字：開頭很接近但沒對到任何指令時，用來猜測「是不是打錯字」
const COMMAND_KEYWORDS = [
  '筆記', '待辦', '提醒', '完成', '刪除', '改內容', '改時間', '取消',
  '主題', '刪主題', '看主題', '主題清單',
  '順序', '敬拜順序', '看順序', '寫順序',
  '會議', '會議記錄', '會議列表',
  '存歌', '找歌', '詩歌庫',
  '範本', '套範本', '存範本',
  '收藏', '收藏清單',
  '搜尋', '服事表', '日曆', '選單', '指令', '更新', '今天', '本週', '早安', '行程',
];

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// 抓開頭連續的中文/英數字片段，跟已知指令關鍵字比對，差1個字就當作可能打錯字
function findTypoCommand(text) {
  const m = text.match(/^[一-鿿A-Za-z]{2,6}/);
  if (!m) return null;
  const lead = m[0];
  for (const kw of COMMAND_KEYWORDS) {
    if (lead === kw) return null; // 完全相符代表本來就該被正常指令攔到，不算打錯
    if (Math.abs(lead.length - kw.length) > 1) continue;
    if (levenshtein(lead, kw) === 1) return kw;
  }
  return null;
}

// 抓出「提前N分鐘/N小時/半小時/N天」並從文字中移除，回傳 { lead, text }
function extractLeadMinutes(text) {
  const half = text.match(/提前\s*半\s*(?:個)?\s*(?:小時|鐘頭)/);
  if (half) return { lead: 30, text: text.replace(half[0], '').trim() };
  const dayM = text.match(/提前\s*(\d+)\s*天/);
  if (dayM) return { lead: parseInt(dayM[1], 10) * 1440, text: text.replace(dayM[0], '').trim() };
  const hourM = text.match(/提前\s*(\d+)\s*(?:個)?\s*(?:小時|鐘頭)/);
  if (hourM) return { lead: parseInt(hourM[1], 10) * 60, text: text.replace(hourM[0], '').trim() };
  const minM = text.match(/提前\s*(\d+)\s*分鐘?/);
  if (minM) return { lead: parseInt(minM[1], 10), text: text.replace(minM[0], '').trim() };
  return { lead: null, text };
}

// 檢查時間衝突：15分鐘內其他未完成提醒／當天是否有服事，回傳警告文字陣列
async function checkConflicts(dueISO) {
  const warnings = [];
  if (!dueISO) return warnings;

  const dueMs = new Date(dueISO).getTime();
  const windowMs = 15 * 60 * 1000;
  const { data: near } = await supabase
    .from('notes')
    .select('content, due_date')
    .in('type', ['reminder', 'task'])
    .eq('is_done', false)
    .gte('due_date', new Date(dueMs - windowMs).toISOString())
    .lte('due_date', new Date(dueMs + windowMs).toISOString());
  if (near && near.length) {
    const names = near.slice(0, 3).map(n => n.content).join('、');
    warnings.push(`⏰ 這個時段附近已經有其他提醒：${names}`);
  }

  const myName = process.env.WORSHIP_MY_NAME;
  if (myName) {
    const { data: serving } = await supabase
      .from('worship_schedule')
      .select('role')
      .eq('person_name', myName)
      .eq('service_date', taipeiKey(dueISO));
    if (serving && serving.length) {
      warnings.push(`⛪ 這天你有服事（${serving.map(s => s.role).join('、')}），別排到衝突囉`);
    }
  }
  return warnings;
}

async function handleSave(text) {
  const { lead, text: cleanText } = extractLeadMinutes(text);
  const classified = await classify(cleanText);

  // 安全網：自己再解析一次時間，AI 漏掉就補上（Haiku 對長句常誤判成筆記）
  const parsedDue = parseDueDate(cleanText);
  if (parsedDue && !classified.due_date) {
    classified.due_date = parsedDue;
    if (classified.type === 'note' || !classified.type) classified.type = 'task';
    classified.reply = null; // 改用 buildSaveReply 顯示正確時間
  }

  const warnings = await checkConflicts(classified.due_date);

  const { data, error } = await supabase.from('notes').insert({
    raw_text: text,
    type: classified.type,
    project: classified.project || null,
    content: classified.content,
    due_date: classified.due_date || null,
    remind_lead_minutes: lead,
    is_reminded: false,
  }).select().single();

  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  const reply = (lead != null ? null : classified.reply) || buildSaveReply(data);
  return warnings.length ? `${reply}\n${warnings.join('\n')}` : reply;
}

async function handleToday() {
  const now = new Date();
  const taipeiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const startOfDay = new Date(taipeiNow);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(taipeiNow);
  endOfDay.setHours(23, 59, 59, 999);

  const dateStr = taipeiNow.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const { data: reminders } = await supabase
    .from('notes')
    .select('*')
    .eq('type', 'reminder')
    .gte('due_date', startOfDay.toISOString())
    .lte('due_date', endOfDay.toISOString())
    .eq('is_done', false)
    .order('due_date');

  const { data: tasks } = await supabase
    .from('notes')
    .select('*')
    .eq('type', 'task')
    .eq('is_done', false)
    .order('created_at');

  const { data: done } = await supabase
    .from('notes')
    .select('*')
    .eq('is_done', true)
    .gte('updated_at', startOfDay.toISOString())
    .lte('updated_at', endOfDay.toISOString());

  const lines = [`📋 今日任務（${dateStr}）`];

  if (reminders && reminders.length > 0) {
    lines.push('\n🔴 提醒');
    reminders.forEach(r => {
      const time = r.due_date
        ? new Date(r.due_date).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false })
        : '';
      lines.push(`• ${time} ${r.content}`);
    });
  }

  if (tasks && tasks.length > 0) {
    lines.push('\n🟡 待辦');
    tasks.forEach(t => lines.push(`• ${t.content}`));
  }

  if (done && done.length > 0) {
    lines.push(`\n✅ 完成（${done.length}件）`);
  }

  if ((!reminders || reminders.length === 0) && (!tasks || tasks.length === 0)) {
    lines.push('\n今日沒有待辦事項 🎉');
  }

  return lines.join('\n');
}

async function handleWeek() {
  const now = new Date();
  const taipeiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const dayOfWeek = taipeiNow.getDay();
  const startOfWeek = new Date(taipeiNow);
  startOfWeek.setDate(taipeiNow.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const { data } = await supabase
    .from('notes')
    .select('*')
    .in('type', ['reminder', 'task'])
    .eq('is_done', false)
    .gte('due_date', startOfWeek.toISOString())
    .lte('due_date', endOfWeek.toISOString())
    .order('due_date');

  const { data: tasks } = await supabase
    .from('notes')
    .select('*')
    .eq('type', 'task')
    .eq('is_done', false)
    .is('due_date', null)
    .order('created_at')
    .limit(10);

  const lines = ['📅 本週清單'];

  if (data && data.length > 0) {
    lines.push('');
    data.forEach(item => {
      const label = item.type === 'reminder' ? '🔴' : '🟡';
      const time = item.due_date ? `${formatTaipeiDate(item.due_date)} ` : '';
      lines.push(`${label} ${time}${item.content}`);
    });
  }

  if (tasks && tasks.length > 0) {
    lines.push('\n📌 待辦（無期限）');
    tasks.forEach(t => lines.push(`• ${t.content}`));
  }

  if ((!data || data.length === 0) && (!tasks || tasks.length === 0)) {
    lines.push('\n本週沒有待辦事項 🎉');
  }

  return lines.join('\n');
}

async function handleNotes() {
  const { data: raw } = await supabase
    .from('notes')
    .select('*')
    .eq('type', 'note')
    .order('created_at', { ascending: false })
    .limit(30);

  const data = (raw || []).filter(n => !SYSTEM_PROJECTS.includes(n.project)).slice(0, 10);
  if (data.length === 0) return '目前沒有筆記。';

  const lines = ['📝 最近筆記'];
  data.forEach((n, i) => {
    const date = new Date(n.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    lines.push(`${i + 1}. [${date}] ${n.content}`);
  });
  return lines.join('\n');
}

async function handleProjects() {
  const [{ data }, ghActivity] = await Promise.all([
    supabase
      .from('notes')
      .select('*')
      .eq('type', 'project_update')
      .not('project', 'is', null)
      .order('created_at', { ascending: false }),
    getWeeklyActivity(7),
  ]);

  const lines = ['🗂 專案總覽'];

  // Manual project updates
  if (data && data.length > 0) {
    const latestByProject = {};
    data.forEach(item => {
      if (!latestByProject[item.project]) latestByProject[item.project] = item;
    });
    lines.push('');
    Object.entries(latestByProject).forEach(([project, item]) => {
      const date = new Date(item.created_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
      lines.push(`【${project}】`);
      lines.push(`${item.content}（${date}）`);
    });
  }

  // GitHub activity
  if (ghActivity && ghActivity.length > 0) {
    lines.push('\n📦 GitHub 本週動態');
    ghActivity.forEach(repo => {
      lines.push(`• ${repo.name}（${repo.count} commits）`);
      lines.push(`  └ ${repo.latest}`);
    });
  }

  if (lines.length === 1) return '目前沒有專案更新。';
  return lines.join('\n');
}

async function handleDone(keyword) {
  if (!keyword) return '請輸入關鍵字，例如：完成 Cell Reporter bug';

  const { data } = await supabase
    .from('notes')
    .select('*')
    .ilike('content', `%${keyword}%`)
    .eq('is_done', false)
    .limit(1);

  if (!data || data.length === 0) return `找不到包含「${keyword}」的未完成事項。`;

  const item = data[0];
  await supabase.from('notes').update({ is_done: true }).eq('id', item.id);
  return `✅ 已標記完成：${item.content}`;
}

async function handleDelete(keyword) {
  if (!keyword) return '請輸入關鍵字，例如：刪除 某事項';

  const { data } = await supabase
    .from('notes')
    .select('*')
    .ilike('content', `%${keyword}%`)
    .limit(1);

  if (!data || data.length === 0) return `找不到包含「${keyword}」的事項。`;

  const item = data[0];
  await supabase.from('notes').delete().eq('id', item.id);
  return `🗑 已刪除：${item.content}`;
}

// 「改內容 關鍵字 改成 新內容」／「改時間 關鍵字 改成 新時間」共用：找出目標關鍵字跟新值
function splitEditCommand(rest) {
  const m = rest.match(/^([\s\S]+?)\s*改成\s*([\s\S]+)$/);
  return m ? { keyword: m[1].trim(), newValue: m[2].trim() } : null;
}

async function handleEditContent(rest) {
  const parts = splitEditCommand(rest);
  if (!parts) return '用法：改內容 關鍵字 改成 新內容';
  const { data } = await supabase.from('notes').select('*')
    .ilike('content', `%${parts.keyword}%`).eq('is_done', false).limit(1);
  if (!data || data.length === 0) return `找不到包含「${parts.keyword}」的事項。`;
  const item = data[0];
  const { error } = await supabase.from('notes')
    .update({ content: parts.newValue, raw_text: parts.newValue, updated_at: new Date().toISOString() })
    .eq('id', item.id);
  if (error) throw new Error(`Supabase update error: ${error.message}`);
  return `✏️ 已修改內容：${item.content}\n→ ${parts.newValue}`;
}

async function handleEditTime(rest) {
  const parts = splitEditCommand(rest);
  if (!parts) return '用法：改時間 關鍵字 改成 新時間（例如：明天下午3點）';
  const due = parseDueDate(parts.newValue);
  if (!due) return '看不懂新時間，請用「明天下午3點」這種格式。';
  const { data } = await supabase.from('notes').select('*')
    .ilike('content', `%${parts.keyword}%`).eq('is_done', false).limit(1);
  if (!data || data.length === 0) return `找不到包含「${parts.keyword}」的事項。`;
  const item = data[0];
  const { error } = await supabase.from('notes')
    .update({ due_date: due, is_reminded: false, updated_at: new Date().toISOString() })
    .eq('id', item.id);
  if (error) throw new Error(`Supabase update error: ${error.message}`);
  return `✏️ 已改時間：${item.content}\n⏰ ${formatTaipeiDate(due)}`;
}

const HELP_SECTIONS = {
  rec: [
    '📝 記錄／提醒',
    '・筆記 內容',
    '・待辦 內容',
    '・提醒 內容＋時間（自動解析）',
    '　時間：今天/明天/下週三/6/29/下午3點/晚上8點/3分鐘後/半小時後/2小時後/3天後',
    '・提前通知：內容後面加「提前N分鐘」／「提前N小時」／「提前N天」（不寫預設5分鐘）',
    '　例：提醒 明天下午3點看牙醫 提前1小時　／　提醒 7/20特會 提前1天',
    '',
    '🔁 重複提醒（響過自動排下次）',
    '・提醒 每天 早上8點 讀經',
    '・提醒 每週三 下午4點 全職同工會',
    '・提醒 每月 5號 繳房租',
    '・提醒 8/1開始 每半年 更換飲水機濾心',
    '・提醒 每年 8/1 繳房屋稅　／　提醒 每2年 8/1 健檢',
    '',
    '📋 主題式（如特會，一次整批）',
    '・主題 名稱（換行）每行「日期 時間 行程」',
    '　每行也可加「提前N分鐘/小時/天」單獨設定該行的提前通知',
    '・主題清單 → 附按鈕選單，點主題直接看內容',
    '・看主題 名稱 ／ 刪主題 名稱（會先問確定才整批刪除）',
  ].join('\n'),
  worship: [
    '⛪ 服事表',
    '・服事表 → 我的近期服事',
    '・服事表 7/6 → 當天整張班表',
    '・8月服事表 → 我 8 月的服事',
    '',
    '🎵 敬拜順序（某一次服事當天的完整流程）',
    '・寫順序 [日期] 內容（不填＝下個主日）→ 單純記錄＋簡短比對摘要',
    '・看順序 [日期]（不填＝最近那份）→ 回顧時額外附按鈕選單',
    '　（編號歌單「1.歌名」寫法）點按鈕看該首完整資料／版本紀錄，詩歌庫沒存過的會提醒你補',
    '',
    '🎼 詩歌庫（歌曲資料庫，跟日期無關，平常查資料用）',
    '・存歌 歌名 調性 BPM 連結（第一行）＋ 換行後貼歌詞／段落結構都可以',
    '　同名歌曲會覆蓋更新（後蓋前），調性/BPM/連結有變（例如換版本）會附上簡易版本紀錄',
    '・找歌 關鍵字 ／ 詩歌庫 → 附按鈕選單，點歌看完整資料',
    '',
    '📑 順序範本',
    '・存範本 名稱（換行）流程',
    '・範本 → 附按鈕選單，點一下直接套用到下個主日',
    '・套範本 名稱 [日期] → 指定日期套用',
  ].join('\n'),
  query: [
    '📅 查詢',
    '・選單 → 查詢按鈕（點一下直接查）',
    '・行程／今日行程／簡報 → 隨時叫出今日提醒/待辦/逾期摘要（不限早上，晚上也能打）',
    '・早安／早安簡報 → 同一份摘要，但標題是早安問候語（跟每天自動推播的版本一樣）',
    '・今天 ／ 本週',
    '・待辦／看待辦 → 先選日期，再看該天清單（每項可點✅完成／🗑刪除）',
    '・日曆 → 萬年曆（本月＋下月，含主日服事）',
    '・筆記 → 最近筆記 ／ 專案 → 各專案進度',
    '',
    '✅ 管理',
    '・完成 關鍵字 ／ 刪除 關鍵字',
    '・改內容 關鍵字 改成 新內容',
    '・改時間 關鍵字 改成 新時間（例如：明天下午3點）',
    '・提醒到點會跳卡片：完成／延後1hr／改明天',
  ].join('\n'),
  tools: [
    '🔗 收藏 / 稍後讀',
    '・收藏 網址（或直接貼網址）',
    '・收藏清單 → 查看',
    '',
    '🔍 搜尋',
    '・搜尋 關鍵字 → 翻出所有相關記錄',
    '',
    '📝 會議記錄',
    '・會議 [日期] 內容（不填日期＝今天，可換行貼完整記錄）',
    '・行內用「待辦: xxx」會自動拆成獨立待辦，不用再抄一次',
    '・會議列表／看會議 [日期] → 附按鈕選單，點一下看完整記錄',
  ].join('\n'),
  ai: [
    '🤖 需要 AI（要有 Anthropic 額度）',
    '・直接打一句話 → 自動分類記錄',
    '・傳圖片 → 辨識海報/通知上的時間，建立提醒',
  ].join('\n'),
};

function helpSection(key) {
  return HELP_SECTIONS[key] || handleHelp();
}

function handleChangelog() {
  return [
    '📋 最近更新（2026-07-14）',
    '',
    '🎉 新功能',
    '・提前通知可各自調整（提前N分鐘/N小時/N天），單筆或主題式批次都適用',
    '・建立提醒時自動偵測：時段附近有其他提醒、當天你有服事，會主動提醒你注意衝突',
    '・主題式略過的行會附上具體原因（沒抓到日期／沒抓到時間）方便修正',
    '・早安簡報加入「逾期未完成」提醒，不會再石沉大海',
    '・刪主題會先跳出確認卡片，避免打錯名字整批刪錯',
    '・敬拜順序會自動比對詩歌庫，出現的歌名帶出調性/BPM/連結',
    '・看順序時若是編號歌單（1.歌名）會附按鈕選單：點歌看完整資料/版本紀錄，沒存過的歌會提醒補上',
    '・存歌同名會覆蓋更新，不再重複累積；調性/BPM/連結變動（換版本）會附簡易版本紀錄',
    '・存歌換行後的段落／歌詞不會再被壓成一行',
    '・待辦清單改成兩層選單：先選日期再看清單，每項可點✅完成／🗑刪除',
    '・早安簡報改成可點✅完成的清單卡片，不再是一大串純文字',
    '・主題清單、詩歌庫、範本清單都改成按鈕選單，點一下直接看內容/套用，不用再打字',
    '・新增會議記錄功能：會議 [日期] 內容，可換行貼完整記錄，用「待辦:」標記的行會自動變成獨立待辦',
    '・新增「改內容 關鍵字 改成 新內容」「改時間 關鍵字 改成 新時間」，不用刪掉重打',
    '・敬拜順序比對詩歌庫改成精準比對，短歌名不會再誤判成別首歌的一部分',
    '・修正存歌欄位解析的邊界情況（連結後面直接換行貼歌詞時，連結會漏抓）',
    '・加入基本測試（node --test）＋ GitHub Actions，PR 都會自動跑測試',
    '・新增「早安」指令，隨時能手動叫出早安簡報，不用只等每天自動推播',
    '・新增「行程／今日行程／簡報」，內容跟早安簡報一樣，但標題不寫「早安」，晚上打也不會怪',
    '・指令打錯字（例如「提醐」）現在會先跟你確認，不會默默存成一則莫名筆記',
    '・重複提醒新增「每半年」「每年」「每N年」，會依你指定的起始日期每次往後推對應月數',
    '・主題式批次支援完整日期格式（2026-08-09），不會再誤判成今天',
    '・準時提醒（提前幾分鐘）＋ 卡片按鈕（完成/延後/改明天）',
    '・重複提醒（每天/每週X/每月N號）',
    '・相對時間（X分鐘後/半小時後/X小時後）',
    '・拍照建提醒、每日早安簡報',
    '・萬年曆（LINE＋後台，含主日服事）',
    '・服事表：我的／指定日／整月',
    '・敬拜順序＋範本、詩歌庫',
    '・主題式提醒（特會批次）＋主題清單',
    '・收藏箱、全文搜尋、兩層指令選單',
    '',
    '🎨 後台深綠改版、手機卡片式、設計版選單',
    '🐛 修復：提醒不觸發、編輯鈕、圖片辨識',
    '⚙️ 專案更新只記錄不提醒；主題＝後台專案',
    '',
    '（完整紀錄見 repo 的 CHANGELOG.md）',
  ].join('\n');
}

// 未完成待辦/提醒：共用資料取得＋分組工具
async function fetchOpenTodoItems() {
  const { data } = await supabase.from('notes').select('*')
    .in('type', ['task', 'reminder']).eq('is_done', false);
  return (data || []).filter(n => !n.recur);
}

function todoDateKey(n) {
  return n.due_date ? taipeiKey(n.due_date) : 'none';
}

function todoDateLabel(key) {
  if (key === 'none') return '沒有日期';
  const dt = new Date(`${key}T00:00:00+08:00`);
  const md = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' });
  const wd = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' });
  return `${md}（${wd}）`;
}

// 共用：把一批項目畫成「內容＋✅完成鈕」的 row 陣列（不含外層 bubble）
function todoActionRows(items, limit = 12) {
  const now = Date.now();
  const shown = items.slice(0, limit);
  const rows = [];
  shown.forEach((n, i) => {
    if (i > 0) rows.push({ type: 'separator' });
    const overdue = n.due_date && new Date(n.due_date).getTime() < now;
    const when = n.due_date ? `${overdue ? '⚠️ ' : ''}${formatTaipeiDate(n.due_date)}　` : '';
    rows.push({
      type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center', paddingAll: '6px',
      contents: [
        { type: 'box', layout: 'vertical', flex: 1, contents: [
          { type: 'text', text: `${when}${n.content}`, size: 'sm', wrap: true,
            color: overdue ? '#b3322a' : '#1b2420' },
          ...(n.project ? [{ type: 'text', text: `🗂 ${n.project}`, size: 'xs', color: '#8e8e93' }] : []),
        ] },
        { type: 'button', style: 'primary', color: '#2e9d63', height: 'sm', flex: 0,
          action: { type: 'postback', label: '✅', data: `act=done&id=${n.id}`, displayText: `完成：${n.content}` } },
        { type: 'button', style: 'secondary', height: 'sm', flex: 0,
          action: { type: 'postback', label: '🗑', data: `act=delnote&id=${n.id}`, displayText: `刪除：${n.content}` } },
      ],
    });
  });
  return rows;
}

// 共用：把一批項目畫成「內容＋✅完成鈕」清單 bubble
function buildTodoListFlex(items, header) {
  const rows = todoActionRows(items);
  return {
    type: 'flex',
    altText: header,
    contents: {
      type: 'bubble', size: 'mega',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
        contents: [
          { type: 'text', text: header, weight: 'bold', size: 'lg' },
          { type: 'separator', margin: 'sm' },
          ...rows,
        ],
      },
    },
  };
}

// 待辦清單第一層：按日期分組的選單（點日期才展開該天的清單）
async function handleTodos() {
  const items = await fetchOpenTodoItems();
  if (items.length === 0) return '🎉 沒有未完成的待辦／提醒！';

  const groups = {};
  items.forEach((n) => { const k = todoDateKey(n); (groups[k] = groups[k] || []).push(n); });
  const dateKeys = Object.keys(groups).filter(k => k !== 'none').sort();
  if (groups.none) dateKeys.push('none'); // 沒日期的排最後

  const buttons = dateKeys.slice(0, 12).map(k => ({
    type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
    action: {
      type: 'postback',
      label: truncateLabel(`${todoDateLabel(k)}（${groups[k].length}）`),
      data: `act=todosbydate&date=${k}`,
      displayText: `看 ${todoDateLabel(k)} 的待辦`,
    },
  }));

  return {
    type: 'flex',
    altText: `📋 未完成待辦／提醒（共 ${items.length} 筆）`,
    contents: {
      type: 'bubble', size: 'mega',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
        contents: [
          { type: 'text', text: `📋 未完成待辦／提醒（共 ${items.length} 筆）`, weight: 'bold', size: 'lg' },
          { type: 'text', text: '選一個日期看清單，點✅完成', size: 'sm', color: '#8e8e93' },
          ...buttons,
        ],
      },
    },
  };
}

// 待辦清單第二層：某個日期的清單
async function handleTodosByDate(dateKey) {
  const items = await fetchOpenTodoItems();
  const filtered = items.filter(n => todoDateKey(n) === dateKey);
  if (filtered.length === 0) return '這個日期已經沒有未完成的待辦了 🎉';
  filtered.sort((a, b) => (a.due_date && b.due_date ? (a.due_date < b.due_date ? -1 : 1) : 0));
  return buildTodoListFlex(filtered, `📋 ${todoDateLabel(dateKey)}（${filtered.length}）`);
}

// 查閱選單：把查詢型指令做成按鈕，點了直接執行
function handleMenu() {
  const run = (label, cmd) => ({
    type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
    action: { type: 'postback', label, data: `run=${cmd}`, displayText: label },
  });
  return {
    type: 'flex',
    altText: '📂 查詢選單',
    contents: {
      type: 'bubble', size: 'mega',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
        contents: [
          { type: 'text', text: '📂 查詢選單', weight: 'bold', size: 'lg' },
          { type: 'text', text: '點一下直接查 👇', size: 'sm', color: '#8e8e93' },
          run('📋 今日行程', '行程'),
          run('📅 今天', '今天'),
          run('🗓 本週', '本週'),
          run('✅ 待辦清單', '待辦'),
          run('📆 日曆', '日曆'),
          run('⛪ 我的服事', '服事表'),
          run('📋 主題清單', '主題清單'),
          run('🎼 詩歌庫', '詩歌庫'),
          run('🎵 看順序', '看順序'),
          run('🔗 收藏清單', '收藏清單'),
          run('📑 範本', '範本'),
          run('📝 會議記錄', '會議列表'),
          run('📖 指令說明', '指令'),
        ],
      },
    },
  };
}

function handleHelp() {
  const btn = (label, key) => ({
    type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
    action: { type: 'postback', label, data: `help=${key}`, displayText: label },
  });
  return {
    type: 'flex',
    altText: '📖 指令選單（點分類查看）',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
        contents: [
          { type: 'text', text: '📖 EmmArk 小秘書', weight: 'bold', size: 'lg' },
          { type: 'text', text: '點分類看指令 👇', size: 'sm', color: '#8e8e93' },
          btn('📝 記錄／提醒', 'rec'),
          btn('🎵 敬拜團', 'worship'),
          btn('📅 查詢／管理', 'query'),
          btn('🔗 收藏／搜尋', 'tools'),
          btn('🤖 AI 功能', 'ai'),
        ],
      },
    },
  };
}

const HELP_TRIGGERS = ['幫助', '幫助我', '指令', '給我指令', '怎麼用', '說明', 'help', '?', '？'];

// Detect bulk schedule: 3+ occurrences of M/D pattern
function isBulkSchedule(text) {
  const matches = text.match(/\d{1,2}\/\d{1,2}/g);
  return matches && matches.length >= 3;
}

function parseBulkSchedule(text) {
  // Split by 、，, or newline
  const items = text.split(/[、，,\n]+/).map(s => s.trim()).filter(Boolean);
  const now = new Date();
  const year = now.getFullYear();

  return items.map(item => {
    const m = item.match(/^(\d{1,2})\/(\d{1,2})[：:]?\s*(.+)/);
    if (!m) return null;
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const content = m[3].trim();

    // Use next year if date already passed
    let dueYear = year;
    const due = new Date(year, month - 1, day, 8, 0, 0);
    if (due < now) dueYear = year + 1;
    const dueDate = new Date(dueYear, month - 1, day, 8, 0, 0).toISOString();

    return { content, due_date: dueDate, month, day };
  }).filter(Boolean);
}

async function handleBulkSchedule(text) {
  const items = parseBulkSchedule(text);
  if (items.length === 0) return '❌ 解析失敗，請確認格式如：6/16婦女、6/17弟兄';

  const rows = items.map(item => ({
    raw_text: text,
    type: 'reminder',
    project: null,
    content: item.content,
    due_date: item.due_date,
  }));

  const { error } = await supabase.from('notes').insert(rows);
  if (error) throw new Error(`Supabase insert error: ${error.message}`);

  const preview = items.slice(0, 3).map(i => `• ${i.month}/${i.day} ${i.content}`).join('\n');
  const more = items.length > 3 ? `\n...共 ${items.length} 筆` : `\n共 ${items.length} 筆`;
  return `✅ 批次匯入完成\n${preview}${more}`;
}

// ---- 時間解析 & 前綴指令 ----

function nowTaipeiParts() {
  const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return { y: t.getFullYear(), mo: t.getMonth(), d: t.getDate(), wd: t.getDay() };
}

// 台北牆上時間（UTC+8，無日光節約）-> UTC ISO
function taipeiToISO(y, moZeroBased, d, h, mi) {
  return new Date(Date.UTC(y, moZeroBased, d, h - 8, mi, 0)).toISOString();
}

const WEEKDAY = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

// 從自然語言抓出 due_date（抓不到回 null）
function parseDueDate(text) {
  const { y, mo, d, wd } = nowTaipeiParts();
  let date = null;
  let hasDate = false;

  // 相對時間（精確時刻，直接回傳）：X分鐘後 / 半小時後 / X小時(半)後
  const nowMs = Date.now();
  if (/(?<![\d個])半\s*(?:個)?\s*(?:小時|鐘頭)後/.test(text)) {
    return new Date(nowMs + 30 * 60 * 1000).toISOString();
  }
  const minLater = text.match(/(\d+)\s*分鐘?後/);
  if (minLater) {
    return new Date(nowMs + parseInt(minLater[1], 10) * 60 * 1000).toISOString();
  }
  const hourLater = text.match(/(\d+)\s*(?:個)?\s*(?:小時|鐘頭)\s*半?\s*後/)
    || text.match(/(\d+)\s*個半\s*(?:小時|鐘頭)後/);
  if (hourLater) {
    let ms = parseInt(hourLater[1], 10) * 60 * 60 * 1000;
    if (/半/.test(hourLater[0])) ms += 30 * 60 * 1000;
    return new Date(nowMs + ms).toISOString();
  }

  // 完整日期（含年）：2026-08-09 / 2026/08/09 / 2026年8月9日
  const ymd = text.match(/(\d{4})\s*[-\/年]\s*(\d{1,2})\s*[-\/月]\s*(\d{1,2})\s*日?/);
  // 月/日（無年份）：8/9、8-9、8月9日
  const md = text.match(/(\d{1,2})\s*[-\/月]\s*(\d{1,2})\s*日?/);
  if (ymd) {
    date = { y: parseInt(ymd[1], 10), mo: parseInt(ymd[2], 10) - 1, d: parseInt(ymd[3], 10) };
    hasDate = true;
  } else if (md) {
    const month = parseInt(md[1], 10) - 1;
    const day = parseInt(md[2], 10);
    let yr = y;
    if (new Date(Date.UTC(y, month, day)) < new Date(Date.UTC(y, mo, d))) yr = y + 1;
    date = { y: yr, mo: month, d: day };
    hasDate = true;
  } else if (/今天|今日|今晚/.test(text)) {
    date = { y, mo, d };
    hasDate = true;
  } else if (/明天|明日|明晚/.test(text)) {
    const nd = new Date(Date.UTC(y, mo, d + 1));
    date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
    hasDate = true;
  } else if (/大後天/.test(text)) {
    const nd = new Date(Date.UTC(y, mo, d + 3));
    date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
    hasDate = true;
  } else if (/後天/.test(text)) {
    const nd = new Date(Date.UTC(y, mo, d + 2));
    date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
    hasDate = true;
  } else if (/(\d+)\s*天後/.test(text)) {
    const days = parseInt(text.match(/(\d+)\s*天後/)[1], 10);
    const nd = new Date(Date.UTC(y, mo, d + days));
    date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
    hasDate = true;
  } else {
    const wdMatch = text.match(/(下)?\s*(?:週|周|星期|禮拜)\s*([日天一二三四五六])/);
    if (wdMatch) {
      const target = WEEKDAY[wdMatch[2]];
      let delta = (target - wd + 7) % 7;
      if (delta === 0) delta = 7; // 下一個該星期幾，不含今天
      if (wdMatch[1]) delta += 7; // 「下」週再 +7
      const nd = new Date(Date.UTC(y, mo, d + delta));
      date = { y: nd.getUTCFullYear(), mo: nd.getUTCMonth(), d: nd.getUTCDate() };
      hasDate = true;
    }
  }

  let hour = null;
  let minute = 0;
  let hasTime = false;
  const period = (text.match(/(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|晚間|今晚|明晚)/) || [])[1];
  const hm = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  const dotTime = text.match(/(\d{1,2})\s*點\s*(半|\d{1,2}\s*分?)?/);
  if (hm) {
    hour = parseInt(hm[1], 10);
    minute = parseInt(hm[2], 10);
    hasTime = true;
  } else if (dotTime) {
    hour = parseInt(dotTime[1], 10);
    if (dotTime[2]) minute = dotTime[2].includes('半') ? 30 : parseInt(dotTime[2], 10);
    hasTime = true;
  }
  if (hasTime && hour !== null) {
    if (/下午|傍晚|晚上|晚間|今晚|明晚/.test(text) && hour < 12) hour += 12;
    else if (/凌晨|清晨|早上|上午/.test(text) && hour === 12) hour = 0;
  } else if (period) {
    const map = { 凌晨: 6, 清晨: 6, 早上: 9, 上午: 9, 中午: 12, 下午: 14, 傍晚: 18, 晚上: 20, 晚間: 20, 今晚: 20, 明晚: 20 };
    hour = map[period];
    minute = 0;
    hasTime = true;
  }

  if (!hasDate && !hasTime) return null;
  if (!hasDate) date = { y, mo, d };
  if (!hasTime) {
    hour = 9;
    minute = 0;
  }
  return taipeiToISO(date.y, date.mo, date.d, hour, minute);
}

// 取得某 ISO 在台北時區的年月日時分
function taipeiPartsOf(iso) {
  const o = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso)).forEach(p => { o[p.type] = p.value; });
  return { y: +o.year, mo: +o.month - 1, d: +o.day, hour: +o.hour % 24, minute: +o.minute };
}

const WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六'];
function recurLabel(recur) {
  if (recur === 'daily') return '每天';
  if (recur.startsWith('weekly:')) return `每週${WEEKDAY_LABEL[+recur.split(':')[1]]}`;
  if (recur.startsWith('monthly:')) {
    const parts = recur.split(':');
    const day = parts[1];
    const interval = +(parts[2] || 1);
    if (interval === 1) return `每月${day}號`;
    if (interval === 6) return `每半年（${day}號）`;
    if (interval === 12) return `每年（${day}號）`;
    if (interval % 12 === 0) return `每${interval / 12}年（${day}號）`;
    return `每${interval}個月（${day}號）`;
  }
  return recur;
}

// 解析重複規則（每天 / 每週X / 每月N號 / 每半年 / 每N年）；回傳 { recur, due(首次) } 或 null
function parseRecur(text) {
  let code = null;
  let intervalMonths = null;
  const wk = text.match(/每\s*(?:週|周|星期|禮拜)\s*([日天一二三四五六])/);
  const moM = text.match(/每\s*(?:個)?\s*月\s*(\d{1,2})\s*[號日]/);
  const halfYear = /每\s*半\s*年/.test(text);
  const yearM = text.match(/每\s*(\d{1,2})?\s*年/);
  if (/每天|每日/.test(text)) code = 'daily';
  else if (wk) code = `weekly:${WEEKDAY[wk[1]]}`;
  else if (moM) code = `monthly:${parseInt(moM[1], 10)}:1`;
  else if (halfYear) intervalMonths = 6;
  else if (yearM) intervalMonths = (parseInt(yearM[1], 10) || 1) * 12;
  if (!code && intervalMonths == null) return null;

  // 時間（時:分）：抓不到預設早上 9 點
  let hour = 9, minute = 0;
  const iso = parseDueDate(text);
  if (iso) { const tp = taipeiPartsOf(iso); hour = tp.hour; minute = tp.minute; }

  const { y, mo, d } = nowTaipeiParts();
  let due;
  if (code === 'daily') {
    due = taipeiToISO(y, mo, d, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = taipeiToISO(y, mo, d + 1, hour, minute);
  } else if (code && code.startsWith('weekly')) {
    due = iso || taipeiToISO(y, mo, d, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = nextRecurDue(code, due);
  } else if (intervalMonths != null) {
    // 每半年／每N年：以指定日期（沒指定就用今天）當起點錨定月/日，之後每 N 個月重複一次
    const anchor = iso ? taipeiPartsOf(iso) : { y, mo, d };
    code = `monthly:${anchor.d}:${intervalMonths}`;
    due = taipeiToISO(anchor.y, anchor.mo, anchor.d, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = taipeiToISO(anchor.y, anchor.mo + intervalMonths, anchor.d, hour, minute);
  } else {
    const day = +code.split(':')[1];
    due = taipeiToISO(y, mo, day, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = taipeiToISO(y, mo + 1, day, hour, minute);
  }
  return { recur: code, due };
}

// 由目前 due_date 算出下一次重複時間
function nextRecurDue(recur, fromISO) {
  const p = taipeiPartsOf(fromISO);
  if (recur === 'daily') return taipeiToISO(p.y, p.mo, p.d + 1, p.hour, p.minute);
  if (recur.startsWith('weekly')) return taipeiToISO(p.y, p.mo, p.d + 7, p.hour, p.minute);
  if (recur.startsWith('monthly')) {
    const parts = recur.split(':');
    const day = +parts[1];
    const interval = +(parts[2] || 1); // 舊格式（monthly:N）沒有間隔月數，預設每月一次
    return taipeiToISO(p.y, p.mo + interval, day, p.hour, p.minute);
  }
  return fromISO;
}

function buildRecurReply(note) {
  return `🔁 重複提醒已設定（${recurLabel(note.recur)}）\n📝 ${note.content}\n⏰ 下次：${formatTaipeiDate(note.due_date)}`;
}

async function handleRecurSave(text, rec) {
  const { data, error } = await supabase.from('notes').insert({
    raw_text: text, type: 'reminder', project: null, content: text,
    due_date: rec.due, recur: rec.recur, is_reminded: false, is_done: false,
  }).select().single();
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return buildRecurReply(data || { content: text, recur: rec.recur, due_date: rec.due });
}

// 判斷整句是否「幾乎只是一個時間/日期」（用來判定是不是在回答「什麼時候？」）
function isPureTimeAnswer(text) {
  const s = text
    .replace(/半\s*(?:個)?\s*(?:小時|鐘頭)後/g, '')
    .replace(/(\d+)\s*分鐘?後/g, '')
    .replace(/(\d+)\s*(?:個)?\s*(?:小時|鐘頭)半?後/g, '')
    .replace(/(\d+)\s*天後/g, '')
    .replace(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/g, '')
    .replace(/今天|今日|今晚|明天|明日|明晚|大後天|後天/g, '')
    .replace(/(下)?\s*(?:週|周|星期|禮拜)\s*[日天一二三四五六]/g, '')
    .replace(/凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|晚間/g, '')
    .replace(/(\d{1,2})\s*[:：]\s*(\d{2})/g, '')
    .replace(/(\d{1,2})\s*點\s*(半|\d{1,2}\s*分?)?/g, '')
    .replace(/[\s,，、。的吧喔啦好]/g, '');
  return s.length === 0;
}

// 把純時間回覆補到最近一筆未設時間的提醒上（30 分鐘內）
async function tryAttachPendingTime(text) {
  const due = parseDueDate(text);
  if (!due) return null;

  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('notes')
    .select('*')
    .eq('type', 'reminder')
    .is('due_date', null)
    .eq('is_done', false)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;

  const pending = data[0];
  const { error } = await supabase
    .from('notes')
    .update({ due_date: due, updated_at: new Date().toISOString() })
    .eq('id', pending.id);
  if (error) throw new Error(`Supabase update error: ${error.message}`);

  return `✅ 提醒時間設定好了\n📝 ${pending.content}\n⏰ ${formatTaipeiDate(due)}`;
}

// 前綴指令：筆記 / 待辦 / 提醒 直接存，不繞 AI
async function handlePrefixSave(type, content) {
  const row = { raw_text: content, type, project: null, content, due_date: null, is_reminded: false };
  let askTime = false;
  if (type === 'reminder') {
    const rec = parseRecur(content);
    if (rec) {
      row.due_date = rec.due;
      row.recur = rec.recur;
    } else {
      const due = parseDueDate(content);
      if (due) row.due_date = due;
      else askTime = true;
    }
  }

  const { data, error } = await supabase.from('notes').insert(row).select().single();
  if (error) throw new Error(`Supabase insert error: ${error.message}`);

  if (data && data.recur) return buildRecurReply(data);
  if (askTime) {
    return `📝 提醒已記錄：${content}\n⏰ 要什麼時候提醒你？直接回我時間就好（例如：明天下午3點）`;
  }
  return buildSaveReply(data);
}

// 台北時區的 YYYY-MM-DD key
function taipeiKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

// 建立單一月份的 Flex 月曆 bubble
function buildMonthBubble(year, moZeroBased, byDay, todayKey, worshipByDate = {}) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const wdRow = {
    type: 'box', layout: 'horizontal',
    contents: weekdays.map((w, i) => ({
      type: 'text', text: w, size: 'xs', align: 'center', flex: 1,
      color: i === 0 ? '#ff3b30' : i === 6 ? '#007aff' : '#8e8e93',
    })),
  };

  const firstWd = new Date(Date.UTC(year, moZeroBased, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, moZeroBased + 1, 0)).getUTCDate();
  const pad = n => String(n).padStart(2, '0');

  const blankCell = () => ({ type: 'box', layout: 'vertical', flex: 1, contents: [{ type: 'text', text: ' ', size: 'sm' }] });
  const dayCell = (d) => {
    const key = `${year}-${pad(moZeroBased + 1)}-${pad(d)}`;
    const items = byDay[key] || [];
    const reminders = items.filter(n => n.type === 'reminder').length;
    const tasks = items.filter(n => n.type === 'task').length;
    const isToday = key === todayKey;
    const hasWorship = !!(worshipByDate[key] && worshipByDate[key].length);
    let numColor = '#1d1d1f';
    if (reminders && tasks) numColor = '#5856d6';
    else if (reminders) numColor = '#ff3b30';
    else if (tasks) numColor = '#ff9500';
    else if (hasWorship) numColor = '#1f6f54';
    const hasEvent = items.length > 0;
    let dot = '';
    if (hasWorship) dot += '⛪';
    if (hasEvent) dot += '•';
    if (!dot) dot = ' ';
    return {
      type: 'box', layout: 'vertical', flex: 1, height: '44px',
      justifyContent: 'center', alignItems: 'center',
      cornerRadius: isToday ? '6px' : undefined,
      backgroundColor: isToday ? '#007aff' : undefined,
      contents: [
        { type: 'text', text: String(d), size: 'sm', align: 'center', gravity: 'center',
          weight: (hasEvent || hasWorship) ? 'bold' : 'regular', color: isToday ? '#ffffff' : numColor },
        { type: 'text', text: dot, size: 'xxs', align: 'center',
          color: isToday ? '#ffffff' : numColor },
      ],
    };
  };

  const cells = [];
  for (let i = 0; i < firstWd; i++) cells.push(blankCell());
  for (let d = 1; d <= daysInMonth; d++) cells.push(dayCell(d));
  while (cells.length % 7 !== 0) cells.push(blankCell());

  const weekRows = [];
  for (let i = 0; i < cells.length; i += 7) {
    weekRows.push({ type: 'box', layout: 'horizontal', contents: cells.slice(i, i + 7) });
  }

  // 當月事項列表
  const monthEvents = [];
  Object.keys(byDay).filter(k => k.startsWith(`${year}-${pad(moZeroBased + 1)}-`)).sort().forEach(k => {
    byDay[k].slice().sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).forEach(it => monthEvents.push(it));
  });
  const eventLines = monthEvents.slice(0, 12).map(it => {
    const icon = it.type === 'reminder' ? '🔴' : '🟡';
    const dt = new Date(it.due_date);
    const md = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' });
    const time = dt.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
    return { type: 'text', text: `${md} ${icon} ${time} ${it.content}`, size: 'xs', color: '#444444', wrap: true };
  });
  if (monthEvents.length > 12) eventLines.push({ type: 'text', text: `…還有 ${monthEvents.length - 12} 項`, size: 'xs', color: '#8e8e93' });

  // 主日服事（敬拜班表）
  const worshipLines = Object.keys(worshipByDate || {})
    .filter(k => k.startsWith(`${year}-${pad(moZeroBased + 1)}-`)).sort()
    .map(k => {
      const day = +k.split('-')[2];
      const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date(`${k}T12:00:00+08:00`).getUTCDay()];
      return { type: 'text', text: `${moZeroBased + 1}/${day}（${wd}）⛪ 主日服事`, size: 'xs', color: '#1f6f54', weight: 'bold', wrap: true };
    });

  const listLines = [...worshipLines, ...eventLines];
  if (listLines.length === 0) listLines.push({ type: 'text', text: '本月沒有排程 🎉', size: 'xs', color: '#8e8e93' });

  return {
    type: 'bubble', size: 'mega',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
      contents: [
        { type: 'text', text: `📅 ${year} 年 ${moZeroBased + 1} 月`, weight: 'bold', size: 'lg' },
        wdRow,
        ...weekRows,
        { type: 'separator', margin: 'md' },
        ...listLines,
      ],
    },
  };
}

// 日曆：本月 + 下月 Flex 月曆（萬年曆格式）
async function handleCalendar() {
  const { y, mo } = nowTaipeiParts();
  const startISO = taipeiToISO(y, mo, 1, 0, 0);
  const endExclusiveISO = taipeiToISO(y, mo + 2, 1, 0, 0); // 下下個月 1 號

  const { data } = await supabase
    .from('notes')
    .select('*')
    .in('type', ['reminder', 'task'])
    .eq('is_done', false)
    .gte('due_date', startISO)
    .lt('due_date', endExclusiveISO)
    .order('due_date');

  const byDay = {};
  (data || []).forEach(item => {
    const key = taipeiKey(item.due_date);
    (byDay[key] = byDay[key] || []).push(item);
  });

  // 主日服事（敬拜班表）同一時間範圍
  const pad = n => String(n).padStart(2, '0');
  const startDate = `${y}-${pad(mo + 1)}-01`;
  const after = new Date(Date.UTC(y, mo + 2, 1));
  const endDate = `${after.getUTCFullYear()}-${pad(after.getUTCMonth() + 1)}-01`;
  const { data: worship } = await supabase
    .from('worship_schedule')
    .select('service_date, role, person_name')
    .gte('service_date', startDate)
    .lt('service_date', endDate);
  const worshipByDate = {};
  (worship || []).forEach(w => { (worshipByDate[w.service_date] = worshipByDate[w.service_date] || []).push(w); });

  const tKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  const nextY = mo === 11 ? y + 1 : y;
  const nextMo = (mo + 1) % 12;

  return {
    type: 'flex',
    altText: `📅 ${y}年${mo + 1}月 行事曆`,
    contents: {
      type: 'carousel',
      contents: [
        buildMonthBubble(y, mo, byDay, tKey, worshipByDate),
        buildMonthBubble(nextY, nextMo, byDay, tKey, worshipByDate),
      ],
    },
  };
}

// ===== 敬拜順序（主領歌單）=====
const ORDER_PROJECT = '敬拜順序';
const SONG_PROJECT = '詩歌';
const TEMPLATE_PROJECT = '順序範本';
const LINK_PROJECT = '收藏';
const MEETING_PROJECT = '會議記錄';
const SYSTEM_PROJECTS = [ORDER_PROJECT, SONG_PROJECT, TEMPLATE_PROJECT, LINK_PROJECT, MEETING_PROJECT];

function mdToISO(m, d) { return parseDueDate(`${m}/${d}`); } // 該 M/D 早上 9 點（今年或明年）
function upcomingSundayISO() {
  const { y, mo, d, wd } = nowTaipeiParts();
  const delta = (0 - wd + 7) % 7; // 0 = 今天若為週日
  return taipeiToISO(y, mo, d + delta, 9, 0);
}
function fmtOrderDate(iso) {
  const dt = new Date(iso);
  const md = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' });
  const wd = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' });
  return `${md}（${wd}）`;
}
function fmtOrder(content) {
  // 完全照原樣保留（含換行、箭頭、編號、主→副等結構），不自動拆解
  return content.trim();
}

// 詩歌庫存的格式：歌名 調性 BPM 連結 段落（前4個用空白分隔，段落之後（含歌詞、換行）原樣保留）
function parseSongEntry(content) {
  const [main] = content.trim().split(/｜版本紀錄[:：]/); // 忽略已附加的版本紀錄，避免被當成段落內容
  const m = main.trim().match(/^(\S+)(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+([\s\S]*))?$/);
  if (!m) return { title: '', key: '', bpm: '', link: '', section: '' };
  return { title: m[1] || '', key: m[2] || '', bpm: m[3] || '', link: m[4] || '', section: (m[5] || '').trim() };
}

// 把順序內容拿去跟詩歌庫比對，抓出有出現的歌並帶出調性/BPM/連結（不改動順序原文）
// 判斷 title 是不是「完整出現」在 content 裡，而不是剛好被包在另一個不相關的詞中間
// （例如歌名「愛」不該因為內容有「愛的真諦」就誤判成有唱到「愛」這首歌）
function titleAppearsInContent(title, content) {
  const boundary = /[\s,.:：、，。()（）\-*~\n]/;
  let idx = content.indexOf(title);
  while (idx !== -1) {
    const before = idx === 0 ? '' : content[idx - 1];
    const after = idx + title.length >= content.length ? '' : content[idx + title.length];
    const beforeOK = before === '' || boundary.test(before) || /\d/.test(before); // 允許前面是「1.」這種編號
    const afterOK = after === '' || boundary.test(after);
    if (beforeOK && afterOK) return true;
    idx = content.indexOf(title, idx + 1);
  }
  return false;
}

async function matchSongsInOrder(content) {
  const { data } = await supabase.from('notes').select('content')
    .eq('type', 'note').eq('project', SONG_PROJECT).limit(300);
  if (!data || data.length === 0) return [];
  const seen = new Set();
  const matches = [];
  for (const n of data) {
    const song = parseSongEntry(n.content);
    if (!song.title || seen.has(song.title)) continue;
    if (titleAppearsInContent(song.title, content)) { matches.push(song); seen.add(song.title); }
  }
  return matches;
}

function fmtSongMatches(matches) {
  if (!matches.length) return '';
  const lines = matches.map(m => `• ${m.title}${m.key ? '｜' + m.key : ''}${m.bpm ? '｜' + m.bpm : ''}${m.link ? '｜' + m.link : ''}`);
  return `\n\n🎼 詩歌庫比對到：\n${lines.join('\n')}`;
}

// 從順序內容抓「編號歌單」樣式的候選歌名（如「1.無人能與祢相比」「2、神同在 (E)」）
function extractSongCandidates(content) {
  const out = [];
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*\d+[.、．]\s*(.+?)\s*$/);
    if (!m) return;
    const title = m[1].replace(/[（(][^）)]*[）)]\s*$/, '').trim(); // 去掉結尾的（調性）標註
    if (title) out.push(title);
  });
  return out;
}

// LINE postback 按鈕的 label 上限 20 字，超過就截斷加省略號
function truncateLabel(s, max = 20) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// 組出歌單資訊選單：比對到的歌給按鈕、詩歌庫沒有的給警告
function buildSongMenu(matches, missing) {
  if (matches.length === 0 && missing.length === 0) return null;
  const contents = [
    { type: 'text', text: '🎼 這份歌單的詩歌庫資訊', weight: 'bold', size: 'md' },
  ];
  if (matches.length) {
    contents.push({ type: 'text', text: '點一下看調性/BPM/連結/歌詞', size: 'xs', color: '#8e8e93' });
    matches.slice(0, 10).forEach((m) => {
      contents.push({
        type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
        action: { type: 'postback', label: truncateLabel(`🎼 ${m.title}`), data: `act=songinfo&title=${encodeURIComponent(m.title)}`, displayText: `查 ${m.title} 的資料` },
      });
    });
  }
  if (missing.length) {
    if (matches.length) contents.push({ type: 'separator', margin: 'md' });
    contents.push({ type: 'text', text: `⚠️ 詩歌庫還沒有：${missing.join('、')}`, size: 'sm', wrap: true, color: '#b3322a', margin: 'md' });
    contents.push({ type: 'text', text: '用「存歌 歌名 調性 BPM 連結」補上吧', size: 'xs', color: '#8e8e93' });
  }
  return {
    type: 'flex',
    altText: '🎼 歌單資訊選單',
    contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents } },
  };
}

// 順序回覆：文字版全文＋簡短比對摘要
async function buildOrderReply(headline, content) {
  const matches = await matchSongsInOrder(content);
  return `${headline}\n${fmtOrder(content)}${fmtSongMatches(matches)}`;
}

// 看順序專用：文字版全文＋（如果有比對到/缺歌）附加歌單按鈕選單
async function buildOrderReplyWithMenu(headline, content) {
  const matches = await matchSongsInOrder(content);
  const candidates = extractSongCandidates(content);
  const missing = candidates.filter(c => !matches.some(m => c.includes(m.title) || m.title.includes(c)));
  const text = `${headline}\n${fmtOrder(content)}${fmtSongMatches(matches)}`;
  const menu = buildSongMenu(matches, missing);
  return menu ? [text, menu] : text;
}

async function saveOrder(dateISO, content) {
  const { error } = await supabase.from('notes').insert({
    raw_text: content, type: 'note', project: ORDER_PROJECT, content,
    due_date: dateISO, is_reminded: true, is_done: false,
  });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return buildOrderReply(`✅ 敬拜順序已記錄 ${fmtOrderDate(dateISO)}\n🎵`, content);
}

async function findSongEntryRow(title) {
  const { data } = await supabase.from('notes').select('*')
    .eq('type', 'note').eq('project', SONG_PROJECT).limit(300);
  return (data || []).find(n => parseSongEntry(n.content).title === title) || null;
}

function parseHistoryList(content) {
  const m = content.match(/｜版本紀錄[:：]\s*(.+)$/);
  return m ? m[1].split('、').filter(Boolean) : [];
}

// 點歌單按鈕：秀出該首歌目前完整資訊（含歌詞），若有版本紀錄再附第二層選單
async function showSongInfo(title) {
  const row = await findSongEntryRow(title);
  if (!row) return `🎼 詩歌庫還沒有「${title}」的資料，用「存歌 ${title} 調性 BPM 連結」補上吧。`;

  const [mainPart] = row.content.split(/｜版本紀錄[:：]/);
  const textMsg = `🎼 ${mainPart.trim()}`;
  const history = parseHistoryList(row.content);
  if (history.length === 0) return textMsg;

  const histFlex = {
    type: 'flex',
    altText: `📜 ${title} 的版本紀錄`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
        contents: [
          { type: 'text', text: `📜 ${title} 版本紀錄`, weight: 'bold', size: 'md' },
          { type: 'text', text: '點一下看那個時間點的版本', size: 'xs', color: '#8e8e93' },
          ...history.map((h, i) => ({
            type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
            action: { type: 'postback', label: truncateLabel(h), data: `act=songhist&title=${encodeURIComponent(title)}&idx=${i}`, displayText: `查 ${title} 的舊版本` },
          })),
        ],
      },
    },
  };
  return [textMsg, histFlex];
}

async function showSongHistoryEntry(title, idxStr) {
  const row = await findSongEntryRow(title);
  if (!row) return `🎼 詩歌庫還沒有「${title}」的資料。`;
  const history = parseHistoryList(row.content);
  const entry = history[parseInt(idxStr, 10)];
  if (!entry) return '找不到這筆版本紀錄了（可能已經被洗掉，只留最近5筆）。';
  return `📜 ${title}　舊版本\n${entry}`;
}

async function handleWorshipOrder(rest) {
  if (rest === '') return recallOrder(null);
  const dateOnly = rest.match(/^(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?$/);
  if (dateOnly) return recallOrder(taipeiKey(mdToISO(+dateOnly[1], +dateOnly[2])));

  // 記錄：抓開頭日期，其餘為內容
  let dateISO, songs;
  const lead = rest.match(/^(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?[\s,，、:：]*/);
  if (lead) { dateISO = mdToISO(+lead[1], +lead[2]); songs = rest.slice(lead[0].length).trim(); }
  else { dateISO = upcomingSundayISO(); songs = rest; }
  if (!songs) return recallOrder(null);
  return saveOrder(dateISO, songs);
}

function orderRecallKey(rest) {
  const m = rest.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  return m ? taipeiKey(mdToISO(+m[1], +m[2])) : null;
}

async function recallOrder(dateKey) {
  const { data } = await supabase.from('notes').select('*')
    .eq('type', 'note').eq('project', ORDER_PROJECT)
    .order('due_date', { ascending: true });
  if (!data || data.length === 0) {
    return '還沒有任何敬拜順序記錄喔。\n記錄方式：「順序 6/29」後面接你的流程（歌曲、主→副、禱告、宣告…都可以，可換行）';
  }
  let item;
  if (dateKey) {
    const matches = data.filter(n => taipeiKey(n.due_date) === dateKey)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (matches.length === 0) {
      const md = dateKey.slice(5).replace('-', '/');
      return `${md} 還沒有敬拜順序。\n記錄方式：順序 ${md} 後面接流程（歌曲、主→副、禱告…）`;
    }
    item = matches[0];
  } else {
    const tKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    const upcoming = data.filter(n => taipeiKey(n.due_date) >= tKey);
    item = upcoming.length ? upcoming[0] : data[data.length - 1];
  }
  return buildOrderReplyWithMenu(`🎵 敬拜順序 ${fmtOrderDate(item.due_date)}`, item.content);
}

// ===== 主題式提醒（批次，用 project 當主題標籤）=====
async function handleTheme(rest) {
  const lines = rest.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return '用法：\n主題 WeR One特會\n7/7 11:00 報到\n7/7 13:00 敬拜\n（第一行主題，之後一行一個行程）';
  }
  const theme = lines[0];
  const items = lines.slice(1);
  if (items.length === 0) return viewTheme(theme); // 只有主題名 → 改成查看

  const rows = [];
  const skipped = [];
  for (const raw of items) {
    const { lead, text: it } = extractLeadMinutes(raw);
    const due = parseDueDate(it);
    if (!due) { skipped.push(`${raw}（${guessSkipReason(it)}）`); continue; }
    let content = it
      .replace(/^\s*\d{4}\s*[-\/年]\s*\d{1,2}\s*[-\/月]\s*\d{1,2}\s*日?\s*/, '')
      .replace(/^\s*\d{1,2}\s*[-\/月]\s*\d{1,2}\s*日?\s*/, '')
      .replace(/^\s*(?:上午|下午|早上|晚上|中午|凌晨|清晨)?\s*\d{1,2}\s*[:：]\s*\d{2}\s*/, '')
      .replace(/^\s*(?:上午|下午|早上|晚上|中午|凌晨|清晨)?\s*\d{1,2}\s*點\s*(?:半|\d{1,2}\s*分?)?\s*/, '')
      .replace(/^\s*[~～\-]\s*\d{1,2}\s*[:：]\s*\d{2}\s*/, '')
      .trim();
    if (!content) content = it;
    rows.push({ raw_text: raw, type: 'reminder', project: theme, content, due_date: due, remind_lead_minutes: lead, is_reminded: false, is_done: false });
  }
  if (rows.length === 0) return '每行請含日期與時間，例如「7/7 11:00 報到」。';

  const { error } = await supabase.from('notes').insert(rows);
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  let reply = `✅ 已建立主題「${theme}」共 ${rows.length} 則提醒，到時間會通知你。\n（看主題 ${theme}　可隨時叫出整份）`;
  if (skipped.length) reply += `\n⚠️ 略過 ${skipped.length} 行：\n${skipped.join('\n')}`;

  const worshipConflict = await checkThemeWorshipConflicts(rows);
  if (worshipConflict.length) reply += `\n${worshipConflict.join('\n')}`;

  return reply;
}

// 猜測某行為何抓不到日期時間，給使用者具體的修正提示
function guessSkipReason(text) {
  const hasDate = /\d{4}\s*[-\/年]\s*\d{1,2}\s*[-\/月]|\d{1,2}\s*[-\/月]\s*\d{1,2}|今天|明天|後天|大後天|[週周星期禮拜][日天一二三四五六]/.test(text);
  const hasTime = /\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*點|上午|下午|早上|晚上|中午|凌晨|清晨/.test(text);
  if (hasDate && !hasTime) return '有抓到日期，但沒抓到時間';
  if (!hasDate && hasTime) return '有抓到時間，但沒抓到日期';
  return '沒抓到日期與時間，請確認格式';
}

// 主題式批次：找出當中會撞到自己服事的日期，合併成一則警告
async function checkThemeWorshipConflicts(rows) {
  const myName = process.env.WORSHIP_MY_NAME;
  if (!myName) return [];
  const dateKeys = [...new Set(rows.map(r => taipeiKey(r.due_date)))];
  if (dateKeys.length === 0) return [];

  const { data: serving } = await supabase
    .from('worship_schedule')
    .select('service_date, role')
    .eq('person_name', myName)
    .in('service_date', dateKeys);
  if (!serving || serving.length === 0) return [];

  const byDate = {};
  serving.forEach(s => { (byDate[s.service_date] = byDate[s.service_date] || []).push(s.role); });
  const lines = Object.entries(byDate).map(([date, roles]) => `${date.slice(5).replace('-', '/')}（${roles.join('、')}）`);
  return [`⛪ 提醒：這批行程裡有 ${lines.join('、')} 你已經有服事，注意別排到衝突`];
}

async function viewTheme(theme) {
  const { data } = await supabase.from('notes').select('*')
    .eq('project', theme).eq('is_done', false);
  if (!data || data.length === 0) return `找不到專案／主題「${theme}」。`;
  data.sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1;
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const lines = [`📋 ${theme}（${data.length}）`];
  data.forEach(n => {
    const label = n.due_date
      ? new Date(n.due_date).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      : (TYPE_LABEL[n.type] || '');
    lines.push(`• ${label} ${n.content}`);
  });
  return lines.join('\n');
}

async function deleteTheme(theme) {
  const { data } = await supabase.from('notes').select('id').eq('project', theme).eq('type', 'reminder');
  const n = data ? data.length : 0;
  if (n === 0) return `找不到主題「${theme}」的提醒。`;
  const { error } = await supabase.from('notes').delete().eq('project', theme).eq('type', 'reminder');
  if (error) throw new Error(`Supabase delete error: ${error.message}`);
  return `🗑 已刪除主題「${theme}」的 ${n} 則提醒。`;
}

// 刪主題前的二次確認（整批刪除、無法復原，先問過再動手）
async function confirmDeleteTheme(theme) {
  const { data } = await supabase.from('notes').select('id').eq('project', theme).eq('type', 'reminder');
  const n = data ? data.length : 0;
  if (n === 0) return `找不到主題「${theme}」的提醒。`;
  return {
    type: 'flex',
    altText: `⚠️ 確定要刪除主題「${theme}」的 ${n} 則提醒嗎？`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
        contents: [
          { type: 'text', text: '⚠️ 確定要刪除嗎？', weight: 'bold', size: 'lg' },
          { type: 'text', text: `主題「${theme}」共 ${n} 則提醒會整批刪除，無法復原。`, size: 'sm', wrap: true, color: '#8e8e93' },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#b3322a', height: 'sm',
            action: { type: 'postback', label: '🗑 確定刪除', data: `act=delproj&theme=${encodeURIComponent(theme)}`, displayText: `確定刪除主題「${theme}」` } },
          { type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'message', label: '取消', text: '取消' } },
        ],
      },
    },
  };
}

async function listThemes() {
  const { data } = await supabase.from('notes').select('*').not('project', 'is', null);
  const themes = {};
  (data || []).forEach(n => {
    if (!n.project || SYSTEM_PROJECTS.includes(n.project)) return;
    const t = themes[n.project] || (themes[n.project] = { count: 0, next: null });
    t.count++;
    if ((n.type === 'reminder' || n.type === 'task') && !n.is_done && n.due_date) {
      if (!t.next || n.due_date < t.next) t.next = n.due_date;
    }
  });
  const names = Object.keys(themes);
  if (names.length === 0) return '目前沒有任何專案／主題。';
  names.sort((a, b) => {
    const na = themes[a].next, nb = themes[b].next;
    if (na && nb) return na < nb ? -1 : 1;
    if (na) return -1;
    if (nb) return 1;
    return a.localeCompare(b);
  });
  const contents = [
    { type: 'text', text: '📋 專案／主題清單', weight: 'bold', size: 'lg' },
    { type: 'text', text: '點一下看內容', size: 'sm', color: '#8e8e93' },
  ];
  names.slice(0, 12).forEach((t) => {
    const nx = themes[t].next ? `，下次提醒 ${formatTaipeiDate(themes[t].next)}` : '';
    contents.push({
      type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
      action: {
        type: 'postback',
        label: truncateLabel(`📋 ${t}（${themes[t].count}）`),
        data: `act=viewproj&theme=${encodeURIComponent(t)}`,
        displayText: `看主題 ${t}${nx}`,
      },
    });
  });
  return {
    type: 'flex',
    altText: '📋 專案／主題清單',
    contents: { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents } },
  };
}

// ===== 全文搜尋 =====
async function handleSearch(kw) {
  const { data } = await supabase.from('notes').select('*')
    .ilike('content', `%${kw}%`).order('created_at', { ascending: false }).limit(15);
  if (!data || data.length === 0) return `🔍 找不到包含「${kw}」的記錄。`;
  const lines = [`🔍 「${kw}」找到 ${data.length} 筆`];
  data.forEach(n => {
    const proj = n.project ? `[${n.project}] ` : '';
    const time = n.due_date ? `${formatTaipeiDate(n.due_date)} ` : '';
    const done = n.is_done ? '✅ ' : '';
    lines.push(`• ${done}${proj}${time}${n.content}`);
  });
  return lines.join('\n');
}

// ===== 詩歌資料庫 =====
// 同名歌曲：後蓋前（更新既有那筆），調性/BPM/連結有變會附上簡易版本異動履歷
async function addSong(content) {
  const entry = parseSongEntry(content);
  if (!entry.title) {
    const { error } = await supabase.from('notes').insert({
      raw_text: content, type: 'note', project: SONG_PROJECT, content, is_reminded: true, is_done: false,
    });
    if (error) throw new Error(`Supabase insert error: ${error.message}`);
    return `🎼 已存入詩歌庫：\n${content}`;
  }

  const { data: existing } = await supabase.from('notes').select('*')
    .eq('type', 'note').eq('project', SONG_PROJECT)
    .order('created_at', { ascending: false }).limit(100);
  const prev = (existing || []).find(n => parseSongEntry(n.content).title === entry.title);

  let historyNote = '';
  let keyChangeNote = '';
  if (prev) {
    const prevEntry = parseSongEntry(prev.content);
    const oldHistoryMatch = prev.content.match(/｜版本紀錄[:：]\s*(.+)$/);
    const historyList = oldHistoryMatch ? oldHistoryMatch[1].split('、') : [];

    const FIELD_LABEL = { key: '調性', bpm: 'BPM', link: '連結' };
    const changed = ['key', 'bpm', 'link'].filter(f => prevEntry[f] && prevEntry[f] !== entry[f]);
    if (changed.length) {
      const todayLabel = taipeiKey(new Date().toISOString()).slice(5).replace('-', '/');
      const snapshot = [prevEntry.key, prevEntry.bpm, prevEntry.link].filter(Boolean).join('｜');
      historyList.push(`${todayLabel}前:${snapshot}`);
      const changeLines = changed.map(f => `${FIELD_LABEL[f]} ${prevEntry[f]} → ${entry[f] || '（無）'}`);
      keyChangeNote = `\n🔁 ${changeLines.join('　')}`;
    }
    if (historyList.length) historyNote = `｜版本紀錄:${historyList.slice(-5).join('、')}`;
  }

  const header = [entry.title, entry.key, entry.bpm, entry.link].filter(Boolean).join(' ');
  const bodyParts = [header];
  if (entry.section) bodyParts.push(entry.section); // 保留段落／歌詞原本的換行
  if (historyNote) bodyParts.push(historyNote);
  const newContent = bodyParts.join('\n');

  if (prev) {
    const { error } = await supabase.from('notes')
      .update({ content: newContent, raw_text: newContent, updated_at: new Date().toISOString() })
      .eq('id', prev.id);
    if (error) throw new Error(`Supabase update error: ${error.message}`);
    return `🎼 詩歌庫已更新：\n${newContent}${keyChangeNote}`;
  }

  const { error } = await supabase.from('notes').insert({
    raw_text: newContent, type: 'note', project: SONG_PROJECT, content: newContent, is_reminded: true, is_done: false,
  });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return `🎼 已存入詩歌庫：\n${newContent}`;
}
// 把一批詩歌庫筆記畫成「點歌看完整資料」的按鈕選單
function buildSongListFlex(header, rows) {
  const contents = [
    { type: 'text', text: header, weight: 'bold', size: 'lg' },
    { type: 'text', text: '點一下看調性/BPM/連結/歌詞', size: 'sm', color: '#8e8e93' },
  ];
  rows.slice(0, 12).forEach((entry) => {
    contents.push({
      type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
      action: {
        type: 'postback',
        label: truncateLabel(`🎼 ${entry.title}${entry.key ? '｜' + entry.key : ''}`),
        data: `act=songinfo&title=${encodeURIComponent(entry.title)}`,
        displayText: `查 ${entry.title} 的資料`,
      },
    });
  });
  return {
    type: 'flex',
    altText: header,
    contents: { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents } },
  };
}

async function findSong(kw) {
  const { data } = await supabase.from('notes').select('*')
    .eq('project', SONG_PROJECT).ilike('content', `%${kw}%`).order('created_at', { ascending: false }).limit(20);
  if (!data || data.length === 0) return `🎼 詩歌庫沒有「${kw}」。`;
  const rows = data.map(n => parseSongEntry(n.content)).filter(e => e.title);
  return buildSongListFlex(`🎼 「${kw}」（${rows.length}）`, rows);
}
async function listSongs() {
  const { data } = await supabase.from('notes').select('*')
    .eq('project', SONG_PROJECT).order('created_at', { ascending: false }).limit(30);
  if (!data || data.length === 0) return '🎼 詩歌庫還是空的。\n新增：存歌 歌名 調性 BPM 連結 段落';
  const rows = data.map(n => parseSongEntry(n.content)).filter(e => e.title);
  return buildSongListFlex(`🎼 詩歌庫（${rows.length}）`, rows);
}

// ===== 敬拜順序範本 =====
async function addTemplate(rest) {
  const ls = rest.split('\n');
  const name = (ls[0] || '').trim();
  const flow = ls.slice(1).join('\n').trim();
  if (!name || !flow) return '用法：\n存範本 範本名\n1.歌A 主→副\n2.禱告\n（第一行範本名，之後是流程）';
  const { error } = await supabase.from('notes').insert({
    raw_text: name, type: 'note', project: TEMPLATE_PROJECT, content: flow, is_reminded: true, is_done: false,
  });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return `📑 已存範本「${name}」\n下次套用：套範本 ${name} 6/29`;
}
async function listTemplates() {
  const { data } = await supabase.from('notes').select('*')
    .eq('project', TEMPLATE_PROJECT).order('created_at', { ascending: false });
  if (!data || data.length === 0) return '📑 還沒有範本。\n新增：存範本 範本名（換行）流程…';
  const contents = [
    { type: 'text', text: '📑 敬拜順序範本', weight: 'bold', size: 'lg' },
    { type: 'text', text: '點一下套用到下個主日', size: 'sm', color: '#8e8e93' },
  ];
  data.slice(0, 12).forEach((n) => {
    contents.push({
      type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
      action: {
        type: 'postback',
        label: truncateLabel(`📑 ${n.raw_text}`),
        data: `act=usetpl&name=${encodeURIComponent(n.raw_text)}`,
        displayText: `套範本 ${n.raw_text}`,
      },
    });
  });
  return {
    type: 'flex',
    altText: '📑 敬拜順序範本',
    contents: { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents } },
  };
}
async function useTemplate(rest) {
  const dm = rest.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  const name = (dm ? rest.replace(dm[0], '') : rest).trim();
  if (!name) return '用法：套範本 範本名 6/29';
  const { data } = await supabase.from('notes').select('*')
    .eq('project', TEMPLATE_PROJECT).ilike('raw_text', `%${name}%`).limit(1);
  if (!data || data.length === 0) return `找不到範本「${name}」。（打「範本」可列出全部）`;
  const dateISO = dm ? mdToISO(+dm[1], +dm[2]) : upcomingSundayISO();
  return saveOrder(dateISO, data[0].content);
}

// ===== 連結收藏箱 =====
async function addLink(content) {
  const { error } = await supabase.from('notes').insert({
    raw_text: content, type: 'note', project: LINK_PROJECT, content, is_reminded: true, is_done: false,
  });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return '🔗 已收藏，打「收藏清單」可查看。';
}
async function listLinks() {
  const { data } = await supabase.from('notes').select('*')
    .eq('project', LINK_PROJECT).eq('is_done', false).order('created_at', { ascending: false }).limit(30);
  if (!data || data.length === 0) return '🔗 收藏清單是空的。\n收藏：收藏 貼上網址';
  const lines = [`🔗 收藏清單（${data.length}）`];
  data.forEach((n, i) => lines.push(`${i + 1}. ${n.content}`));
  return lines.join('\n');
}

// ===== 會議記錄 =====
// 內容裡標「待辦:」「TODO:」「行動項目:」開頭的行，自動拆成獨立待辦
function extractActionItems(content) {
  const items = [];
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*(?:待辦|待辦事項|todo|to-?do|行動項目|action)[:：]\s*(.+)$/i);
    if (m && m[1].trim()) items.push(m[1].trim());
  });
  return items;
}

async function saveMeeting(dateISO, content) {
  const { error } = await supabase.from('notes').insert({
    raw_text: content, type: 'note', project: MEETING_PROJECT, content,
    due_date: dateISO, is_reminded: true, is_done: false,
  });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);

  const items = extractActionItems(content);
  let actionText = '';
  if (items.length) {
    const rows = items.map(it => ({
      raw_text: it, type: 'task', project: MEETING_PROJECT, content: it,
      due_date: null, is_reminded: false, is_done: false,
    }));
    const { error: taskErr } = await supabase.from('notes').insert(rows);
    if (!taskErr) actionText = `\n\n📌 已自動建立 ${items.length} 個待辦：\n${items.map(i => `• ${i}`).join('\n')}`;
  }

  return `✅ 會議記錄已存 ${fmtOrderDate(dateISO)}\n📝\n${content.trim()}${actionText}`;
}

async function handleMeeting(rest) {
  if (!rest) return listMeetings();
  const dateOnly = rest.match(/^(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?$/);
  if (dateOnly) return recallMeeting(taipeiKey(mdToISO(+dateOnly[1], +dateOnly[2])));

  let dateISO, content;
  const lead = rest.match(/^(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?[\s,，、:：]*/);
  if (lead) { dateISO = mdToISO(+lead[1], +lead[2]); content = rest.slice(lead[0].length).trim(); }
  else { const { y, mo, d } = nowTaipeiParts(); dateISO = taipeiToISO(y, mo, d, 9, 0); content = rest; }
  if (!content) return recallMeeting(taipeiKey(dateISO));
  return saveMeeting(dateISO, content);
}

async function recallMeeting(dateKey) {
  const { data } = await supabase.from('notes').select('*')
    .eq('type', 'note').eq('project', MEETING_PROJECT).order('due_date', { ascending: false });
  if (!data || data.length === 0) {
    return '還沒有任何會議記錄。\n記錄方式：「會議 7/14」後面接內容（可換行、可用「待辦:」標記行動項目）';
  }
  let item;
  if (dateKey) {
    const matches = data.filter(n => taipeiKey(n.due_date) === dateKey)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (matches.length === 0) return `${dateKey.slice(5).replace('-', '/')} 沒有會議記錄。`;
    item = matches[0];
  } else {
    item = data[0]; // 最新一筆
  }
  return `📝 會議記錄 ${fmtOrderDate(item.due_date)}\n${item.content.trim()}`;
}

async function listMeetings() {
  const { data } = await supabase.from('notes').select('*')
    .eq('type', 'note').eq('project', MEETING_PROJECT).order('due_date', { ascending: false }).limit(30);
  if (!data || data.length === 0) {
    return '還沒有任何會議記錄。\n記錄方式：「會議 7/14」後面接內容（可換行、可用「待辦:」標記行動項目）';
  }
  const contents = [
    { type: 'text', text: '📝 會議記錄', weight: 'bold', size: 'lg' },
    { type: 'text', text: '點一下看那次的完整記錄', size: 'sm', color: '#8e8e93' },
  ];
  data.slice(0, 12).forEach((n) => {
    const key = taipeiKey(n.due_date);
    contents.push({
      type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
      action: {
        type: 'postback',
        label: truncateLabel(`📝 ${fmtOrderDate(n.due_date)}`),
        data: `act=viewmeeting&date=${key}`,
        displayText: `看 ${fmtOrderDate(n.due_date)} 的會議記錄`,
      },
    });
  });
  return {
    type: 'flex',
    altText: '📝 會議記錄',
    contents: { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents } },
  };
}

async function dispatch(text) {
  const trimmed = text.trim();

  if (trimmed === '取消') return '好，先不動作 👌';
  if (trimmed === '今天') return handleToday();
  if (trimmed === '本週') return handleWeek();
  if (['待辦', '代辦', '看待辦', '未完成', '待辦清單', '未完成清單'].includes(trimmed)) return handleTodos();
  if (['早安', '早安簡報'].includes(trimmed)) return handleMorning();
  if (['行程', '今日行程', '簡報', '今日簡報'].includes(trimmed)) {
    return handleMorning({ header: '📋 今日行程摘要', altPrefix: '📋 今日行程摘要' });
  }
  if (['選單', '查詢', '查閱', 'menu', '功能'].includes(trimmed)) return handleMenu();
  if (trimmed === '筆記') return handleNotes();
  if (trimmed === '專案') return handleProjects();
  if (trimmed === '日曆' || trimmed === '行事曆') return handleCalendar();
  if (HELP_TRIGGERS.includes(trimmed)) return handleHelp();
  if (['更新', '更新日誌', '最近更新', '有什麼新功能', '版本'].includes(trimmed)) return handleChangelog();
  if (trimmed.startsWith('完成')) return handleDone(trimmed.slice(2).trim());
  if (trimmed.startsWith('刪除')) return handleDelete(trimmed.slice(2).trim());
  if (trimmed.startsWith('改內容')) return handleEditContent(trimmed.slice(3).trim());
  if (trimmed.startsWith('改時間')) return handleEditTime(trimmed.slice(3).trim());

  // 敬拜順序：寫/看 + 順序（日期可放前或後）
  const ow = trimmed.match(/^(寫|記錄|看|查|叫|顯示)([\s\S]*順序[\s\S]*)$/);
  if (ow) {
    const isWrite = /^(寫|記錄)/.test(ow[1]);
    const body = ow[2].replace(/敬拜/g, '').replace('順序', '');
    const dm = body.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/);
    const dateKey = dm ? taipeiKey(mdToISO(+dm[1], +dm[2])) : null;
    if (!isWrite) return recallOrder(dateKey);
    const content = (dm ? body.replace(dm[0], '') : body).replace(/^[\s:：,，、]+/, '').trim();
    if (!content) return recallOrder(dateKey);
    return saveOrder(dm ? mdToISO(+dm[1], +dm[2]) : upcomingSundayISO(), content);
  }
  // 相容：「順序 …」開頭（無動詞）
  const orderMatch = trimmed.match(/^(?:敬拜)?順序[\s:：]*([\s\S]*)$/);
  if (orderMatch) return handleWorshipOrder(orderMatch[1].trim());

  // 會議記錄：寫/看 + 會議（日期可放前或後），bare「會議 …」也視為記錄
  if (['會議列表', '會議清單', '所有會議'].includes(trimmed)) return listMeetings();
  const mw = trimmed.match(/^(寫|記錄|看|查|叫|顯示)\s*會議(?:記錄)?[\s:：]*([\s\S]*)$/);
  if (mw) {
    const isView = /^(看|查|叫|顯示)/.test(mw[1]);
    const rest = mw[2].trim();
    if (isView) {
      const dm = rest.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
      return recallMeeting(dm ? taipeiKey(mdToISO(+dm[1], +dm[2])) : null);
    }
    return handleMeeting(rest);
  }
  const meetingBare = trimmed.match(/^會議(?:記錄)?[\s:：]*([\s\S]*)$/);
  if (meetingBare) return handleMeeting(meetingBare[1].trim());

  // 主題式提醒（批次）
  if (['主題清單', '主題列表', '所有主題', '看主題', '看特會', '特會清單'].includes(trimmed)) return listThemes();
  const themeView = trimmed.match(/^看\s*(?:主題|特會)[\s:：]*([\s\S]+)$/);
  if (themeView) return viewTheme(themeView[1].trim());
  const themeDel = trimmed.match(/^刪(?:除)?\s*(?:主題|特會)[\s:：]*([\s\S]+)$/);
  if (themeDel) return confirmDeleteTheme(themeDel[1].trim());
  const themeMatch = trimmed.match(/^(?:主題|特會)[\s:：]+([\s\S]+)$/);
  if (themeMatch) return handleTheme(themeMatch[1]);

  // 全文搜尋
  const searchM = trimmed.match(/^(?:搜尋|搜索)[\s:：]*([\s\S]+)$/);
  if (searchM) return handleSearch(searchM[1].trim());

  // 詩歌資料庫
  if (trimmed === '詩歌庫' || trimmed === '歌庫') return listSongs();
  const songFind = trimmed.match(/^找歌[\s:：]*([\s\S]+)$/);
  if (songFind) return findSong(songFind[1].trim());
  const songAdd = trimmed.match(/^存歌[\s:：]+([\s\S]+)$/);
  if (songAdd) return addSong(songAdd[1].trim());

  // 敬拜順序範本
  if (trimmed === '範本' || trimmed === '範本清單') return listTemplates();
  const tplUse = trimmed.match(/^套範本[\s:：]*([\s\S]+)$/);
  if (tplUse) return useTemplate(tplUse[1].trim());
  const tplAdd = trimmed.match(/^存範本[\s:：]+([\s\S]+)$/);
  if (tplAdd) return addTemplate(tplAdd[1].trim());

  // 連結收藏箱
  if (trimmed === '收藏清單' || trimmed === '稍後讀') return listLinks();
  const linkAdd = trimmed.match(/^收藏[\s:：]*([\s\S]+)$/);
  if (linkAdd) return addLink(linkAdd[1].trim());
  if (/^https?:\/\/\S+/.test(trimmed)) return addLink(trimmed);

  // 純時間回覆 → 嘗試補到最近一筆等待時間的提醒
  if (isPureTimeAnswer(trimmed)) {
    const attached = await tryAttachPendingTime(trimmed);
    if (attached) return attached;
  }

  // 前綴指令：筆記/待辦/提醒 + 內容 → 直接存，不繞 AI
  const prefixMatch =
    trimmed.match(/^(筆記|待辦)[\s:：、]+([\s\S]+)/) ||
    trimmed.match(/^(提醒)(?:[\s:：、]+|我)([\s\S]+)/);
  if (prefixMatch) {
    const type = { 筆記: 'note', 待辦: 'task', 提醒: 'reminder' }[prefixMatch[1]];
    return handlePrefixSave(type, prefixMatch[2].trim());
  }

  // Worship schedule commands
  if (trimmed === '服事表' || trimmed === '我的服事' || trimmed === '我的服事表') {
    return getMySchedule(process.env.WORSHIP_MY_NAME);
  }
  const worshipDateMatch = trimmed.match(/^(?:服事表?|服事)\s*(\d{1,2}[\/\-]\d{1,2})$|^(\d{1,2}[\/\-]\d{1,2})\s*服事表?$/);
  if (worshipDateMatch) {
    const dateStr = worshipDateMatch[1] || worshipDateMatch[2];
    return getScheduleByDate(dateStr);
  }
  const worshipMonthMatch = trimmed.match(/^服事表?\s*(\d{1,2})\s*月份?$/) || trimmed.match(/^(\d{1,2})\s*月份?\s*服事表$/);
  if (worshipMonthMatch) return getMyMonthSchedule(process.env.WORSHIP_MY_NAME, worshipMonthMatch[1]);

  if (isBulkSchedule(trimmed)) return handleBulkSchedule(trimmed);

  const rec = parseRecur(trimmed);
  if (rec) return handleRecurSave(trimmed, rec);

  // 開頭很像某個指令但沒對到格式：先跟你確認，不要默默存成筆記
  const typoGuess = findTypoCommand(trimmed);
  if (typoGuess) {
    return `🤔 是不是想打「${typoGuess}」開頭的指令？我看不太懂「${trimmed.slice(0, 12)}${trimmed.length > 12 ? '…' : ''}」，先跟你確認一下，沒有存成筆記。打「指令」可以看正確格式。`;
  }

  return handleSave(trimmed);
}

// 提醒到點時用的 Flex 卡片（含 完成／延後／改明天 按鈕）
function buildReminderFlex(note) {
  const time = formatTaipeiDate(note.due_date);
  const isRecur = !!note.recur;
  const mins = note.due_date ? Math.round((new Date(note.due_date).getTime() - Date.now()) / 60000) : 0;
  const head = mins >= 1 ? `⏰ 快到了！約 ${mins} 分鐘後` : '⏰ 提醒到了！';
  const footerButtons = isRecur
    ? [
        { type: 'button', style: 'secondary', height: 'sm',
          action: { type: 'postback', label: '🛑 停止重複', data: `act=done&id=${note.id}`, displayText: '停止這個重複提醒 🛑' } },
      ]
    : [
        { type: 'button', style: 'primary', color: '#34c759', height: 'sm',
          action: { type: 'postback', label: '✅ 完成', data: `act=done&id=${note.id}`, displayText: '完成 ✅' } },
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          { type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: '⏰ 延後1hr', data: `act=snooze&id=${note.id}`, displayText: '延後一小時 ⏰' } },
          { type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: '📅 明天', data: `act=tomorrow&id=${note.id}`, displayText: '改到明天 📅' } },
        ] },
      ];
  return {
    type: 'flex',
    altText: `⏰ 提醒：${note.content}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
        contents: [
          { type: 'text', text: head, weight: 'bold', size: 'lg', color: '#ff3b30' },
          { type: 'text', text: note.content, size: 'md', wrap: true },
          ...(note.project ? [{ type: 'text', text: `🗂 ${note.project}`, size: 'sm', color: '#8e8e93' }] : []),
          ...(time ? [{ type: 'text', text: `🕐 ${time}`, size: 'sm', color: '#8e8e93' }] : []),
          ...(isRecur ? [{ type: 'text', text: `🔁 ${recurLabel(note.recur)}`, size: 'sm', color: '#5856d6' }] : []),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: footerButtons,
      },
    },
  };
}

// 處理 Flex 按鈕（postback）：完成 / 延後 / 改明天
async function handlePostback(dataStr) {
  const p = new URLSearchParams(dataStr || '');
  const run = p.get('run');
  if (run) return dispatch(run); // 按鈕直接執行查閱指令
  const help = p.get('help');
  if (help) return helpSection(help);
  const act = p.get('act');
  if (act === 'delproj') {
    const theme = p.get('theme');
    return theme ? deleteTheme(decodeURIComponent(theme)) : null;
  }
  if (act === 'songinfo') {
    const title = p.get('title');
    return title ? showSongInfo(decodeURIComponent(title)) : null;
  }
  if (act === 'songhist') {
    const title = p.get('title');
    return title ? showSongHistoryEntry(decodeURIComponent(title), p.get('idx')) : null;
  }
  if (act === 'todosbydate') {
    const date = p.get('date');
    return date ? handleTodosByDate(date) : null;
  }
  if (act === 'viewproj') {
    const theme = p.get('theme');
    return theme ? viewTheme(decodeURIComponent(theme)) : null;
  }
  if (act === 'usetpl') {
    const name = p.get('name');
    return name ? useTemplate(decodeURIComponent(name)) : null;
  }
  if (act === 'viewmeeting') {
    const date = p.get('date');
    return date ? recallMeeting(date) : null;
  }
  const id = p.get('id');
  if (!act || !id) return null;

  const { data: rows } = await supabase.from('notes').select('*').eq('id', id).limit(1);
  const note = rows && rows[0];
  if (!note) return '這筆項目找不到了（可能已刪除）。';

  const now = new Date().toISOString();
  if (act === 'done') {
    await supabase.from('notes').update({ is_done: true, updated_at: now }).eq('id', id);
    return `✅ 完成：${note.content}`;
  }
  if (act === 'delnote') {
    await supabase.from('notes').delete().eq('id', id);
    return `🗑 已刪除：${note.content}`;
  }
  if (act === 'snooze') {
    const due = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await supabase.from('notes').update({ due_date: due, is_reminded: false, updated_at: now }).eq('id', id);
    return `⏰ 好，1 小時後（${formatTaipeiDate(due)}）再提醒你：${note.content}`;
  }
  if (act === 'tomorrow') {
    const base = note.due_date ? new Date(note.due_date) : new Date();
    const due = new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('notes').update({ due_date: due, is_reminded: false, updated_at: now }).eq('id', id);
    return `📅 已改到明天這個時間：${note.content}\n⏰ ${formatTaipeiDate(due)}`;
  }
  return null;
}

// 處理圖片擷取結果：建立提醒並回覆
async function handleImageEvents(ex) {
  if (!ex || !ex.found || !Array.isArray(ex.items) || ex.items.length === 0) {
    return ex && ex.note
      ? `🖼 ${ex.note}\n要記什麼直接打字告訴我就好～`
      : '🖼 我看了圖片，但沒讀到明確的時間/活動。直接打字告訴我吧～';
  }
  const created = [];
  for (const it of ex.items) {
    if (!it || !it.content) continue;
    const { data } = await supabase.from('notes').insert({
      raw_text: '[圖片]',
      type: 'reminder',
      content: it.content,
      due_date: it.due_date || null,
      is_reminded: false,
      is_done: false,
    }).select().single();
    created.push(data || it);
  }
  if (created.length === 0) return '🖼 沒能建立提醒，再試一次或直接打字告訴我。';

  const lines = [`📸 從圖片幫你建立了 ${created.length} 個提醒：`];
  created.forEach(c => {
    lines.push(`• ${c.content}${c.due_date ? `（${formatTaipeiDate(c.due_date)}）` : '（沒抓到時間，回我時間就補上）'}`);
  });
  return lines.join('\n');
}

// 每日早安簡報：今日任務 + 逾期未完成 + 今日服事（若有）
// 早安簡報：Flex 清單版，提醒/待辦/逾期都可以直接點✅完成，不用再自己爬文字
async function handleMorning(opts = {}) {
  const header = opts.header || '☀️ 早安！新的一天開始了';
  const altPrefix = opts.altPrefix || '☀️ 早安簡報';
  const { y, mo, d } = nowTaipeiParts();
  const startOfDay = taipeiToISO(y, mo, d, 0, 0);
  const endOfDay = taipeiToISO(y, mo, d, 23, 59);
  const dateStr = new Date(startOfDay).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });

  const { data: reminders } = await supabase.from('notes').select('*')
    .eq('type', 'reminder').eq('is_done', false)
    .gte('due_date', startOfDay).lte('due_date', endOfDay).order('due_date');
  const { data: tasks } = await supabase.from('notes').select('*')
    .eq('type', 'task').eq('is_done', false).order('created_at');
  const { data: overdue } = await supabase.from('notes').select('*')
    .in('type', ['reminder', 'task']).eq('is_done', false)
    .not('due_date', 'is', null).lt('due_date', startOfDay).order('due_date');

  const contents = [
    { type: 'text', text: header, weight: 'bold', size: 'lg' },
    { type: 'text', text: dateStr, size: 'sm', color: '#8e8e93' },
  ];

  const addSection = (label, items, limit) => {
    if (!items || items.length === 0) return;
    contents.push({ type: 'separator', margin: 'md' });
    contents.push({ type: 'text', text: `${label}（${items.length}）`, weight: 'bold', size: 'md', margin: 'md' });
    contents.push(...todoActionRows(items, limit));
    if (items.length > limit) {
      contents.push({ type: 'text', text: `…還有 ${items.length - limit} 筆，打「待辦」看全部`, size: 'xs', color: '#8e8e93' });
    }
  };

  addSection('🔴 今天提醒', reminders, 8);
  addSection('🟡 待辦', tasks, 8);
  addSection('⚠️ 逾期未完成', overdue, 8);

  if ((!reminders || reminders.length === 0) && (!tasks || tasks.length === 0) && (!overdue || overdue.length === 0)) {
    contents.push({ type: 'text', text: '今日沒有待辦事項 🎉', margin: 'md' });
  }

  let worship = '';
  try {
    const w = await getScheduleByDate(`${mo + 1}/${d}`);
    if (w && !w.startsWith('找不到') && !w.startsWith('日期格式')) worship = w;
  } catch (e) { /* ignore */ }
  if (worship) {
    contents.push({ type: 'separator', margin: 'md' });
    contents.push({ type: 'text', text: worship, size: 'sm', wrap: true, margin: 'md' });
  }

  return {
    type: 'flex',
    altText: `${altPrefix}（${dateStr}）`,
    contents: {
      type: 'bubble', size: 'mega',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents },
    },
  };
}

module.exports = { dispatch, buildReminderFlex, handlePostback, handleImageEvents, handleMorning, nextRecurDue };

// 純函式（不碰資料庫），額外匯出給測試用，不影響上面主要的對外介面
module.exports._test = {
  parseDueDate,
  extractLeadMinutes,
  leadLabel,
  taipeiKey,
  parseSongEntry,
  extractSongCandidates,
  titleAppearsInContent,
  findTypoCommand,
  parseRecur,
  nextRecurDue,
  recurLabel,
  splitEditCommand,
  extractActionItems,
  guessSkipReason,
  truncateLabel,
  isBulkSchedule,
  parseBulkSchedule,
};
