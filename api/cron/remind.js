const supabase = require('../../lib/supabase');
const { pushMessage } = require('../../lib/line');
const { buildReminderFlex } = require('../../lib/commands');
const { cronAuth } = require('../../lib/cron-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!cronAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const now = new Date().toISOString();

    const { data: dueNotes, error } = await supabase
      .from('notes')
      .select('*')
      .lte('due_date', now)
      .eq('is_reminded', false)
      .eq('is_done', false);

    if (error) throw new Error(`Supabase query error: ${error.message}`);

    if (!dueNotes || dueNotes.length === 0) {
      return res.status(200).json({ reminded: 0 });
    }

    for (const note of dueNotes) {
      await pushMessage(buildReminderFlex(note));
      await supabase.from('notes').update({ is_reminded: true }).eq('id', note.id);
    }

    return res.status(200).json({ reminded: dueNotes.length });
  } catch (err) {
    console.error('Cron remind error:', err);
    return res.status(500).json({ error: err.message });
  }
};
