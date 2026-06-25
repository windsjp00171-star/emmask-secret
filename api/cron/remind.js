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
    // 提前提醒：到點前 N 分鐘就發（預設 5 分鐘），避免當下才通知來不及
    const leadMin = parseInt(process.env.REMIND_LEAD_MINUTES || '5', 10);
    const threshold = new Date(Date.now() + leadMin * 60 * 1000).toISOString();

    const { data: dueNotes, error } = await supabase
      .from('notes')
      .select('*')
      .in('type', ['reminder', 'task'])
      .lte('due_date', threshold)
      .not('is_reminded', 'is', true)
      .not('is_done', 'is', true)
      .not('due_date', 'is', null);

    if (error) throw new Error(`Supabase query error: ${error.message}`);

    if (!dueNotes || dueNotes.length === 0) {
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
