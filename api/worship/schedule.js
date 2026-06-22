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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!authCheck(req, res)) return;

  if (req.method === 'GET') {
    let query = supabase.from('worship_schedule').select('*').order('service_date').order('role');
    if (req.query.date) query = query.eq('service_date', req.query.date);
    if (req.query.person) query = query.eq('person_name', req.query.person);
    if (req.query.from) query = query.gte('service_date', req.query.from);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { service_date, role, person_name, notes } = req.body;
    if (!service_date || !role || !person_name) return res.status(400).json({ error: 'service_date, role, person_name required' });
    const { data, error } = await supabase.from('worship_schedule')
      .insert({ service_date, role, person_name, notes: notes || null })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const { id, person_name, notes } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('worship_schedule')
      .update({ person_name, notes, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('worship_schedule').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
