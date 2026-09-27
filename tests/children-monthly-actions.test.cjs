// Run with: node --test tests/children-monthly-actions.test.cjs
// Executes the real server actions against an in-memory Supabase adapter.
// Does not contact or modify a live database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, FormData, URL, Intl, Date, Set, console });
  return exports;
}
const generator = load('src/lib/perso/children-sync.ts');
const virtualId = 'children-virtual-2026-09';

function setup(self = 'person_1') {
  const db = {
    personal_settings: [{ owner_id: 'owner', children_sync_enabled: true, children_sync_account_id: 'account', children_sync_day: 5, children_sync_person: self }],
    children_settings: [{ owner_id: 'owner', person_1_name: 'A', person_2_name: 'B', income_person_1: 2000, income_person_2: 2000 }],
    children_expenses: [{ owner_id: 'owner', school_year_start: 2026, label: 'École', amount: 200, annual_amount: null, smooth_annual: false, start_month: '2026-09-01', end_month: '2027-08-01', paid_by: 'person_1' }],
    personal_movements: [],
  };
  const sources = JSON.stringify([db.children_settings, db.children_expenses]);
  const writes = [];
  let sequence = 0;
  let readError = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from(table) {
      let operation = 'select', payload, single = false;
      const predicates = [];
      const query = {
        select() { return query; },
        eq(key, value) { predicates.push(row => row[key] === value); return query; },
        neq(key, value) { predicates.push(row => row[key] !== value); return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        insert(value) { operation = 'insert'; payload = value; return query; },
        update(value) { operation = 'update'; payload = value; return query; },
        delete() { operation = 'delete'; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (operation === 'select' && readError === table) return { data: null, error: { message: 'read failed' } };
            let rows = db[table].filter(row => predicates.every(predicate => predicate(row)));
            if (operation !== 'select') {
              assert.equal(table, 'personal_movements', 'Source tables must never be written');
              writes.push(operation);
            }
            if (operation === 'insert') {
              if (db[table].some(row => row.owner_id === payload.owner_id && row.source_type === payload.source_type && row.source_key === payload.source_key)) {
                return { data: null, error: { code: '23505', message: 'duplicate source' } };
              }
              rows = [{ id: `persisted-${++sequence}`, ...payload }];
              db[table].push(...rows);
            } else if (operation === 'update') rows.forEach(row => Object.assign(row, payload));
            else if (operation === 'delete') db[table] = db[table].filter(row => !rows.includes(row));
            return { data: single ? (rows[0] ? { ...rows[0] } : null) : rows.map(row => ({ ...row })), error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const revalidated = [];
  const actions = load('src/app/(app)/perso/actions.ts', {
    'next/cache': { revalidatePath: path => revalidated.push(path) },
    'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'), { url }); } },
    'next/headers': { headers: async () => new Headers({ referer: 'http://localhost/perso?vue=finances&month=2026-09' }) },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/perso/children-sync': generator,
  });
  const projected = () => generator.buildChildrenProjectedMovements({
    settings: db.children_settings[0], expenses: db.children_expenses, accountId: 'account', day: 5, self, enabled: true,
    existingSourceKeys: new Set(db.personal_movements.map(row => row.source_key)),
  });
  return { db, actions, projected, revalidated, writes, setReadError: table => { readError = table; },
    assertSources: () => assert.equal(JSON.stringify([db.children_settings, db.children_expenses]), sources) };
}
async function invoke(promise, success = true) {
  await assert.rejects(promise, error => Boolean(error.url && error.url.includes(success ? 'succes=' : 'erreur=')));
}
function edit(id) {
  const form = new FormData();
  Object.entries({ id, label: 'Régularisation ajustée', amount: '75.50', movement_date: '2026-10-12', account_id: 'other-account', category_id: 'category', exclude_from_analysis: 'on' }).forEach(([key, value]) => form.set(key, value));
  return form;
}

for (const [self, type] of [['person_1', 'income'], ['person_2', 'expense']]) {
  test(`pointage/dépointage ${type}: même statut et dates que les mouvements ordinaires`, async () => {
    const s = setup(self);
    await invoke(s.actions.toggleMovement(virtualId, true));
    const row = s.db.personal_movements[0];
    assert.equal(row.movement_type, type);
    assert.equal(row.amount, 100);
    assert.equal(row.status, 'completed');
    assert.match(row.completed_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(row.completed_at);
    assert.ok(!s.projected().some(row => row.source_key === 'children:2026-09'));
    await invoke(s.actions.toggleMovement(row.id, false));
    assert.equal(row.status, 'planned');
    assert.equal(row.completed_date, null);
    assert.equal(row.completed_at, null);
    assert.equal(s.db.personal_movements.length, 1);
    assert.equal(s.revalidated.length, 2);
    s.assertSources();
  });
}

test('modification avant pointage, changement de mois et décochage conservent les champs et la clé d’origine', async () => {
  const s = setup();
  await invoke(s.actions.updateMovement(edit(virtualId)));
  const row = s.db.personal_movements[0];
  assert.equal(row.amount, 75.5);
  assert.equal(row.label, 'Régularisation ajustée');
  assert.equal(row.movement_date, '2026-10-12');
  assert.equal(row.account_id, 'other-account');
  assert.equal(row.category_id, 'category');
  assert.equal(row.exclude_from_analysis, true);
  assert.equal(row.source_key, 'children:2026-09');
  await invoke(s.actions.toggleMovement(virtualId, true)); // stale virtual form reuses the stored copy
  await invoke(s.actions.toggleMovement(row.id, false));
  assert.equal(row.amount, 75.5);
  assert.equal(row.movement_date, '2026-10-12');
  assert.equal(s.db.personal_movements.length, 1);
  s.assertSources();
  s.db.children_expenses[0].amount = 400;
  assert.ok(!s.projected().some(row => row.source_key === 'children:2026-09'));
  assert.equal(s.projected().find(row => row.source_key === 'children:2026-10').amount, 200);
  assert.equal(row.amount, 75.5);
});

for (const materialized of [false, true]) {
  test(`suppression ${materialized ? 'après modification' : 'virtuelle'}: jamais régénérée ou réactivée`, async () => {
    const s = setup();
    if (materialized) await invoke(s.actions.updateMovement(edit(virtualId)));
    await invoke(s.actions.deleteMovement(materialized ? s.db.personal_movements[0].id : virtualId));
    const row = s.db.personal_movements[0];
    assert.equal(row.status, 'cancelled');
    assert.equal(row.source_key, 'children:2026-09');
    assert.ok(!s.projected().some(row => row.source_key === 'children:2026-09'));
    await invoke(s.actions.toggleMovement(virtualId, true), false);
    await invoke(s.actions.toggleMovement(row.id, true));
    await invoke(s.actions.updateMovement(edit(row.id)), false);
    assert.equal(row.status, 'cancelled');
    assert.equal(s.db.personal_movements.length, 1);
    s.assertSources();
  });
}

test('deux pointages concurrents créent une seule occurrence', async () => {
  const s = setup();
  await Promise.all([invoke(s.actions.toggleMovement(virtualId, true)), invoke(s.actions.toggleMovement(virtualId, true))]);
  assert.equal(s.db.personal_movements.length, 1);
  assert.equal(s.db.personal_movements[0].status, 'completed');
  s.assertSources();
});

test('une erreur de lecture ENFANTS empêche toute matérialisation', async () => {
  const s = setup();
  s.setReadError('children_expenses');
  await invoke(s.actions.toggleMovement(virtualId, true), false);
  assert.equal(s.writes.length, 0);
});

test('la suppression générique conserve aussi la trace ENFANTS', async () => {
  const s = setup();
  await invoke(s.actions.toggleMovement(virtualId, true));
  await invoke(s.actions.deleteItem('personal_movements', s.db.personal_movements[0].id));
  assert.equal(s.db.personal_movements[0].status, 'cancelled');
  s.assertSources();
});

test('un mouvement déjà pointé reste gérable si la synchronisation ENFANTS est désactivée', async () => {
  const s = setup();
  s.db.personal_movements.push({ id: 'legacy', owner_id: 'owner', account_id: 'account', amount: 120, movement_type: 'income', movement_date: '2026-09-05', status: 'completed', source_type: 'children', source_key: 'children:2026-09' });
  s.db.personal_settings[0].children_sync_enabled = false;
  await invoke(s.actions.toggleMovement('legacy', false));
  await invoke(s.actions.updateMovement(edit('legacy')));
  assert.equal(s.db.personal_movements[0].amount, 75.5);
  assert.equal(s.db.personal_movements[0].status, 'planned');
  assert.ok(!s.projected().some(row => row.source_key === 'children:2026-09'));
  s.assertSources();
});

test('les mouvements ordinaires conservent leur pointage et leur suppression physique', async () => {
  const s = setup();
  s.db.personal_movements.push({ id: 'ordinary', owner_id: 'owner', account_id: 'account', amount: 100, movement_type: 'income', movement_date: '2026-09-05', status: 'planned' });
  await invoke(s.actions.toggleMovement('ordinary', true));
  await invoke(s.actions.toggleMovement(virtualId, true));
  const [ordinary, children] = s.db.personal_movements;
  for (const key of ['status', 'completed_date', 'movement_type', 'amount']) assert.equal(children[key], ordinary[key]);
  await invoke(s.actions.toggleMovement('ordinary', false));
  await invoke(s.actions.toggleMovement(children.id, false));
  for (const key of ['status', 'completed_date', 'completed_at']) assert.equal(children[key], ordinary[key]);
  await invoke(s.actions.deleteMovement('ordinary'));
  assert.equal(s.db.personal_movements.length, 1);
  assert.equal(s.db.personal_movements[0].id, children.id);
});
