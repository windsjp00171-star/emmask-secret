const supabase = require('../../lib/supabase');

function authCheck(req, res) {
  const token = req.query.token || req.headers['x-dashboard-token'];
  if (token !== process.env.DASHBOARD_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!authCheck(req, res)) return;

  if (req.method === 'GET') {
    const { type, project, is_done, limit = 100 } = req.query;
    let query = supabase.from('notes').select('*').order('created_at', { ascending: false }).limit(Number(limit));
    if (type) query = query.eq('type', type);
    if (project) query = query.eq('project', project);
    if (is_done !== undefined) query = query.eq('is_done', is_done === 'true');

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { type, project, content, due_date } = req.body;
    if (!type || !content) return res.status(400).json({ error: 'type and content required' });
    const { data, error } = await supabase.from('notes').insert({
      raw_text: content,
      type,
      project: project || null,
      content,
      due_date: due_date || null,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const { id, is_done, content, type, project, due_date, remind_lead_minutes } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const updates = { updated_at: new Date().toISOString() };
    if (is_done !== undefined) updates.is_done = is_done;
    if (content !== undefined) { updates.content = content; updates.raw_text = content; }
    if (type !== undefined) updates.type = type;
    if (project !== undefined) updates.project = project || null;
    if (due_date !== undefined) updates.due_date = due_date || null;
    if (remind_lead_minutes !== undefined) updates.remind_lead_minutes = remind_lead_minutes === null ? null : Number(remind_lead_minutes);
    const { data, error } = await supabase.from('notes').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || { ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
