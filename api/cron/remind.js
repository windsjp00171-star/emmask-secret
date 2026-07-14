const supabase = require('../../lib/supabase');
const { pushMessage } = require('../../lib/line');
const { buildReminderFlex, nextRecurDue } = require('../../lib/commands');
const { cronAuth } = require('../../lib/cron-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!cronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 提前提醒：到點前 N 分鐘就發。每則可各自設定 remind_lead_minutes，
    // 沒設定的用系統預設（REMIND_LEAD_MINUTES，預設 5 分鐘）
    const defaultLeadMin = parseInt(process.env.REMIND_LEAD_MINUTES || '5', 10);
    // 用可能出現的最大提前量抓出候選（上限抓 7 天，涵蓋「提前N天」的用法）
    const MAX_LEAD_MIN = 7 * 24 * 60;
    const threshold = new Date(Date.now() + MAX_LEAD_MIN * 60 * 1000).toISOString();

    const { data: candidates, error } = await supabase
      .from('notes')
      .select('*')
      .in('type', ['reminder', 'task'])
      .lte('due_date', threshold)
      .not('is_reminded', 'is', true)
      .not('is_done', 'is', true)
      .not('due_date', 'is', null);

    if (error) throw new Error(`Supabase query error: ${error.message}`);

    const now = Date.now();
    const dueNotes = (candidates || []).filter((note) => {
      const leadMin = note.remind_lead_minutes != null ? note.remind_lead_minutes : defaultLeadMin;
      return new Date(note.due_date).getTime() - leadMin * 60 * 1000 <= now;
    });

    if (dueNotes.length === 0) {
      return res.status(200).json({ reminded: 0 });
    }

    for (const note of dueNotes) {
      await pushMessage(buildReminderFlex(note));
      if (note.recur) {
        // 重複提醒：排下一次、保持未提醒狀態
        const next = nextRecurDue(note.recur, note.due_date);
        await supabase.from('notes').update({ due_date: next, is_reminded: false }).eq('id', note.id);
      } else {
        await supabase.from('notes').update({ is_reminded: true }).eq('id', note.id);
      }
    }

    return res.status(200).json({ reminded: dueNotes.length });
  } catch (err) {
    console.error('Cron remind error:', err);
    return res.status(500).json({ error: err.message });
  }
};
