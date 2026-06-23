const supabase = require('./supabase');
const { classify } = require('./classifier');
const { getWeeklyActivity } = require('./github');
const { getScheduleByDate, getMySchedule } = require('./worship');

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

  const { data, error } = await supabase.from('notes').insert({
    raw_text: text,
    type: classified.type,
    project: classified.project || null,
    content: classified.content,
    due_date: classified.due_date || null,
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
  const { data } = await supabase
    .from('notes')
    .select('*')
    .eq('type', 'note')
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) return '目前沒有筆記。';

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

function handleHelp() {
  return [
    '📖 EmmArk 小秘書 指令說明',
    '',
    '直接輸入任何句子 → AI 分類並記錄',
    '傳圖片 → 自動辨識海報/通知上的活動時間，建立提醒',
    '',
    '快速記錄（不繞 AI）：',
    '筆記 {內容} → 直接存筆記',
    '待辦 {內容} → 直接存待辦',
    '提醒 {內容+時間} → 直接存提醒，自動解析時間',
    '',
    '今天 → 今日任務清單',
    '本週 → 本週清單',
    '日曆 → 萬年曆（本月＋下月格狀）',
    '筆記 → 最近 10 筆筆記',
    '專案 → 各專案最新進度',
    '完成 {關鍵字} → 標記完成',
    '刪除 {關鍵字} → 刪除事項',
    '幫助 → 顯示此說明',
  ].join('\n');
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

// 判斷整句是否「幾乎只是一個時間/日期」（用來判定是不是在回答「什麼時候？」）
function isPureTimeAnswer(text) {
  const s = text
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
  const row = { raw_text: content, type, project: null, content, due_date: null };
  let askTime = false;
  if (type === 'reminder') {
    const due = parseDueDate(content);
    if (due) row.due_date = due;
    else askTime = true;
  }

  const { data, error } = await supabase.from('notes').insert(row).select().single();
  if (error) throw new Error(`Supabase insert error: ${error.message}`);

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
function buildMonthBubble(year, moZeroBased, byDay, todayKey) {
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
    let numColor = '#1d1d1f';
    if (reminders && tasks) numColor = '#5856d6';
    else if (reminders) numColor = '#ff3b30';
    else if (tasks) numColor = '#ff9500';
    const hasEvent = items.length > 0;
    return {
      type: 'box', layout: 'vertical', flex: 1, height: '44px',
      justifyContent: 'center', alignItems: 'center',
      cornerRadius: isToday ? '6px' : undefined,
      backgroundColor: isToday ? '#007aff' : undefined,
      contents: [
        { type: 'text', text: String(d), size: 'sm', align: 'center', gravity: 'center',
          weight: hasEvent ? 'bold' : 'regular', color: isToday ? '#ffffff' : numColor },
        { type: 'text', text: hasEvent ? '•' : ' ', size: 'xxs', align: 'center',
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
  if (eventLines.length === 0) eventLines.push({ type: 'text', text: '本月沒有排程 🎉', size: 'xs', color: '#8e8e93' });

  return {
    type: 'bubble', size: 'mega',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px',
      contents: [
        { type: 'text', text: `📅 ${year} 年 ${moZeroBased + 1} 月`, weight: 'bold', size: 'lg' },
        wdRow,
        ...weekRows,
        { type: 'separator', margin: 'md' },
        ...eventLines,
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

  const tKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  const nextY = mo === 11 ? y + 1 : y;
  const nextMo = (mo + 1) % 12;

  return {
    type: 'flex',
    altText: `📅 ${y}年${mo + 1}月 行事曆（${(data || []).length} 項排程）`,
    contents: {
      type: 'carousel',
      contents: [
        buildMonthBubble(y, mo, byDay, tKey),
        buildMonthBubble(nextY, nextMo, byDay, tKey),
      ],
    },
  };
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

  if (isBulkSchedule(trimmed)) return handleBulkSchedule(trimmed);

  return handleSave(trimmed);
}

// 提醒到點時用的 Flex 卡片（含 完成／延後／改明天 按鈕）
function buildReminderFlex(note) {
  const time = formatTaipeiDate(note.due_date);
  return {
    type: 'flex',
    altText: `⏰ 提醒：${note.content}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
        contents: [
          { type: 'text', text: '⏰ 提醒到了！', weight: 'bold', size: 'lg', color: '#ff3b30' },
          { type: 'text', text: note.content, size: 'md', wrap: true },
          ...(note.project ? [{ type: 'text', text: `🗂 ${note.project}`, size: 'sm', color: '#8e8e93' }] : []),
          ...(time ? [{ type: 'text', text: `🕐 ${time}`, size: 'sm', color: '#8e8e93' }] : []),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          { type: 'button', style: 'primary', color: '#34c759', height: 'sm',
            action: { type: 'postback', label: '✅ 完成', data: `act=done&id=${note.id}`, displayText: '完成 ✅' } },
          { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
            { type: 'button', style: 'secondary', height: 'sm',
              action: { type: 'postback', label: '⏰ 延後1hr', data: `act=snooze&id=${note.id}`, displayText: '延後一小時 ⏰' } },
            { type: 'button', style: 'secondary', height: 'sm',
              action: { type: 'postback', label: '📅 明天', data: `act=tomorrow&id=${note.id}`, displayText: '改到明天 📅' } },
          ] },
        ],
      },
    },
  };
}

// 處理 Flex 按鈕（postback）：完成 / 延後 / 改明天
async function handlePostback(dataStr) {
  const p = new URLSearchParams(dataStr || '');
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

module.exports = { dispatch, buildReminderFlex, handlePostback, handleImageEvents, handleMorning };
