const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const load = require('./helpers/load-typescript.cjs');

function setup({ owner = 'owner', active = true } = {}) {
  const category = { id: 'budget', owner_id: owner, is_active: active, parent_id: null, monthly_budget: 600, budget_period: 'monthly', budget_start_date: '2026-01-01', budget_end_date: null };
  const overrides = [{ owner_id: 'owner', category_id: 'budget', budget_month: '2026-11-01', amount: 700 }];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from(table) {
      let method = 'select', payload;
      const filters = [];
      const query = {
        select() { return query; }, single() { return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        upsert(row, options) { assert.equal(options.onConflict, 'owner_id,category_id,budget_month'); method = 'upsert'; payload = row; return query; },
        delete() { method = 'delete'; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (table === 'personal_categories') {
              assert.equal(method, 'select', 'Le budget habituel ne doit jamais être modifié');
              return { data: filters.every(fn => fn(category)) ? category : null, error: null };
            }
            assert.equal(table, 'personal_budget_month_overrides');
            if (method === 'upsert') {
              const old = overrides.find(row => row.owner_id === payload.owner_id && row.category_id === payload.category_id && row.budget_month === payload.budget_month);
              if (old) Object.assign(old, payload); else overrides.push(payload);
            } else if (method === 'delete') {
              for (let i = overrides.length - 1; i >= 0; i--) if (filters.every(fn => fn(overrides[i]))) overrides.splice(i, 1);
            }
            return { error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const imports = {
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'), { url }); } },
    'next/headers': {},
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/perso/calendar': load('src/lib/perso/calendar.ts'),
    '@/lib/perso/children-sync': load('src/lib/perso/children-sync.ts'),
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/(app)/perso/actions.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: name => { assert.ok(name in imports); return imports[name]; }, FormData, URL, Date, Intl, Set, console });
  return { action: exports.saveMonthlyBudgetAmount, category, overrides };
}
function form(amount = '800', operation = 'save') {
  const fd = new FormData();
  Object.entries({ category_id: 'budget', budget_month: '2026-10', amount, operation }).forEach(([key, value]) => fd.set(key, value));
  return fd;
}

test('enregistrement puis réinitialisation préservent les autres mois et la catégorie', async () => {
  const s = setup();
  await assert.rejects(s.action(form()), error => error.url?.includes('month=2026-10') && error.url.includes('succes='));
  assert.equal(s.overrides.find(row => row.budget_month === '2026-10-01').amount, 800);
  assert.equal(s.category.monthly_budget, 600);
  await assert.rejects(s.action(form('', 'reset')), error => Boolean(error.url?.includes('succes=')));
  assert.equal(s.overrides.length, 1);
  assert.equal(s.overrides[0].amount, 700);
});
for (const amount of ['', '-1', 'NaN', 'Infinity']) {
  test(`montant invalide ${JSON.stringify(amount)} refusé sans écriture`, async () => {
    const s = setup();
    await assert.rejects(s.action(form(amount)), error => Boolean(error.url?.includes('erreur=')));
    assert.equal(s.overrides.length, 1);
  });
}
test('un budget appartenant à un autre propriétaire est refusé', async () => {
  const s = setup({ owner: 'other' });
  await assert.rejects(s.action(form()), error => Boolean(error.url?.includes('erreur=')));
  assert.equal(s.overrides.length, 1);
});
test('montant zéro autorisé et enregistré explicitement', async () => {
  const s = setup();
  await assert.rejects(s.action(form('0')), error => Boolean(error.url?.includes('succes=')));
  assert.equal(s.overrides.find(row => row.budget_month === '2026-10-01').amount, 0);
});
