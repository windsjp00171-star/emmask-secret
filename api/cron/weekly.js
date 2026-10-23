const supabase = require('../../lib/supabase');
const { pushMessage } = require('../../lib/line');
const { getWeeklyActivity } = require('../../lib/github');
const { cronAuth } = require('../../lib/cron-auth');
const { loadModules, isOn } = require('../../lib/modules');
const { writeSummary } = require('../../lib/summarize');
const cards = require('../../lib/cards');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!cronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  await loadModules();
  if (!isOn('weekly')) return res.status(200).json({ ok: true, skipped: '週報沒有開啟' });

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

    // 專案進度（停滯專案、各專案本週更新、GitHub 動態）只有「專案進度」模組開著才放進週報
    const projectsOn = isOn('projects');

    // Stalled projects (no update in 7 days)
    const { data: recentUpdates } = projectsOn ? await supabase
      .from('notes')
      .select('project')
      .eq('type', 'project_update')
      .not('project', 'is', null)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) : { data: [] };

    const activeProjects = new Set((recentUpdates || []).map(r => r.project));
    const { data: allProjects } = projectsOn ? await supabase
      .from('notes')
      .select('project')
      .eq('type', 'project_update')
      .not('project', 'is', null) : { data: [] };

    const knownProjects = [...new Set((allProjects || []).map(r => r.project))];
    const stalledProjects = knownProjects.filter(p => !activeProjects.has(p));

    if (stalledProjects.length > 0) {
      lines.push(`⚠️ 停滯超過 7 天：${stalledProjects.join('、')}`);
    }

    // Per-project summary this week
    if (projectsOn && allUpdates && allUpdates.length > 0) {
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
    const ghActivity = projectsOn ? await getWeeklyActivity(7) : [];
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
    if (summary) {
      lines.splice(1, 0, '', summary);

      // 週報存檔。這段是「那一週當下的樣子」的快照 —— 底層資料之後會變
      // （待辦被打勾、筆記被編輯或刪除），晚幾個月再叫 AI 總結同一週，
      // 看到的資料已經不一樣了，生不出同一份回顧。一年 52 筆而已。
      await supabase.from('notes').insert({
        raw_text: `[週報] ${weekStr}`,
        type: 'note',
        project: '週報',
        content: `${weekStr}\n${summary}`,
        meta: {
          week: weekStr,
          done_count: done ? done.length : 0,
          pending_count: pending ? pending.length : 0,
          stalled_projects: stalledProjects,
        },
        is_reminded: true,
        is_done: false,
      });
    }

    const doneN = done ? done.length : 0;
    const pendN = pending ? pending.length : 0;
    const cover = cards.bubble({
      body: [
        cards.poster({ kicker: `📊 本週週報 ${weekStr}`, big: doneN, bigSuffix: '件完成', sub: `待辦積壓 ${pendN} 件${stalledProjects.length ? `　⚠️ 停滯：${stalledProjects.join('、')}` : ''}`, pose: 'thumbs' }),
        ...(summary ? [{ type: 'text', text: summary, size: 'sm', wrap: true, color: '#3a3a3c', margin: 'md' }] : []),
        cards.brandLine('週報'),
      ],
      footer: [cards.shareButton(lines.join('\n'), '📤 分享週報')],
    });
    const detail = lines.slice(lines.findIndex(l => l.startsWith('【') || l.startsWith('📦')) >= 0 ? lines.findIndex(l => l.startsWith('【') || l.startsWith('📦')) : lines.length);
    const detailPage = detail.length ? cards.bubble({ body: [cards.tagChip('專案與動態', 'note'), { type: 'text', text: detail.join('\n').trim().slice(0, 1800), size: 'sm', wrap: true, margin: 'md' }] }) : null;
    await pushMessage(cards.flex(`📊 本週週報（${weekStr}）：完成 ${doneN} 件`, [cover, detailPage]));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Weekly cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
