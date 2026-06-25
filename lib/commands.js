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
  const parts = [`✅ ${typeLabel}已記錄`];
  if (note.project) parts.push(`🗂 ${note.project}`);
  if (note.due_date) parts.push(`⏰ ${formatTaipeiDate(note.due_date)}`);
  return parts.join('　');
}

async function handleSave(text) {
  const classified = await classify(text);

  // 安全網：自己再解析一次時間，AI 漏掉就補上（Haiku 對長句常誤判成筆記）
  const parsedDue = parseDueDate(text);
  if (parsedDue && !classified.due_date) {
    classified.due_date = parsedDue;
    if (classified.type === 'note' || !classified.type) classified.type = 'task';
    classified.reply = null; // 改用 buildSaveReply 顯示正確時間
  }

  const { data, error } = await supabase.from('notes').insert({
    raw_text: text,
    type: classified.type,
    project: classified.project || null,
    content: classified.content,
    due_date: classified.due_date || null,
    is_reminded: false,
  }).select().single();

  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return classified.reply || buildSaveReply(data);
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

const HELP_SECTIONS = {
  rec: [
    '📝 記錄／提醒',
    '・筆記 內容',
    '・待辦 內容',
    '・提醒 內容＋時間（自動解析）',
    '　時間：今天/明天/下週三/6/29/下午3點/晚上8點/3分鐘後/半小時後/2小時後/3天後',
    '',
    '🔁 重複提醒（響過自動排下次）',
    '・提醒 每天 早上8點 讀經',
    '・提醒 每週三 下午4點 全職同工會',
    '・提醒 每月 5號 繳房租',
    '',
    '📋 主題式（如特會，一次整批）',
    '・主題 名稱（換行）每行「日期 時間 行程」',
    '・看主題 名稱 ／ 刪主題 名稱',
  ].join('\n'),
  worship: [
    '⛪ 服事表',
    '・服事表 → 我的近期服事',
    '・服事表 7/6 → 當天整張班表',
    '・8月服事表 → 我 8 月的服事',
    '',
    '🎵 敬拜順序',
    '・寫順序 [日期] 內容（不填＝下個主日）',
    '・看順序 [日期]（不填＝最近那份）',
    '',
    '🎼 詩歌庫',
    '・存歌 歌名 調性 BPM 連結 段落',
    '・找歌 關鍵字 ／ 詩歌庫',
    '',
    '📑 順序範本',
    '・存範本 名稱（換行）流程',
    '・套範本 名稱 [日期] → 生成當天順序',
    '・範本 → 列出全部',
  ].join('\n'),
  query: [
    '📅 查詢',
    '・今天 ／ 本週',
    '・日曆 → 萬年曆（本月＋下月，含主日服事）',
    '・筆記 → 最近筆記 ／ 專案 → 各專案進度',
    '',
    '✅ 管理',
    '・完成 關鍵字 ／ 刪除 關鍵字',
    '・提醒到點會跳卡片：完成／延後1hr／改明天',
  ].join('\n'),
  tools: [
    '🔗 收藏 / 稍後讀',
    '・收藏 網址（或直接貼網址）',
    '・收藏清單 → 查看',
    '',
    '🔍 搜尋',
    '・搜尋 關鍵字 → 翻出所有相關記錄',
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

  const md = text.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/);
  if (md) {
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
  if (recur.startsWith('monthly:')) return `每月${recur.split(':')[1]}號`;
  return recur;
}

// 解析重複規則（每天 / 每週X / 每月N號）；回傳 { recur, due(首次) } 或 null
function parseRecur(text) {
  let code = null;
  const wk = text.match(/每\s*(?:週|周|星期|禮拜)\s*([日天一二三四五六])/);
  const moM = text.match(/每\s*(?:個)?\s*月\s*(\d{1,2})\s*[號日]/);
  if (/每天|每日/.test(text)) code = 'daily';
  else if (wk) code = `weekly:${WEEKDAY[wk[1]]}`;
  else if (moM) code = `monthly:${parseInt(moM[1], 10)}`;
  if (!code) return null;

  // 時間（時:分）：抓不到預設早上 9 點
  let hour = 9, minute = 0;
  const iso = parseDueDate(text);
  if (iso) { const tp = taipeiPartsOf(iso); hour = tp.hour; minute = tp.minute; }

  const { y, mo, d } = nowTaipeiParts();
  let due;
  if (code === 'daily') {
    due = taipeiToISO(y, mo, d, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = taipeiToISO(y, mo, d + 1, hour, minute);
  } else if (code.startsWith('weekly')) {
    due = iso || taipeiToISO(y, mo, d, hour, minute);
    if (new Date(due).getTime() <= Date.now()) due = nextRecurDue(code, due);
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
  if (recur.startsWith('monthly')) return taipeiToISO(p.y, p.mo + 1, +recur.split(':')[1], p.hour, p.minute);
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
const SYSTEM_PROJECTS = [ORDER_PROJECT, SONG_PROJECT, TEMPLATE_PROJECT, LINK_PROJECT];

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

async function saveOrder(dateISO, content) {
  const { error } = await supabase.from('notes').insert({
    raw_text: content, type: 'note', project: ORDER_PROJECT, content,
    due_date: dateISO, is_reminded: true, is_done: false,
  });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return `✅ 敬拜順序已記錄 ${fmtOrderDate(dateISO)}\n🎵\n${fmtOrder(content)}`;
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
  return `🎵 敬拜順序 ${fmtOrderDate(item.due_date)}\n${fmtOrder(item.content)}`;
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
  for (const it of items) {
    const due = parseDueDate(it);
    if (!due) { skipped.push(it); continue; }
    let content = it
      .replace(/^\s*\d{1,2}\s*[\/月]\s*\d{1,2}\s*日?\s*/, '')
      .replace(/^\s*(?:上午|下午|早上|晚上|中午|凌晨|清晨)?\s*\d{1,2}\s*[:：]\s*\d{2}\s*/, '')
      .replace(/^\s*(?:上午|下午|早上|晚上|中午|凌晨|清晨)?\s*\d{1,2}\s*點\s*(?:半|\d{1,2}\s*分?)?\s*/, '')
      .trim();
    if (!content) content = it;
    rows.push({ raw_text: it, type: 'reminder', project: theme, content, due_date: due, is_reminded: false, is_done: false });
  }
  if (rows.length === 0) return '每行請含日期與時間，例如「7/7 11:00 報到」。';

  const { error } = await supabase.from('notes').insert(rows);
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  let reply = `✅ 已建立主題「${theme}」共 ${rows.length} 則提醒，到時間會通知你。\n（看主題 ${theme}　可隨時叫出整份）`;
  if (skipped.length) reply += `\n⚠️ 略過 ${skipped.length} 行（沒抓到時間）：\n${skipped.join('\n')}`;
  return reply;
}

async function viewTheme(theme) {
  const { data } = await supabase.from('notes').select('*')
    .eq('project', theme).in('type', ['reminder', 'task']).eq('is_done', false)
    .order('due_date');
  if (!data || data.length === 0) return `找不到主題「${theme}」的提醒。`;
  const lines = [`📋 ${theme}（${data.length} 則）`];
  data.forEach(n => {
    const label = n.due_date
      ? new Date(n.due_date).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      : '無時間';
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
async function addSong(content) {
  const { error } = await supabase.from('notes').insert({
    raw_text: content, type: 'note', project: SONG_PROJECT, content, is_reminded: true, is_done: false,
  });
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return `🎼 已存入詩歌庫：\n${content}`;
}
async function findSong(kw) {
  const { data } = await supabase.from('notes').select('*')
    .eq('project', SONG_PROJECT).ilike('content', `%${kw}%`).order('created_at', { ascending: false }).limit(20);
  if (!data || data.length === 0) return `🎼 詩歌庫沒有「${kw}」。`;
  const lines = [`🎼 「${kw}」(${data.length})`];
  data.forEach((n, i) => lines.push(`${i + 1}. ${n.content}`));
  return lines.join('\n');
}
async function listSongs() {
  const { data } = await supabase.from('notes').select('*')
    .eq('project', SONG_PROJECT).order('created_at', { ascending: false }).limit(30);
  if (!data || data.length === 0) return '🎼 詩歌庫還是空的。\n新增：存歌 歌名 調性 BPM 連結 段落';
  const lines = [`🎼 詩歌庫（${data.length}）`];
  data.forEach((n, i) => lines.push(`${i + 1}. ${n.content}`));
  return lines.join('\n');
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
  const lines = ['📑 敬拜順序範本'];
  data.forEach((n, i) => lines.push(`${i + 1}. ${n.raw_text}`));
  lines.push('\n套用：套範本 範本名 [日期]');
  return lines.join('\n');
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

async function dispatch(text) {
  const trimmed = text.trim();

  if (trimmed === '今天') return handleToday();
  if (trimmed === '本週') return handleWeek();
  if (trimmed === '筆記') return handleNotes();
  if (trimmed === '專案') return handleProjects();
  if (trimmed === '日曆' || trimmed === '行事曆') return handleCalendar();
  if (HELP_TRIGGERS.includes(trimmed)) return handleHelp();
  if (trimmed.startsWith('完成')) return handleDone(trimmed.slice(2).trim());
  if (trimmed.startsWith('刪除')) return handleDelete(trimmed.slice(2).trim());

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

  // 主題式提醒（批次）
  const themeView = trimmed.match(/^看\s*(?:主題|特會)[\s:：]*([\s\S]+)$/);
  if (themeView) return viewTheme(themeView[1].trim());
  const themeDel = trimmed.match(/^刪(?:除)?\s*(?:主題|特會)[\s:：]*([\s\S]+)$/);
  if (themeDel) return deleteTheme(themeDel[1].trim());
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
  const help = p.get('help');
  if (help) return helpSection(help);
  const act = p.get('act');
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

// 每日早安簡報：今日任務 + 今日服事（若有）
async function handleMorning() {
  const todayText = await handleToday();
  const { mo, d } = nowTaipeiParts();
  let worship = '';
  try {
    const w = await getScheduleByDate(`${mo + 1}/${d}`);
    if (w && !w.startsWith('找不到') && !w.startsWith('日期格式')) worship = `\n\n${w}`;
  } catch (e) { /* ignore */ }
  return `☀️ 早安！新的一天開始了\n\n${todayText}${worship}`;
}

module.exports = { dispatch, buildReminderFlex, handlePostback, handleImageEvents, handleMorning, nextRecurDue };
