require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRecur, nextRecurDue, recurLabel } = require('../lib/commands.js')._test;

test('parseRecur: 每半年，以指定日期為錨點，間隔6個月', () => {
  const r = parseRecur('提醒 12/1開始 每半年通知一次義全哥來更換飲水機濾心');
  assert.ok(r);
  assert.equal(r.recur, 'monthly:1:6');
  assert.equal(new Date(r.due).toISOString().slice(0, 10), '2026-12-01');
});

test('parseRecur: 每年，間隔12個月', () => {
  const r = parseRecur('提醒 每年8/1繳房屋稅');
  assert.equal(r.recur, 'monthly:1:12');
});

test('parseRecur: 每N年，間隔N*12個月', () => {
  const r = parseRecur('提醒 每2年8/1健檢');
  assert.equal(r.recur, 'monthly:1:24');
});

test('parseRecur: 每月N號維持舊行為（間隔1個月）', () => {
  const r = parseRecur('提醒 每月5號繳房租');
  assert.equal(r.recur, 'monthly:5:1');
});

test('nextRecurDue: 每半年往後推6個月', () => {
  const next = nextRecurDue('monthly:1:6', '2026-08-01T01:00:00.000Z');
  assert.equal(new Date(next).toISOString().slice(0, 10), '2027-02-01');
});

test('nextRecurDue: 舊格式（沒有間隔月數）預設每月一次，向下相容', () => {
  const next = nextRecurDue('monthly:5', '2026-08-05T01:00:00.000Z');
  assert.equal(new Date(next).toISOString().slice(0, 10), '2026-09-05');
});

test('recurLabel: 半年/年/N年/舊格式都能正確顯示', () => {
  assert.equal(recurLabel('monthly:1:6'), '每半年（1號）');
  assert.equal(recurLabel('monthly:1:12'), '每年（1號）');
  assert.equal(recurLabel('monthly:1:24'), '每2年（1號）');
  assert.equal(recurLabel('monthly:5'), '每月5號');
});

test('nextOccurrenceAfter: 已經發過（due 已是下個月）原樣保留；還沒發就跳過今天這一次', () => {
  const { nextOccurrenceAfter } = require('../lib/recur');
  const now = new Date('2026-11-01T00:30:00Z'); // 台北 11/1 08:30
  // 11/1 09:00 還沒發就按了完成 → 跳到 12/1
  assert.equal(nextOccurrenceAfter('monthly:1:1', '2026-11-01T01:00:00Z', now), '2026-12-01T01:00:00.000Z');
  // 已發過、due 已排到 12/1 → 不動
  assert.equal(nextOccurrenceAfter('monthly:1:1', '2026-12-01T01:00:00Z', now), '2026-12-01T01:00:00Z');
  // 每週：今天（週日）的下週日
  assert.equal(nextOccurrenceAfter('weekly:0', '2026-11-01T01:00:00Z', now), '2026-11-08T01:00:00.000Z');
});

test('markDoneWithUndo: 重複提醒按完成不會標成 is_done，而是排下一次', async () => {
  const supabasePath = require.resolve('../lib/supabase');
  const updates = [];
  const orig = require.cache[supabasePath];
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: {
    from: () => ({ update: (u) => { updates.push(u); return { eq: async () => ({ error: null }) }; } }),
  } };
  delete require.cache[require.resolve('../lib/commands.js')];
  try {
    const { markDoneWithUndo } = require('../lib/commands.js')._test;
    const out = await markDoneWithUndo({ id: 'x', content: '每個月 1號 到某網站\n按 EXTEND', recur: 'monthly:1:1', due_date: '2099-01-01T01:00:00.000Z' });
    assert.equal(updates[0].is_done, undefined);
    assert.equal(updates[0].is_reminded, false);
    assert.ok(updates[0].due_date);
    assert.match(String(out), /這次完成了/);
    updates.length = 0;
    await markDoneWithUndo({ id: 'y', content: '買牛奶', due_date: null });
    assert.equal(updates[0].is_done, true);
  } finally {
    if (orig) require.cache[supabasePath] = orig; else delete require.cache[supabasePath];
    delete require.cache[require.resolve('../lib/commands.js')];
  }
});
