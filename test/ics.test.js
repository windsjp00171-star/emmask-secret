require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCalendar, _test } = require('../lib/ics.js');
const { escapeText, foldLine, icsDate, icsDateTimeUTC, isAllDay, nextDayStamp } = _test;

test('escapeText: 跳脫反斜線、分號、逗號、換行', () => {
  assert.equal(escapeText('a\\b'), 'a\\\\b');
  assert.equal(escapeText('a;b'), 'a\\;b');
  assert.equal(escapeText('a,b'), 'a\\,b');
  assert.equal(escapeText('a\nb'), 'a\\nb');
  assert.equal(escapeText('a\r\nb'), 'a\\nb');
});

test('escapeText: 反斜線要先跳脫，不然會被二次跳脫', () => {
  // 先換分號的話 "\;" 裡的反斜線會再被換一次，變成 "\\\\;"
  assert.equal(escapeText('\\;'), '\\\\\\;');
});

test('escapeText: 空值不會爆炸', () => {
  assert.equal(escapeText(null), '');
  assert.equal(escapeText(undefined), '');
});

test('foldLine: 短行原樣不動', () => {
  assert.equal(foldLine('SUMMARY:短短的'), 'SUMMARY:短短的');
});

test('foldLine: 超過 75 octet 會折行，續行開頭是空白', () => {
  const out = foldLine('SUMMARY:' + 'a'.repeat(200));
  const parts = out.split('\r\n');
  assert.ok(parts.length > 1, '應該要折行');
  parts.slice(1).forEach(p => assert.ok(p.startsWith(' '), '續行要以空白開頭'));
});

test('foldLine: 每一行都不超過 75 octet', () => {
  const out = foldLine('SUMMARY:' + '中文字'.repeat(60));
  for (const p of out.split('\r\n')) {
    assert.ok(Buffer.byteLength(p, 'utf8') <= 75, `這行 ${Buffer.byteLength(p, 'utf8')} octet，超過了`);
  }
});

// 中文一個字 3 bytes，從中間切斷會產生壞掉的 UTF-8，整個 .ics 就毀了
test('foldLine: 折行不會切斷多位元組字元', () => {
  const src = 'SUMMARY:' + '全台聯合禱告會於夏凱納靈糧堂'.repeat(10);
  const out = foldLine(src);
  // 把折行還原後要和原文完全一致
  const rejoined = out.split('\r\n ').join('');
  assert.equal(rejoined, src);
  // 還原後不該出現替換字元（U+FFFD 代表解碼失敗）
  assert.ok(!out.includes('�'), '不該出現壞掉的字元');
});

test('foldLine: 折行還原後內容不變（純 ASCII）', () => {
  const src = 'DESCRIPTION:' + 'x'.repeat(300);
  assert.equal(foldLine(src).split('\r\n ').join(''), src);
});

test('icsDate: 用台北日期', () => {
  assert.equal(icsDate('2026-10-06T00:00:00+08:00'), '20261006');
});

// UTC 是 10/05 16:00，台北已經是 10/06 —— 用 UTC 日期會整個差一天
test('icsDate: 跨日的時間要用台北日期而不是 UTC 日期', () => {
  assert.equal(icsDate('2026-10-05T16:00:00Z'), '20261006');
});

test('icsDateTimeUTC: 轉成 Z 結尾的 UTC 時間', () => {
  assert.equal(icsDateTimeUTC('2026-09-02T14:30:00+08:00'), '20260902T063000Z');
});

test('isAllDay: 台北時間 00:00 算整天事件', () => {
  assert.equal(isAllDay('2026-10-06T00:00:00+08:00'), true);
});

test('isAllDay: 有指定時間的不算整天', () => {
  assert.equal(isAllDay('2026-09-02T14:30:00+08:00'), false);
  assert.equal(isAllDay('2026-09-02T00:30:00+08:00'), false);
});

