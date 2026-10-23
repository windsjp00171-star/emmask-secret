// 備份與交接：一鍵匯出全部資料（JSON／CSV），以及不需要伺服器、不需要帳號、
// 雙擊就能看的離線閱讀檔（HTML）。接手的人不會寫程式也能看到所有資料。
const supabase = require('./supabase');

const TABLES = ['notes', 'worship_dates', 'worship_roles', 'worship_schedule'];
const PAGE = 1000;
const MAX_ROWS = 50000;

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) {
      // 還沒建的表（例如沒用服事表）就當作空的，不要讓整份備份失敗
      if (/does not exist|schema cache|relation/i.test(error.message || '')) return rows;
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function collect() {
  const tables = {};
  for (const t of TABLES) tables[t] = await fetchAll(t);
  return { exported_at: new Date().toISOString(), tables };
}

function csvCell(v) {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 加 BOM，Excel 直接開才不會中文變亂碼
function toCsv(rows) {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => csvCell(r[c])).join(','));
  return '﻿' + lines.join('\r\n');
}

// 資料塞進 <script type="application/json">，要避開 </script> 和 <!-- 把頁面截斷
function safeJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function readerHtml(backup) {
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>小秘書資料備份（離線閱讀）</title>
<style>
body{font-family:system-ui,-apple-system,"Noto Sans TC","Microsoft JhengHei",sans-serif;margin:0;background:#f1f6f3;color:#1b2420;line-height:1.6}
header{background:#16513d;color:#fff;padding:16px 20px}header h1{margin:0;font-size:20px}header p{margin:4px 0 0;font-size:14px;opacity:.85}
main{max-width:900px;margin:0 auto;padding:16px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
input,select{font-size:16px;padding:10px;border:1px solid #c9d6cf;border-radius:8px;background:#fff}input{flex:1;min-width:200px}
.item{background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.tag{display:inline-block;font-size:12px;font-weight:bold;background:#e2f6e9;color:#04833a;border-radius:10px;padding:2px 8px;margin-right:6px}
.meta{font-size:13px;color:#6b7a72;margin-top:4px}.done{opacity:.55}
table{border-collapse:collapse;width:100%;background:#fff;font-size:14px}td,th{border:1px solid #dfe8e3;padding:6px 8px;text-align:left;vertical-align:top}
#count{font-size:14px;color:#6b7a72;margin:0 0 8px}
</style></head><body>
<header><h1>小秘書資料備份</h1><p>匯出時間：<span id="when"></span>　不需要網路，也不需要帳號。</p></header>
<main>
<div class="bar"><select id="table"></select><input id="q" placeholder="輸入關鍵字搜尋" type="search"><select id="type"><option value="">全部類型</option></select></div>
<p id="count"></p><div id="out"></div>
</main>
<script id="data" type="application/json">${safeJson(backup)}</script>
<script>
var B=JSON.parse(document.getElementById('data').textContent);
var LABEL={task:'待辦',reminder:'提醒',note:'筆記',project_update:'專案更新'};
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function fmt(d){if(!d)return '';var t=new Date(d);return isNaN(t)?d:t.toLocaleString('zh-TW',{hour12:false})}
var tableSel=document.getElementById('table'),q=document.getElementById('q'),typeSel=document.getElementById('type');
document.getElementById('when').textContent=fmt(B.exported_at);
Object.keys(B.tables).forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=(t==='notes'?'筆記／待辦／提醒':t)+'（'+B.tables[t].length+'）';tableSel.appendChild(o)});
function types(){var s={};B.tables.notes.forEach(function(n){s[n.type]=1});typeSel.innerHTML='<option value="">全部類型</option>'+Object.keys(s).map(function(t){return '<option value="'+esc(t)+'">'+esc(LABEL[t]||t)+'</option>'}).join('')}
types();
function render(){
  var t=tableSel.value,kw=q.value.trim().toLowerCase(),rows=B.tables[t];
  typeSel.style.display=t==='notes'?'':'none';
  rows=rows.filter(function(r){return (!kw||JSON.stringify(r).toLowerCase().indexOf(kw)>=0)&&(t!=='notes'||!typeSel.value||r.type===typeSel.value)});
  if(t==='notes')rows=rows.slice().sort(function(a,b){return String(b.created_at).localeCompare(String(a.created_at))});
  document.getElementById('count').textContent='共 '+rows.length+' 筆';
  var out=document.getElementById('out');
  if(t==='notes'){out.innerHTML=rows.map(function(n){return '<div class="item'+(n.is_done?' done':'')+'"><span class="tag">'+esc(LABEL[n.type]||n.type)+'</span>'+(n.is_done?'✅ ':'')+esc(n.content)+'<div class="meta">'+[n.project?'專案：'+esc(n.project):'',n.due_date?'時間：'+fmt(n.due_date):'','建立：'+fmt(n.created_at)].filter(Boolean).join('　')+'</div></div>'}).join('');return}
  var cols={};rows.forEach(function(r){Object.keys(r).forEach(function(k){cols[k]=1})});cols=Object.keys(cols);
  out.innerHTML=rows.length?'<div style="overflow:auto"><table><tr>'+cols.map(function(c){return '<th>'+esc(c)+'</th>'}).join('')+'</tr>'+rows.map(function(r){return '<tr>'+cols.map(function(c){var v=r[c];return '<td>'+esc(v&&typeof v==='object'?JSON.stringify(v):v)+'</td>'}).join('')+'</tr>'}).join('')+'</table></div>':'';
}
tableSel.onchange=q.oninput=typeSel.onchange=render;render();
</script></body></html>`;
}

// format: json | csv | html。回傳 { filename, contentType, body }
async function buildExport(format) {
  const backup = await collect();
  const stamp = backup.exported_at.slice(0, 10);
  if (format === 'csv') return { filename: `小秘書備份-${stamp}.csv`, contentType: 'text/csv; charset=utf-8', body: toCsv(backup.tables.notes) };
  if (format === 'html') return { filename: `小秘書備份-${stamp}.html`, contentType: 'text/html; charset=utf-8', body: readerHtml(backup) };
  return { filename: `小秘書備份-${stamp}.json`, contentType: 'application/json; charset=utf-8', body: JSON.stringify(backup, null, 2) };
}

module.exports = { buildExport, _test: { toCsv, readerHtml, safeJson, csvCell } };
