const supabase = require('../../lib/supabase');
const { pushMessage } = require('../../lib/line');
const { sendDueMonthlyReminders } = require('../../lib/monthly');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fire any monthly recurring reminders due today.
    const monthlyReminded = await sendDueMonthlyReminders(pushMessage);

    const now = new Date().toISOString();

    const { data: dueNotes, error } = await supabase
      .from('notes')
      .select('*')
      .lte('due_date', now)
      .eq('is_reminded', false)
      .eq('is_done', false);

    if (error) throw new Error(`Supabase query error: ${error.message}`);

    if (!dueNotes || dueNotes.length === 0) {
      return res.status(200).json({ reminded: 0, monthlyReminded });
    }

    for (const note of dueNotes) {
      const timeStr = new Date(note.due_date).toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const lines = [`⏰ 提醒到了！`, `📌 ${note.content}`];
      if (note.project) lines.push(`🗂 ${note.project}`);
      lines.push(`🕐 ${timeStr}`);

      await pushMessage(lines.join('\n'));
      await supabase.from('notes').update({ is_reminded: true }).eq('id', note.id);
    }

    return res.status(200).json({ reminded: dueNotes.length, monthlyReminded });
  } catch (err) {
    console.error('Cron remind error:', err);
    return res.status(500).json({ error: err.message });
  }
};
