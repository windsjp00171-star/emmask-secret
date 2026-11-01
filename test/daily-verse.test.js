require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { VERSES, verseOf, handleVerse, isVerseCommand } = require('../lib/daily-verse');

test('isVerseCommand：只認整句指令', () => {
  assert.equal(isVerseCommand('每日一句'), true);
  assert.equal(isVerseCommand(' 今日經文 '), true);
  assert.equal(isVerseCommand('每日一句要做什麼'), false);
});

test('同一個台北日期永遠同一句，隔天換下一句', () => {
  const a = new Date('2026-11-01T01:00:00Z'); // 台北 11/1 09:00
  const sameDay = new Date('2026-11-01T15:00:00Z'); // 台北 11/1 23:00
  const next = new Date('2026-11-01T16:30:00Z'); // 台北 11/2 00:30
  assert.deepEqual(verseOf(a), verseOf(sameDay));
  const i = VERSES.indexOf(verseOf(a));
  assert.equal(VERSES.indexOf(verseOf(next)), (i + 1) % VERSES.length);
});

test('handleVerse：有經文與出處，每節都有內容', () => {
  const out = handleVerse(new Date('2026-11-01T01:00:00Z'));
  assert.match(out, /今天的一句/);
  assert.match(out, /和合本/);
  for (const [ref, text] of VERSES) assert.ok(ref && text.length > 4);
  assert.equal(new Set(VERSES.map(v => v[0])).size, VERSES.length);
});
