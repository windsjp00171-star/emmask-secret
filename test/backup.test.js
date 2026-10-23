require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const rows = {
  notes: [
    { id: '1', type: 'task', content: '買牛奶, "全脂"\n兩瓶', created_at: '2026-10-23T00:00:00Z', is_done: false },
    { id: '2', type: 'note', content: '</script><b>x</b>', created_at: '2026-10-22T00:00:00Z', meta: { a: 1 } },
  ],
  worship_dates: [],
};
const supabasePath = require.resolve('../lib/supabase');
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    from(table) {
      return {
        select: () => ({
          range: async () => (rows[table] ? { data: rows[table], error: null } : { data: null, error: { message: 'relation does not exist' } }),
        }),
      };
    },
  },
};
const { buildExport, _test: { toCsv, readerHtml } } = require('../lib/backup');

test('CSV：有 BOM，逗號、引號、換行都正確跳脫，物件欄位轉成 JSON', () => {
  const csv = toCsv(rows.notes);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"買牛奶, ""全脂""\n兩瓶"'));
  assert.ok(csv.includes('"{""a"":1}"'));
});

test('離線閱讀檔：資料裡的 </script> 不會把頁面截斷', () => {
  const html = readerHtml({ exported_at: '2026-10-23T00:00:00Z', tables: { notes: rows.notes } });
  assert.equal(html.split('</script>').length, 3); // 資料區一個、程式區一個，加上結尾
  assert.ok(html.includes('\\u003c/script>'));
});

test('buildExport：三種格式、沒建的表當作空的', async () => {
  const json = await buildExport('json');
  const parsed = JSON.parse(json.body);
  assert.equal(parsed.tables.notes.length, 2);
  assert.deepEqual(parsed.tables.worship_roles, []);
  assert.match(json.filename, /\.json$/);
  assert.match((await buildExport('csv')).filename, /\.csv$/);
  const html = await buildExport('html');
  assert.match(html.contentType, /text\/html/);
  assert.ok(html.body.includes('小秘書資料備份'));
});
