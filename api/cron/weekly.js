const supabase = require('../../lib/supabase');
const { pushMessage } = require('../../lib/line');
const { getWeeklyActivity } = require('../../lib/github');
const { cronAuth } = require('../../lib/cron-auth');
const { writeSummary } = require('../../lib/summarize');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!cronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const now = new Date();
    const taipeiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));

    const startOfWeek = new Date(taipeiNow);
    startOfWeek.setDate(taipeiNow.getDate() - taipeiNow.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const weekStr = `${startOfWeek.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' })} - ${endOfWeek.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit' })}`;

    const { data: done } = await supabase
      .from('notes')
      .select('*')
      .eq('is_done', true)
      .gte('updated_at', startOfWeek.toISOString())
      .lte('updated_at', endOfWeek.toISOString());

    const { data: pending } = await supabase
      .from('notes')
      .select('*')
      .eq('is_done', false)
      .in('type', ['task', 'reminder']);

    const { data: allUpdates } = await supabase
      .from('notes')
      .select('*')
      .eq('type', 'project_update')
      .gte('created_at', startOfWeek.toISOString());

    const lines = [`📊 本週週報（${weekStr}）`, ''];
    lines.push(`✅ 完成了 ${done ? done.length : 0} 件事`);
    lines.push(`📌 待辦積壓：${pending ? pending.length : 0} 件`);

    // Stalled projects (no update in 7 days)
    const { data: recentUpdates } = await supabase
      .from('notes')
      .select('project')
      .eq('type', 'project_update')
      .not('project', 'is', null)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const activeProjects = new Set((recentUpdates || []).map(r => r.project));
    const { data: allProjects } = await supabase
      .from('notes')
      .select('project')
      .eq('type', 'project_update')
      .not('project', 'is', null);

    const knownProjects = [...new Set((allProjects || []).map(r => r.project))];
    const stalledProjects = knownProjects.filter(p => !activeProjects.has(p));

    if (stalledProjects.length > 0) {
      lines.push(`⚠️ 停滯超過 7 天：${stalledProjects.join('、')}`);
    }

    // Per-project summary this week
    if (allUpdates && allUpdates.length > 0) {
      const byProject = {};
      allUpdates.forEach(item => {
        if (!byProject[item.project]) byProject[item.project] = [];
        byProject[item.project].push(item.content);
      });

      lines.push('');
      Object.entries(byProject).forEach(([project, updates]) => {
        lines.push(`【${project}】`);
        updates.slice(0, 3).forEach(u => lines.push(`• ${u}`));
      });
    }

    // GitHub weekly activity
    const ghActivity = await getWeeklyActivity(7);
    if (ghActivity && ghActivity.length > 0) {
      lines.push('\n📦 GitHub 本週動態');
      ghActivity.forEach(repo => {
        lines.push(`• ${repo.name}（${repo.count} commits）`);
        lines.push(`  └ ${repo.latest}`);
      });
    }

    // AI 寫的一段回顧，放在最前面當開場。失敗就回 null，週報照常送出。
    const summary = await writeSummary('week', {
      weekStr,
      doneCount: done ? done.length : 0,
      pendingCount: pending ? pending.length : 0,
      done: (done || []).map(r => r.content),
      updates: (allUpdates || []).map(r => (r.project ? `[${r.project}] ${r.content}` : r.content)),
      stalledProjects,
    });
    if (summary) lines.splice(1, 0, '', summary);

    await pushMessage(lines.join('\n'));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Weekly cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
