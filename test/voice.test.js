require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withHeard, _test: { audioMime, cleanTranscript } } = require('../lib/voice.js');

test('audioMime: LINE 的 m4a 與缺省類型都轉成 audio/mp4', () => {
  assert.equal(audioMime('audio/x-m4a'), 'audio/mp4');
  assert.equal(audioMime(''), 'audio/mp4');
  assert.equal(audioMime('image/jpeg'), 'audio/mp4');
  assert.equal(audioMime('audio/ogg'), 'audio/ogg');
});

test('cleanTranscript: 去掉引號，聽不清楚回空字串', () => {
  assert.equal(cleanTranscript('「明天下午三點看牙醫」\n'), '明天下午三點看牙醫');
  assert.equal(cleanTranscript('（聽不清楚）'), '');
  assert.equal(cleanTranscript('   '), '');
});

test('withHeard: 文字回覆併成一則，flex 回覆前面多一則', () => {
  assert.equal(withHeard('今天', '沒有事'), '🎤 聽到：「今天」\n\n沒有事');
  const flex = { type: 'flex', contents: {} };
  assert.deepEqual(withHeard('待辦', flex), ['🎤 聽到：「待辦」', flex]);
  assert.equal(withHeard('x', ['a', 'b', 'c', 'd', 'e']).length, 5);
  assert.equal(withHeard('x', null), '🎤 聽到：「x」');
});
