const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./helpers/load-typescript.cjs');
const { loadMonthlyBudgetOverrides } = load('src/lib/perso/monthly-budget-overrides.ts');
function client(rows, error = null) {
  return { from(table) {
    assert.equal(table, 'personal_budget_month_overrides');
    const q = { select() { return q; }, eq(key, value) { assert.equal(key, 'owner_id'); assert.equal(value, 'owner'); return q; },
      order() { return q; }, range(start) { return Promise.resolve({ data: rows.slice(start, start + 2), error }); } };
    return q;
  } };
}
test('charge toutes les dérogations même si la limite API est inférieure à la page demandée', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ category_id: `c${i}`, budget_month: '2026-10-01', amount: i }));
  const result = await loadMonthlyBudgetOverrides(client(rows), 'owner');
  assert.equal(result.available, true);
  assert.equal(result.rows.length, 5);
  assert.equal(result.rows.at(-1).category_id, 'c4');
});
test('avant migration, les budgets restent affichables mais la modification mensuelle est désactivée', async () => {
  const result = await loadMonthlyBudgetOverrides(client([], { code: 'PGRST205', message: 'missing table' }), 'owner');
  assert.equal(result.available, false);
  assert.equal(result.rows.length, 0);
});
test('une erreur de permission ne doit pas ignorer silencieusement les montants mensuels', async () => {
  await assert.rejects(loadMonthlyBudgetOverrides(client([], { code: '42501', message: 'permission denied' }), 'owner'), /permission denied/);
});
