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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!authCheck(req, res)) return;

  const { resource } = req.query; // 'dates' or 'roles'

  if (req.method === 'GET') {
    if (resource === 'dates') {
      const { data, error } = await supabase
        .from('worship_dates').select('*').order('service_date');
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    if (resource === 'roles') {
      const { data, error } = await supabase
        .from('worship_roles').select('*').order('sort_order');
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    return res.status(400).json({ error: 'resource must be dates or roles' });
  }

  if (req.method === 'POST') {
    if (resource === 'dates') {
      const { service_date } = req.body;
      if (!service_date) return res.status(400).json({ error: 'service_date required' });
      const { data, error } = await supabase
        .from('worship_dates').insert({ service_date }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    if (resource === 'roles') {
      const { role_name } = req.body;
      if (!role_name) return res.status(400).json({ error: 'role_name required' });
      // Assign sort_order = max + 1
      const { data: existing } = await supabase
        .from('worship_roles').select('sort_order').order('sort_order', { ascending: false }).limit(1);
      const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;
      const { data, error } = await supabase
        .from('worship_roles').insert({ role_name, sort_order: nextOrder }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }
    return res.status(400).json({ error: 'resource must be dates or roles' });
  }

  if (req.method === 'DELETE') {
    if (resource === 'dates') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('worship_dates').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    if (resource === 'roles') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('worship_roles').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'resource must be dates or roles' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
