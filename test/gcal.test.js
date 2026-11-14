require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../lib/gcal');

const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN',
  'BEGIN:VTIMEZONE', 'TZID:Asia/Taipei', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0800', 'TZOFFSETTO:+0800', 'TZNAME:CST', 'END:STANDARD', 'END:VTIMEZONE',
  // 一次性：台北 11/10 14:00–15:00
  'BEGIN:VEVENT', 'UID:one@t', 'DTSTART;TZID=Asia/Taipei:20261110T140000', 'DTEND;TZID=Asia/Taipei:20261110T150000', 'SUMMARY:場地 Booking', 'LOCATION:大堂', 'END:VEVENT',
  // 每週三 16:00 全職同工會（UTC 寫法），11/18 被取消（EXDATE）
  'BEGIN:VEVENT', 'UID:weekly@t', 'DTSTART:20261104T080000Z', 'DTEND:20261104T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=WE', 'EXDATE:20261118T080000Z', 'SUMMARY:全職同工會', 'END:VEVENT',
  // 全天
  'BEGIN:VEVENT', 'UID:allday@t', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261111', 'SUMMARY:教會大掃除', 'END:VEVENT',
  // 被取消的
  'BEGIN:VEVENT', 'UID:cx@t', 'DTSTART:20261110T020000Z', 'DTEND:20261110T030000Z', 'STATUS:CANCELLED', 'SUMMARY:取消的會', 'END:VEVENT',
  // 沒時區（floating）：當台北 11/11 09:00
  'BEGIN:VEVENT', 'UID:float@t', 'DTSTART:20261111T090000', 'DTEND:20261111T100000', 'SUMMARY:浮動時間', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const FROM = new Date('2026-11-09T16:00:00Z'); // 台北 11/10 00:00
const TO = new Date('2026-11-13T16:00:00Z');

test('parseEvents：時區、全天、重複＋EXDATE、取消、沒時區', () => {
  const ev = g.parseEvents(ICS, FROM, TO);
  const by = (u) => ev.filter(e => e.uid.startsWith(u));
  assert.equal(by('one@t')[0].start, '2026-11-10T06:00:00.000Z'); // 台北 14:00
  assert.equal(by('one@t')[0].location, '大堂');
  assert.equal(by('allday@t')[0].allDay, true);
  assert.equal(by('cx@t').length, 0);
  assert.equal(by('float@t')[0].start, '2026-11-11T01:00:00.000Z'); // 台北 09:00
  const weekly = by('weekly@t').map(e => e.start);
  assert.deepEqual(weekly, ['2026-11-11T08:00:00.000Z']); // 11/11 是週三；11/18 超出範圍
  const long = g.parseEvents(ICS, FROM, new Date('2026-11-25T00:00:00Z')).filter(e => e.uid.startsWith('weekly@t')).map(e => e.start.slice(0, 10));
  assert.deepEqual(long, ['2026-11-11']); // 11/18 被 EXDATE 拿掉，11/25 還在範圍外
});

test('dueReminders：只提醒還沒開始、30 分鐘內、沒推過的有時間行程', () => {
  const ev = [
    { uid: 'a', start: '2026-11-10T06:00:00.000Z', end: '2026-11-10T07:00:00.000Z', allDay: false, summary: 'A' },
    { uid: 'b', start: '2026-11-10T08:00:00.000Z', end: '2026-11-10T09:00:00.000Z', allDay: false, summary: 'B' },
    { uid: 'c', start: '2026-11-10T05:00:00.000Z', end: '2026-11-10T05:30:00.000Z', allDay: false, summary: 'C' },
    { uid: 'd', start: '2026-11-10T06:10:00.000Z', end: '2026-11-10T06:30:00.000Z', allDay: true, summary: 'D' },
  ];
  const now = new Date('2026-11-10T05:40:00Z'); // A 20 分鐘後、B 2 小時後、C 已開始
  assert.deepEqual(g.dueReminders(ev, now, 30).map(e => e.uid), ['a']);
  assert.deepEqual(g.dueReminders(ev, now, 30, new Set(['a|2026-11-10T06:00:00.000Z'])).map(e => e.uid), []);
  assert.match(g.reminderText(ev[0], now), /20 分鐘後：A[\s\S]*14:00–15:00/);
});

test('todayLines：今天的行程、全天排前面；別天的不列', () => {
  const ev = g.parseEvents(ICS, FROM, TO);
  const lines = g.todayLines(ev, new Date('2026-11-10T00:30:00Z')); // 台北 11/10 08:30
  assert.deepEqual(lines, ['📅 全天 教會大掃除', '📅 14:00 場地 Booking']);
});

test('normalizeUrl：只收 Google 日曆的 https／webcal 網址', () => {
  assert.match(g.normalizeUrl('webcal://calendar.google.com/calendar/ical/x/private-y/basic.ics'), /^https:\/\/calendar\.google\.com/);
  assert.throws(() => g.normalizeUrl('https://evil.example.com/x.ics'));
  assert.throws(() => g.normalizeUrl('http://calendar.google.com/x.ics'));
});
