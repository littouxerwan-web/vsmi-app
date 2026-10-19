const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./helpers/load-typescript.cjs');
const { withSavingsSupplements } = load('src/lib/perso/savings-supplements.ts');
function client(rows, error = null) {
  return { from(table) {
    assert.equal(table, 'personal_savings_supplements');
    const q = { select() { return q; }, eq(key, value) { assert.equal(key, 'owner_id'); assert.equal(value, 'owner'); return q; },
      order() { return q; }, range(start) { return Promise.resolve({ data: rows.slice(start, start + 2), error }); } }; return q;
  } };
}
test('compléments paginés rattachés uniquement à leur décision', async () => {
  const rows = Array.from({length:5}, (_, i) => ({decision_id:i%2?'other':'parent',previous_transfer_group_id:`g${i}`}));
  const result = await withSavingsSupplements(client(rows), 'owner', [{id:'parent'},{id:'other'},{id:'empty'}]);
  assert.equal(result[0].supplements.length,3);assert.equal(result[1].supplements.length,2);assert.equal(result[2].supplements.length,0);
});
test('migration absente : aucun complément automatique activé', async () => {
  const result = await withSavingsSupplements(client([], {code:'PGRST205'}), 'owner', [{id:'parent'}]);
  assert.equal(result[0].supplements,undefined);
});
test('les erreurs RLS ne doivent pas cacher les suppressions de compléments', async () => {
  await assert.rejects(withSavingsSupplements(client([], {code:'42501',message:'denied'}),'owner',[{id:'parent'}]),/denied/);
});
