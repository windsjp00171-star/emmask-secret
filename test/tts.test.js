require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../lib/tts.js');
const { buildCalendar } = require('../lib/ics.js');

test('buildSpeech: 網址不唸、太長截斷、空內容回空字串', () => {
  assert.match(_test.buildSpeech('看牙醫 https://x.com/a 帶健保卡'), /看牙醫 帶健保卡/);
  assert.doesNotMatch(_test.buildSpeech('看牙醫 https://x.com/a'), /https/);
  assert.ok(_test.buildSpeech('字'.repeat(300)).includes('……'));
  assert.equal(_test.buildSpeech('   '), '');
});

test('pcmDurationMs: 24kHz 16-bit 單聲道，48000 bytes 是 1 秒', () => {
  assert.equal(_test.pcmDurationMs(Buffer.alloc(48000)), 1000);
});

test('pcmToM4a: 轉出來是 mp4 容器（ftyp 檔頭）', async () => {
  const pcm = Buffer.alloc(48000);
  const m4a = await _test.pcmToM4a(pcm);
  assert.equal(m4a.slice(4, 8).toString(), 'ftyp');
});

test('ics: 定時事件有提前鬧鈴，整天事件早上 9 點響', () => {
  const timed = buildCalendar([{ id: 'a', type: 'reminder', content: '看牙醫', due_date: '2026-10-24T06:00:00Z', remind_lead_minutes: 60 }]);
  assert.match(timed, /BEGIN:VALARM[\s\S]*TRIGGER:-PT60M[\s\S]*END:VALARM/);
  const allDay = buildCalendar([{ id: 'b', type: 'task', content: '繳費', due_date: '2026-10-23T16:00:00Z' }]);
  assert.match(allDay, /TRIGGER:PT9H/);
});

test('pickExpiredVoice: 只挑超過保存天數的語音檔，路徑帶 voice/ 前綴', () => {
  const now = Date.parse('2026-10-23T00:00:00Z');
  const day = 24 * 3600 * 1000;
  const files = [
    { name: 'old.m4a', created_at: new Date(now - 9 * day).toISOString() },
    { name: 'new.m4a', created_at: new Date(now - 2 * day).toISOString() },
    { name: 'edge.m4a', created_at: new Date(now - 8 * day + 1000).toISOString() },
    { name: '.emptyFolderPlaceholder' },
  ];
  assert.deepEqual(_test.pickExpiredVoice(files, now, 8), ['voice/old.m4a']);
});
