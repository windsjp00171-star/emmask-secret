const supabase = require('./supabase');

// 記錄某個排程工作剛剛執行過（供健康監控用）。失敗不影響呼叫端主流程。
async function recordHeartbeat(name) {
  try {
    await supabase.from('cron_heartbeats').upsert({ name, last_run_at: new Date().toISOString() });
  } catch (err) {
    console.error('recordHeartbeat error:', err);
  }
}

// 純邏輯：比對每個排程的最後執行時間是否超過容許的間隔
function computeStale(checks, rows) {
  const now = Date.now();
  const stale = [];
  for (const c of checks) {
    const row = (rows || []).find(r => r.name === c.name);
    const isStale = !row || now - new Date(row.last_run_at).getTime() > c.maxAgeMinutes * 60000;
    if (isStale) stale.push({ name: c.name, lastRunAt: row ? row.last_run_at : null });
  }
  return stale;
}

// 查詢並回傳目前逾期未執行的排程清單；查詢本身失敗時視為「沒有資料可判斷」，回傳空陣列不擋主流程
async function getStaleHeartbeats(checks) {
  try {
    const names = checks.map((c) => c.name);
    const { data, error } = await supabase.from('cron_heartbeats').select('*').in('name', names);
    if (error) throw error;
    return computeStale(checks, data);
  } catch (err) {
    console.error('getStaleHeartbeats error:', err);
    return [];
  }
}

module.exports = { recordHeartbeat, getStaleHeartbeats, _test: { computeStale } };
