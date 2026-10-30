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

const { songHeader } = require('../lib/commands.js')._test;

test('parseSongEntry: 歌名尾巴有英文，調性／BPM／連結不會跑掉（舊的空白格式）', () => {
  const e = parseSongEntry('無人能比 Nothing Like You D 72 https://x.com\n[verse]\n詞');
  assert.deepEqual([e.title, e.key, e.bpm, e.link], ['無人能比 Nothing Like You', 'D', '72', 'https://x.com']);
  assert.equal(e.section, '[verse]\n詞');
});

test('parseSongEntry: 純英文歌名、只有歌名沒有其他欄位', () => {
  assert.equal(parseSongEntry('Holy Spirit').title, 'Holy Spirit');
  const e = parseSongEntry('Holy Spirit Am 68');
  assert.deepEqual([e.title, e.key, e.bpm], ['Holy Spirit', 'Am', '68']);
});

test('parseSongEntry: 只有歌名、下一行是段落時，段落不會被當成調性', () => {
  const e = parseSongEntry('奇異恩典\n[verse]\n詞');
  assert.deepEqual([e.title, e.key, e.section], ['奇異恩典', '', '[verse]\n詞']);
});

test('songHeader + parseSongEntry 往返：歌名有空白、欄位有空的，都原樣讀回來', () => {
  for (const f of [
    ['神的 愛', '', '', ''],
    ['神的 愛', 'D', '', ''],
    ['神的 愛', '', '72', ''],
    ['Plan B', 'B', '80', 'https://x.com'],
    ['奇異恩典', '', '', ''],
  ]) {
    const content = `${songHeader(...f)}\n段落\n第二行`;
    const e = parseSongEntry(content);
    assert.deepEqual([e.title, e.key, e.bpm, e.link], f, JSON.stringify(f));
    assert.equal(e.section, '段落\n第二行');
  }
  assert.equal(songHeader('奇異恩典', '', '', ''), '奇異恩典');
});

test('後台 index.html 的 parseSongEntry／songHeader 跟 lib 的行為一致', () => {
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const src = html.slice(html.indexOf('const SONG_KEY_RE'), html.indexOf('const Songs = {'));
  const { parseSongEntry: p2, songHeader: h2 } = new Function(`${src}\nreturn { parseSongEntry, songHeader };`)();
  const e = p2(`${h2('愛 Love', '', '72', '')}\n段\n｜版本紀錄:07/14前:D`);
  assert.deepEqual([e.title, e.key, e.bpm, e.section, e.history], ['愛 Love', '', '72', '段', '07/14前:D']);
  const legacy = p2('無人能比 Nothing Like You D 72');
  assert.deepEqual([legacy.title, legacy.key, legacy.bpm], ['無人能比 Nothing Like You', 'D', '72']);
});
