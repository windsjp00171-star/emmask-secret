require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// 後台「筆記」分頁的判斷在 index.html 的 <script> 裡；只取純函式出來測
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const src = html.slice(html.indexOf('const NOTE_OTHER_PROJECTS'), html.indexOf('const Notes = {'));
const { isNoteRecord, noteParts } = new Function(`${src}\nreturn { isNoteRecord, noteParts };`)();

test('筆記分頁：類型是筆記的算；專案更新也算；待辦、提醒、記帳不算', () => {
  assert.equal(isNoteRecord({ type: 'note', project: null }), true);
  assert.equal(isNoteRecord({ type: 'note', project: 'We r one' }), true);
  assert.equal(isNoteRecord({ type: 'project_update', project: '會計系統' }), true);
  for (const type of ['task', 'reminder', 'expense', 'contact']) assert.equal(isNoteRecord({ type, project: null }), false, type);
});

test('筆記分頁：已經有自己分頁的專案（收藏、詩歌、順序、會議記錄、相簿、週報）不算', () => {
  for (const project of ['收藏', '詩歌', '敬拜順序', '順序範本', '會議記錄', '相簿', '週報']) {
    assert.equal(isNoteRecord({ type: 'note', project }), false, project);
  }
});

test('筆記卡片：第一行當標題，其餘接成預覽；空白內容有備用標題', () => {
  assert.deepEqual(noteParts('We r one 流程\n1. 報到\n\n2. 彩排'), { title: 'We r one 流程', preview: '1. 報到 2. 彩排' });
  assert.deepEqual(noteParts('只有一行'), { title: '只有一行', preview: '' });
  assert.equal(noteParts('  \n ').title, '（空白）');
});

test('後台的 data-tour 都有對應的元素或步驟（筆記分頁的教學綁在 data-tour，不是 id／class）', () => {
  assert.ok(html.includes('data-tour="notes-tab"'));
  assert.ok(html.includes("target: 'notes-tab'"));
});
