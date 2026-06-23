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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
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
    // 批次設定：一次匯入多格（每格先刪該日期+職位的舊資料再寫入，可重複貼上）
    if (Array.isArray(req.body.bulkSet)) {
      for (const c of req.body.bulkSet) {
        if (!c.service_date || !c.role) continue;
        const { error: delErr } = await supabase.from('worship_schedule')
          .delete().eq('service_date', c.service_date).eq('role', c.role);
        if (delErr) return res.status(500).json({ error: delErr.message });
        const rows = (c.names || []).filter(Boolean)
          .map(n => ({ service_date: c.service_date, role: c.role, person_name: n }));
        if (rows.length) {
          const { error: insErr } = await supabase.from('worship_schedule').insert(rows);
          if (insErr) return res.status(500).json({ error: insErr.message });
        }
      }
      const { data, error } = await supabase.from('worship_schedule').select('*').order('service_date').order('role');
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, all: data });
    }

    const { service_date, role, person_name, notes } = req.body;
    if (!service_date || !role || !person_name) return res.status(400).json({ error: 'service_date, role, person_name required' });
    const { data, error } = await supabase.from('worship_schedule')
      .insert({ service_date, role, person_name, notes: notes || null })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    // 整格設定：刪掉該日期+職位的所有人，再寫入新名單（行內編輯用）
    const { service_date, role, names } = req.body;
    if (!service_date || !role || !Array.isArray(names)) {
      return res.status(400).json({ error: 'service_date, role, names[] required' });
    }
    const { error: delErr } = await supabase.from('worship_schedule')
      .delete().eq('service_date', service_date).eq('role', role);
    if (delErr) return res.status(500).json({ error: delErr.message });

    const rows = names.filter(Boolean).map(n => ({ service_date, role, person_name: n }));
    let inserted = [];
    if (rows.length) {
      const { data, error } = await supabase.from('worship_schedule').insert(rows).select();
      if (error) return res.status(500).json({ error: error.message });
      inserted = data;
    }
    return res.status(200).json({ ok: true, rows: inserted });
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
