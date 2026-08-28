// 後台「相簿」：列出所有有圖的記錄，並簽出短效網址讓前端顯示。
// bucket 是私有的，所以圖片網址不能直接組，一定要經過這裡簽。
const supabase = require('../../lib/supabase');
const { getSignedUrl, deleteImage } = require('../../lib/storage');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!authCheck(req, res)) return;

  if (req.method === 'GET') {
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const offset = Number(req.query.offset) || 0;

    // meta->>image_path 有值的就是有圖的記錄
    const { data, error } = await supabase
      .from('notes')
      .select('id, type, project, content, created_at, meta')
      .not('meta->>image_path', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    const items = await Promise.all(
      (data || []).map(async (n) => ({
        id: n.id,
        type: n.type,
        project: n.project,
        content: n.content,
        created_at: n.created_at,
        url: await getSignedUrl(n.meta && n.meta.image_path),
      }))
    );

    return res.status(200).json({ items });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const { data: note } = await supabase.from('notes').select('id, meta').eq('id', id).maybeSingle();
    if (!note) return res.status(404).json({ error: 'not found' });

    // 先刪檔案再刪記錄。順序反過來的話，記錄沒了就找不到檔案路徑，
    // 檔案會永遠留在 storage 佔空間。
    if (note.meta && note.meta.image_path) await deleteImage(note.meta.image_path);

    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
