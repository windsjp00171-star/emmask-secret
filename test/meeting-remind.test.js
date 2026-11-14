require('./helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { planReminder, overlaps, scheduleRow } = require('../lib/meeting-remind');

const NOW = new Date('2026-11-14T02:00:00Z'); // 台北 11/14 10:00

test('planReminder：活動前 3 天早上 9 點；離得近就馬上；過去的不提醒', () => {
  // 11/30 整天的活動（台北 00:00）→ 11/27 09:00 台北提醒
  const far = planReminder('2026-11-30T00:00:00+08:00', NOW);
  assert.equal(far.fire_at, '2026-11-27T01:00:00.000Z');
  // 提醒排程用「到期時間 − 提前分鐘」判斷，要剛好等於 11/27 09:00
  assert.equal(new Date(new Date('2026-11-30T00:00:00+08:00').getTime() - far.lead_minutes * 60000).toISOString(), far.fire_at);
  // 有時間的活動（11/30 19:00）也是 3 天前的早上 9 點
  assert.equal(planReminder('2026-11-30T19:00:00+08:00', NOW).fire_at, '2026-11-27T01:00:00.000Z');
  // 後天的活動：已經不到 3 天，馬上提醒（到期時間 − 提前 ≤ 現在）
  const near = planReminder('2026-11-16T00:00:00+08:00', NOW);
  assert.ok(new Date('2026-11-16T00:00:00+08:00').getTime() - near.lead_minutes * 60000 <= NOW.getTime());
  // 已經過去
  assert.equal(planReminder('2026-11-10T00:00:00+08:00', NOW), null);
});

test('scheduleRow：reminder 型、帶提前分鐘；過去的標成已提醒', () => {
  const r = scheduleRow({ raw_text: 'x', content: '聖誕晚會', due_date: '2026-12-24T00:00:00+08:00', meta: { a: 1 } }, NOW);
  assert.equal(r.type, 'reminder');
  assert.equal(r.is_reminded, false);
  assert.ok(r.remind_lead_minutes > 0);
  const past = scheduleRow({ raw_text: 'x', content: '舊的', due_date: '2026-11-01T00:00:00+08:00' }, NOW);
  assert.equal(past.is_reminded, true);
  assert.equal(past.remind_lead_minutes, null);
});

test('overlaps：同一件事的不同寫法算重疊，不相干的不算', () => {
  assert.equal(overlaps('訂聖誕晚會場地', '12/24 聖誕晚會 在大堂'), true);
  assert.equal(overlaps('訂聖誕晚會場地', '全台聯合禱告會'), false);
  assert.equal(overlaps('', '聖誕晚會'), false);
});
