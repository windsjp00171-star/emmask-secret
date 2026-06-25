const supabase = require('./supabase');

const ROLE_ORDER = ['信息','領會','助唱','鍵盤','吉他','貝斯','鼓','音控','PPT','導播後製','攝影','兒主破冰敬拜','兒主信息活動','第一堂內場招待','第一堂服務台','第二堂內場招待','第二堂服務台','備註','VIP新人服事','教會禱告會'];

function parseDate(str) {
  const m = str.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  const month = parseInt(m[1], 10), day = parseInt(m[2], 10);
  const now = new Date();
  let year = now.getFullYear();
  const d = new Date(year, month - 1, day);
  if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year++;
  return { iso: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`, month, day };
}

async function getScheduleByDate(dateStr) {
  const parsed = parseDate(dateStr);
  if (!parsed) return '日期格式不對，請用 7/5 這樣的格式。';

  const { data } = await supabase
    .from('worship_schedule')
    .select('*')
    .eq('service_date', parsed.iso)
    .order('role');

  if (!data || data.length === 0) return `找不到 ${parsed.month}/${parsed.day} 的服事表，可能尚未排定。`;

  const byRole = {};
  data.forEach(item => {
    if (!byRole[item.role]) byRole[item.role] = [];
    byRole[item.role].push(item.person_name);
  });

  const d = new Date(parsed.iso + 'T00:00:00+08:00');
  const weekday = d.toLocaleDateString('zh-TW', { weekday: 'short', timeZone: 'Asia/Taipei' });
  const lines = [`⛪ ${parsed.month}/${parsed.day}（${weekday}）服事名單`];

  ROLE_ORDER.forEach(role => {
    if (byRole[role]) lines.push(`${role}：${byRole[role].join('、')}`);
  });

  // Any roles not in ROLE_ORDER
  Object.keys(byRole).forEach(role => {
    if (!ROLE_ORDER.includes(role)) lines.push(`${role}：${byRole[role].join('、')}`);
  });

  return lines.join('\n');
}

async function getMySchedule(myName, weeksAhead = 5) {
  if (!myName) return '請在 Vercel 設定 WORSHIP_MY_NAME 環境變數（你在服事表裡的名字）。';

  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];
  const futureIso = new Date(now.getTime() + weeksAhead * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data } = await supabase
    .from('worship_schedule')
    .select('*')
    .eq('person_name', myName)
    .gte('service_date', todayIso)
    .lte('service_date', futureIso)
    .order('service_date');

  if (!data || data.length === 0) return `接下來 ${weeksAhead} 週沒有找到 ${myName} 的服事。`;

  const byDate = {};
  data.forEach(item => {
    if (!byDate[item.service_date]) byDate[item.service_date] = [];
    byDate[item.service_date].push(item.role);
  });

  const lines = [`⛪ ${myName} 近期服事（${weeksAhead}週）`];
  Object.entries(byDate).sort().forEach(([date, roles]) => {
    const d = new Date(date + 'T00:00:00+08:00');
    const label = d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Taipei' });
    lines.push(`\n📅 ${label}`);
    roles.forEach(r => lines.push(`• ${r}`));
  });

  return lines.join('\n');
}

// 整月服事日期（如「8月服事表」）
async function getMonthSchedule(monthNum) {
  const month = parseInt(monthNum, 10);
  if (!month || month < 1 || month > 12) return '請用「8月服事表」這種格式。';
  const year = new Date().getFullYear();
  const pad = n => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const endY = month === 12 ? year + 1 : year;
  const endM = month === 12 ? 1 : month + 1;
  const end = `${endY}-${pad(endM)}-01`;

  const { data } = await supabase
    .from('worship_schedule')
    .select('service_date')
    .gte('service_date', start)
    .lt('service_date', end)
    .order('service_date');

  if (!data || data.length === 0) return `${month} 月還沒有排定服事表。`;

  const dates = [...new Set(data.map(d => d.service_date))];
  const lines = [`⛪ ${month} 月服事日期`];
  dates.forEach(d => {
    const dt = new Date(d + 'T00:00:00+08:00');
    const md = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' });
    const wd = dt.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'short' });
    lines.push(`• ${md}（${wd}）`);
  });
  const first = new Date(dates[0] + 'T00:00:00+08:00');
  lines.push(`\n輸入「服事表 ${month}/${first.getDate()}」看當天完整名單`);
  return lines.join('\n');
}

module.exports = { getScheduleByDate, getMySchedule, getMonthSchedule };
