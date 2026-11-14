require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../lib/worship');
const { taipeiKey } = require('../lib/time');

const now = new Date('2026-11-14T02:00:00Z');

test('noteEventDate：文字裡的 M/D 優先，沒有就用主日', () => {
  assert.equal(_test.noteEventDate('12/19梅花里聖誕嘉年華', '2026-12-13'), '2026-12-19');
  assert.equal(_test.noteEventDate('10/24 和運、昭頤 感恩禮拜', '2026-10-18'), '2026-10-24');
  assert.equal(_test.noteEventDate('聖餐', '2026-12-13'), '2026-12-13');
  assert.equal(_test.noteEventDate('1/3 新年', '2026-12-27'), '2027-01-03');
});

test('planNoteReminders：活動前 7 天早上 9 點提醒；過期與已排過的略過', () => {
  const rows = [
    { service_date: '2026-12-13', person_name: '12/19梅花里聖誕嘉年華' },
    { service_date: '2026-12-13', person_name: '聖餐' },
    { service_date: '2026-11-08', person_name: '靈修摸彩' },
  ];
  const out = _test.planNoteReminders(rows, ['2026-12-13|聖餐'], now);
  assert.equal(out.length, 1);
  const r = out[0];
  assert.equal(r.type, 'reminder');
  assert.equal(r.project, '服事備註');
  assert.equal(r.content, '⛪ 12/19梅花里聖誕嘉年華');
  assert.equal(taipeiKey(r.due_date), '2026-12-19');
  assert.equal(r.remind_lead_minutes, 7 * 24 * 60);
  assert.equal(r.is_reminded, false);
  assert.equal(r.meta.worship_key, '2026-12-13|12/19梅花里聖誕嘉年華');
});

test('planNoteReminders：不到一週的備註盡快提醒', () => {
  const out = _test.planNoteReminders([{ service_date: '2026-11-20', person_name: '聖餐' }], [], now);
  assert.equal(out.length, 1);
  assert.equal(out[0].is_reminded, false);
  assert.ok(out[0].remind_lead_minutes < 7 * 24 * 60);
});
