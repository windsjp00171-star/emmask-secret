require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSongEntry, extractSongCandidates, titleAppearsInContent } = require('../lib/commands.js')._test;

// 回歸測試：parseSongEntry 原本用 \s+ 切 token 再用單一空白重組，
// 貼多行歌詞會被壓成一行、換行全部消失。
test('parseSongEntry: 歌詞段落的換行要完整保留', () => {
  const input = '無人能與祢相比 D 72 https://example.com\n[verse]\n永活全能的主宰\n道成肉身顯明你的愛';
  const entry = parseSongEntry(input);
  assert.equal(entry.title, '無人能與祢相比');
  assert.equal(entry.key, 'D');
  assert.equal(entry.bpm, '72');
  assert.equal(entry.link, 'https://example.com');
  assert.equal(entry.section, '[verse]\n永活全能的主宰\n道成肉身顯明你的愛');
});

test('parseSongEntry: 只有歌名時其他欄位為空字串', () => {
  const entry = parseSongEntry('奇異恩典');
  assert.equal(entry.title, '奇異恩典');
  assert.equal(entry.key, '');
  assert.equal(entry.section, '');
});

test('parseSongEntry: 忽略已附加的版本紀錄段落', () => {
  const entry = parseSongEntry('無人能與祢相比 E 72 https://x.com｜版本紀錄:07/14前:D');
  assert.equal(entry.title, '無人能與祢相比');
  assert.equal(entry.key, 'E');
});

test('extractSongCandidates: 抓編號歌單的歌名，過濾掉調性標註', () => {
  const content = '1.無人能與祢相比(E)\n1-PC-C-間奏\n\n2.神同在(D)\n1-1-C-2';
  assert.deepEqual(extractSongCandidates(content), ['無人能與祢相比', '神同在']);
});

test('extractSongCandidates: 沒有編號行時回傳空陣列', () => {
  assert.deepEqual(extractSongCandidates('隨便寫一些話\n沒有編號'), []);
});

test('titleAppearsInContent: 完整出現時算比對到', () => {
  assert.equal(titleAppearsInContent('無人能與祢相比', '1.無人能與祢相比(E)\n[verse]'), true);
});

test('titleAppearsInContent: 只是別的詞的一部分時不算比對到', () => {
  // 短歌名「愛」不該因為內容出現「愛的真諦」就誤判成有唱到「愛」
  assert.equal(titleAppearsInContent('愛', '這次要唱愛的真諦'), false);
});

test('titleAppearsInContent: 前後是標點或行首行尾時仍算比對到', () => {
  assert.equal(titleAppearsInContent('愛', '愛\n下一首'), true);
  assert.equal(titleAppearsInContent('愛', '上一首\n愛'), true);
  assert.equal(titleAppearsInContent('愛', '（愛）'), true);
});