test('nextDayStamp: 整天事件的 DTEND 是隔天（不含當天）', () => {
  assert.equal(nextDayStamp('2026-10-06T00:00:00+08:00'), '20261007');
});

test('nextDayStamp: 跨月正確進位', () => {
  assert.equal(nextDayStamp('2026-10-31T00:00:00+08:00'), '20261101');
});

test('nextDayStamp: 跨年正確進位', () => {
  assert.equal(nextDayStamp('2026-12-31T00:00:00+08:00'), '20270101');
});

const NOTES = [
  { id: 'a1', type: 'task', project: '會議記錄', content: '全台聯合禱告會於夏凱納靈糧堂', due_date: '2026-10-06T00:00:00+08:00' },
  { id: 'b2', type: 'reminder', project: null, content: '跟牧師開會', due_date: '2026-09-02T14:30:00+08:00' },
];

test('buildCalendar: 基本結構齊全', () => {
  const ics = buildCalendar(NOTES, { now: '2026-09-17T00:00:00Z' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /X-WR-TIMEZONE:Asia\/Taipei/);
});

test('buildCalendar: 全部用 CRLF 換行', () => {
  const ics = buildCalendar(NOTES, { now: '2026-09-17T00:00:00Z' });
  // 去掉所有 CRLF 後不該還有單獨的 \n
  assert.ok(!ics.replace(/\r\n/g, '').includes('\n'), '不該有單獨的 LF');
});

test('buildCalendar: 每筆記錄一個 VEVENT', () => {
  const ics = buildCalendar(NOTES, { now: '2026-09-17T00:00:00Z' });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, 2);
});

test('buildCalendar: UID 穩定（同一筆每次都一樣，才不會重複跑出新事件）', () => {
  const a = buildCalendar(NOTES, { domain: 'x.com', now: '2026-09-17T00:00:00Z' });
  const b = buildCalendar(NOTES, { domain: 'x.com', now: '2026-09-18T00:00:00Z' });
  const uids = s => s.match(/UID:.*/g).sort();
  assert.deepEqual(uids(a), uids(b));
  assert.match(a, /UID:a1@x\.com/);
});

test('buildCalendar: 00:00 的用整天格式，有時間的用定時格式', () => {
  const ics = buildCalendar(NOTES, { now: '2026-09-17T00:00:00Z' });
  assert.match(ics, /DTSTART;VALUE=DATE:20261006/);
  assert.match(ics, /DTSTART:20260902T063000Z/);
});

test('buildCalendar: 標題帶類型圖示', () => {
  const ics = buildCalendar(NOTES, { now: '2026-09-17T00:00:00Z' });
  assert.match(ics, /SUMMARY:📌/);
  assert.match(ics, /SUMMARY:🔔/);
});

test('buildCalendar: 沒有 due_date 或 id 的記錄跳過', () => {
  const ics = buildCalendar([
    { id: 'x', type: 'task', content: '沒日期' },
    { type: 'task', content: '沒 id', due_date: '2026-10-06T00:00:00+08:00' },
    null,
  ], { now: '2026-09-17T00:00:00Z' });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 0);
});

test('buildCalendar: 空清單仍產生合法的空日曆', () => {
  const ics = buildCalendar([], { now: '2026-09-17T00:00:00Z' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 0);
});

test('buildCalendar: null 輸入不會爆炸', () => {
  assert.ok(buildCalendar(null, { now: '2026-09-17T00:00:00Z' }).includes('END:VCALENDAR'));
});

test('buildCalendar: 內容裡的逗號分號會被跳脫，不會破壞格式', () => {
  const ics = buildCalendar([
    { id: 'c1', type: 'task', content: '買菜, 掃地; 洗車', due_date: '2026-10-06T00:00:00+08:00' },
  ], { now: '2026-09-17T00:00:00Z' });
  assert.match(ics, /買菜\\, 掃地\\; 洗車/);
});
