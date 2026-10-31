require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

// 替身：不真的呼叫 Gemini，由測試指定回什麼
let aiReply = '{"points":["a"],"decisions":[]}';
let aiCalls = 0;
const geminiPath = require.resolve('../lib/gemini');
const realGemini = require('../lib/gemini');
require.cache[geminiPath].exports = { ...realGemini, callGemini: async () => { aiCalls++; if (aiReply instanceof Error) throw aiReply; return aiReply; } };
const quotaPath = require.resolve('../lib/quota');
require.cache[quotaPath] = { id: quotaPath, filename: quotaPath, loaded: true, exports: { isExhausted: async () => false, markExhausted: async () => {} } };

process.env.GEMINI_API_KEY = 'k';
const { shouldSummarize, summarizeMeeting, formatSummary, _test } = require('../lib/meeting-summary');

const longRecord = ['小組長月會', '1. 分享近況', '2. 11/1 第二堂結束後開會', '3. 便當訂 40 份', '4. 場地確認', '5. 禱告事項', '6. 下次月會 12/5'].join('\n');

test('shouldSummarize：短記錄不叫 AI，行數多或字數多才摘要', () => {
  assert.equal(shouldSummarize('今天開會\n討論 A\n決定 B'), false);
  assert.equal(shouldSummarize(longRecord), true);
  assert.equal(shouldSummarize('字'.repeat(220)), true);
  assert.equal(shouldSummarize(''), false);
});

test('sanitize：去掉項目符號與非字串、最多 5 點、過長截斷；兩邊都空回 null', () => {
  const s = _test.sanitize({ points: ['• 一', '- 二', 3, '', '三', '四', '五', '六', '七'], decisions: ['1. 決定 X', '字'.repeat(100)] });
  assert.deepEqual(s.points, ['一', '二', '三', '四', '五']);
  assert.equal(s.decisions[0], '決定 X');
  assert.ok(s.decisions[1].endsWith('…') && s.decisions[1].length <= 81);
  assert.equal(_test.sanitize({ points: [], decisions: [] }), null);
  assert.equal(_test.sanitize(null), null);
  assert.equal(_test.sanitize('x'), null);
});

test('formatSummary：重點與決議分段；沒有決議就不印那一段', () => {
  const both = formatSummary({ points: ['甲', '乙'], decisions: ['丙'] });
  assert.match(both, /🧠 重點（AI 整理，僅供參考）\n• 甲\n• 乙/);
  assert.match(both, /☑️ 決議\n• 丙/);
  assert.doesNotMatch(formatSummary({ points: ['甲'], decisions: [] }), /決議/);
  assert.equal(formatSummary(null), '');
});

test('summarizeMeeting：短記錄不呼叫 AI；長記錄回整理好的結果', async () => {
  aiCalls = 0;
  assert.equal(await summarizeMeeting('短短的'), null);
  assert.equal(aiCalls, 0);
  aiReply = '{"points":["便當 40 份"],"decisions":["11/1 第二堂結束後開會"]}';
  const s = await summarizeMeeting(longRecord);
  assert.deepEqual(s, { points: ['便當 40 份'], decisions: ['11/1 第二堂結束後開會'] });
  assert.equal(aiCalls, 1);
});

test('summarizeMeeting：AI 出錯或回傳不是 JSON 就回 null，不丟錯', async () => {
  aiReply = new Error('boom');
  assert.equal(await summarizeMeeting(longRecord), null);
  aiReply = '這不是 JSON';
  assert.equal(await summarizeMeeting(longRecord), null);
});

test('summarizeMeeting：沒設 GEMINI_API_KEY 就不呼叫', async () => {
  const old = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  aiCalls = 0;
  assert.equal(await summarizeMeeting(longRecord), null);
  assert.equal(aiCalls, 0);
  process.env.GEMINI_API_KEY = old;
});
