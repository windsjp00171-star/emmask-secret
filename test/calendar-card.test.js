require('./helpers/env');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const supabasePath = require.resolve('../lib/supabase');
require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: {
    from() {
      const c = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : () => c) });
      return { select: () => c };
    },
  },
};
const { dispatch } = require('../lib/commands');

test('日曆：第一張是橘貓封面（本月／下月件數），後面接兩張月曆', async () => {
  const card = await dispatch('日曆');
  assert.equal(card.contents.type, 'carousel');
  assert.equal(card.contents.contents.length, 3);
  const cover = JSON.stringify(card.contents.contents[0]);
  assert.ok(cover.includes('行事曆') && cover.includes('本月 0 件'));
});
