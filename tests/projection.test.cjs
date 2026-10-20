const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./helpers/load-typescript.cjs');
const { buildReliableProjection: build } = load('src/lib/perso/reliable-projection-engine.ts');
const { recurrenceOccurrences, todayParis, accountingDate } = load('src/lib/perso/calendar.ts');
const round = n => Math.round(n * 100) / 100 || 0;
const base = () => ({
  accounts: [{ id: 'a', name: 'Courant A', account_type: 'checking', is_default: true }, { id: 'b', name: 'Courant B', account_type: 'checking' }, { id: 's', name: 'Épargne', account_type: 'savings' }],
  categories: [{ id: 'budget', name: 'Courses', parent_id: null, account_id: 'a', monthly_budget: 600, movement_type: 'expense' }, { id: 'child', name: 'Sous-catégorie', parent_id: 'budget', monthly_budget: 0 }],
  movements: [], recurrences: [], overrides: [], exclusions: [], photoPayments: [], urssafStates: [], savingsProposals: [], savingsBudgets: [], profiles: [],
  photoDefaultAccountId: 'a', movementDefaultAccountId: 'a', urssafDefaultAccountId: 'a',
  currentBalances: { a: 1000, b: 200, s: 1000 }, todayIso: '2026-09-16', months: 2,
});
const movement = (amount, status = 'completed', extra = {}) => ({ id: 'm', account_id: 'a', category_id: 'child', movement_type: 'expense', label: 'Test', amount, status, movement_date: '2026-09-10', completed_date: '2026-09-10', ...extra });
const recurrence = extra => ({ id: 'r', account_id: 'a', destination_account_id: null, category_id: 'child', movement_type: 'expense', label: 'Récurrence', amount: 100, frequency: 'monthly', interval_count: 1, annual_change_percent: 0, start_date: '2026-09-05', end_date: '2026-09-30', ...extra });
const profile = { id: 'p', label: 'Épargne', sourceAccountId: 'a', destinationAccountId: 's', threshold: 100 };
const monthOps = (r, month = '2026-09') => r.operations.filter(o => o.movement_date.startsWith(month));
const budget = r => r.budgetStatements.find(b => b.id === 'budget' && b.month === '2026-09');
const residual = r => round(monthOps(r).filter(o => o.source === 'budget').reduce((s, o) => s + o.amount, 0));
function invariant(input, result) {
  const initial = Object.values(input.currentBalances).reduce((a, b) => a + b, 0);
  const external = result.operations.filter(o => ['income', 'expense'].includes(o.movement_type))
    .reduce((sum, o) => sum + (o.movement_type === 'income' ? o.amount : -o.amount), 0);
  assert.equal(round(result.points.at(-1).total), round(initial + external), 'conservation de la trésorerie');
  const groups = new Map();
  for (const row of result.operations) if (row.transfer_group_id) {
    const list = groups.get(row.transfer_group_id) ?? []; list.push(row); groups.set(row.transfer_group_id, list);
  }
  for (const rows of groups.values()) {
    assert.equal(rows.length, 2); assert.equal(rows[0].amount, rows[1].amount);
    assert.equal(round(rows.reduce((sum, row) => sum + (row.movement_type === 'transfer_in' ? row.amount : -row.amount), 0)), 0);
  }
  for (const audit of result.audits) for (const account of input.accounts) {
    const id = account.id;
    assert.equal(round((audit.opening[id] ?? 0) + (audit.credits[id] ?? 0) - (audit.debits[id] ?? 0) + (audit.savingsUsed[id] ?? 0) + (audit.savingsDeposited[id] ?? 0)), audit.closing[id]);
  }
}
for (const [name, movements, expected] of [
  ['vierge', [], [0, 0, 600, 0, 600]],
  ['partiel', [movement(250)], [250, 0, 350, 0, 350]],
  ['total', [movement(600)], [600, 0, 0, 0, 0]],
  ['dépassé', [movement(700)], [700, 0, 0, 100, 0]],
  ['réalisé et engagé', [movement(250), movement(100, 'planned', { id: 'p' })], [250, 100, 250, 0, 350]],
  ['plusieurs dépenses', [movement(100), movement(150, 'completed', { id: 'm2' })], [250, 0, 350, 0, 350]],
  ['planned', [movement(250, 'planned')], [0, 250, 350, 0, 600]],
  ['cancelled', [movement(250, 'cancelled')], [0, 0, 600, 0, 600]],
  ['exclue de l’analyse', [movement(250, 'completed', { exclude_from_analysis: true })], [250, 0, 350, 0, 350]],
  ['prévue en août payée en septembre', [movement(250, 'completed', { movement_date: '2026-08-31', completed_date: '2026-09-02' })], [250, 0, 350, 0, 350]],
  ['arriéré prévu imputé à sa projection effective', [movement(250, 'planned', { movement_date: '2026-08-31' })], [0, 250, 350, 0, 600]],
  ['plusieurs comptes', [movement(100), movement(150, 'completed', { id: 'b', account_id: 'b' })], [250, 0, 350, 0, 350]],
]) test(`budget ${name}`, () => {
  const input = { ...base(), movements }; const result = build(input), b = budget(result);
  assert.deepEqual([b.realized, b.committed, b.uncommitted, b.overrun, b.futureTotal], expected);
  assert.equal(residual(result), b.uncommitted);
  assert.equal(result.audits[0].budgets[0], b, 'le contrôle partage le même objet que les cartes');
  assert.ok(!result.operations.some(o => movements.some(m => m.id === o.id && m.status === 'completed')));
  invariant(input, result);
});

test('aucun report : août ignoré et octobre repart à 600', () => {
  const result = build({ ...base(), movements: [movement(400, 'completed', { movement_date: '2026-08-02', completed_date: '2026-08-02' }), movement(250)] });
  assert.equal(budget(result).realized, 250); assert.equal(result.budgetStatements.find(b => b.month === '2026-10').initial, 600);
  assert.equal(result.budgetStatements.find(b => b.month === '2026-10').uncommitted, 600);
});

test('les filtres de comptes ne recalculent pas le bilan global', () => {
  const result = build({ ...base(), movements: [movement(250, 'planned', { account_id: 'b' })] });
  const before = JSON.stringify(result.budgetStatements);
  for (const accountId of ['a', 'b', 'all']) {
    const visible = result.operations.filter(o => accountId === 'all' || o.account_id === accountId);
    assert.ok(Array.isArray(visible)); assert.equal(budget(result).committed, 250); assert.equal(budget(result).uncommitted, 350);
  }
  assert.equal(JSON.stringify(result.budgetStatements), before);
});

test('occurrence matérialisée déplacée ne recrée pas son origine', () => {
  for (const status of ['planned', 'completed']) {
    const result = build({ ...base(), recurrences: [recurrence()], movements: [movement(100, status, { recurrence_id: 'r', occurrence_date: '2026-09-05', movement_date: '2026-09-08' })] });
    assert.equal(result.operations.filter(o => o.source === 'recurrence').length, 0);
  }
});

test('occurrence en retard conserve sa clé et se supprime par sa date d’origine', () => {
  const input = { ...base(), recurrences: [recurrence()] };
  const row = build(input).operations.find(o => o.source === 'recurrence');
  assert.equal(row.movement_date, '2026-09-16'); assert.equal(row.occurrence_date, '2026-09-05');
  assert.equal(build({ ...input, exclusions: [{ recurrence_id: 'r', occurrence_date: row.occurrence_date }] }).operations.filter(o => o.source === 'recurrence').length, 0);
});

for (const day of [29, 30, 31]) test(`calendrier ancré au ${day}, février et mars`, () => {
  assert.deepEqual(Array.from(recurrenceOccurrences(recurrence({ start_date: `2026-01-${day}`, end_date: null }), '2026-01-01', '2026-03-31')), [`2026-01-${day}`, '2026-02-28', `2026-03-${day}`]);
  assert.deepEqual(Array.from(recurrenceOccurrences(recurrence({ start_date: `2028-01-${day}`, end_date: null }), '2028-02-01', '2028-02-29')), ['2028-02-29']);
});

test('29 février annuel revient au 29 pendant l’année bissextile suivante', () => {
  const dates = recurrenceOccurrences(recurrence({ frequency: 'yearly', start_date: '2024-02-29', end_date: null }), '2025-01-01', '2028-12-31');
  assert.deepEqual(Array.from(dates), ['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
});
const pair = (amount, date = '2026-09-20') => [
  movement(amount, 'planned', { id: 'z-out', account_id: 's', movement_type: 'transfer_out', transfer_group_id: 'g', movement_date: date }),
  movement(amount, 'planned', { id: 'a-in', account_id: 'a', movement_type: 'transfer_in', transfer_group_id: 'g', movement_date: date }),
];

test('virement indivisible avec épargne insuffisante, indépendamment de l’ordre et des identifiants', () => {
  for (const rows of [pair(500), pair(500).reverse()]) {
    const input = { ...base(), categories: [], movements: rows, currentBalances: { a: 0, b: 0, s: 100 } };
    const result = build(input); invariant(input, result);
    assert.equal(result.operations[0].amount, 100); assert.equal(result.operations[1].amount, 100);
    assert.equal(result.operations[0].unfunded_amount, 400); assert.equal(result.points[0].balances.a, 100);
  }
});

test('aucune consommation budgétaire par un virement, virtuel ou matérialisé', () => {
  const recorded = build({ ...base(), movements: pair(100) });
  const virtual = build({ ...base(), recurrences: [recurrence({ movement_type: 'transfer', account_id: 's', destination_account_id: 'a' })] });
  assert.equal(budget(recorded).committed, 0); assert.equal(budget(virtual).committed, 0);
  assert.equal(residual(recorded), 600); assert.equal(residual(virtual), 600);
});

test('une vraie dépense d’épargne est intégrale et expose le déficit', () => {
  const input = { ...base(), categories: [], currentBalances: { a: 0, b: 0, s: 100 }, movements: [movement(500, 'planned', { account_id: 's' })] };
  const result = build(input); invariant(input, result);
  assert.equal(result.operations[0].amount, 500); assert.equal(result.audits[0].debits.s, 500);
  assert.equal(result.points[0].balances.s, -400); assert.ok(result.issues.length);
});

for (const day of ['02', '14', '15', '16', '28']) test(`besoin d’épargne détecté le ${day}`, () => {
  const input = { ...base(), categories: [], todayIso: `2026-09-${day}`, profiles: [profile], currentBalances: { a: 100, b: 0, s: 1000 }, movements: [movement(500, 'planned', { movement_date: `2026-09-${day}` })] };
  const result = build(input); invariant(input, result);
  const use = result.operations.find(o => o.savingsProposal?.kind === 'use');
  assert.ok(use); assert.equal(use.movement_date, input.todayIso); assert.equal(use.savingsProposal.decisionSlot, +day < 15 ? 1 : 15);
  assert.equal(result.points[0].balances.a, 100);
});

test('suppression persistante de la décision 15 même lorsque sa date affichée change', () => {
  const decision = { source_account_id: 's', destination_account_id: 'a', source_month: '2026-09-01', decision_slot: 15, amount: 0, status: 'deleted' };
  for (const day of ['16', '20']) {
    const result = build({ ...base(), categories: [], profiles: [profile], savingsProposals: [decision], todayIso: `2026-09-${day}`, currentBalances: { a: 100, b: 0, s: 1000 }, movements: [movement(500, 'planned', { movement_date: '2026-09-28' })] });
    assert.ok(!monthOps(result).some(o => o.source === 'savings')); assert.equal(result.savingsWarnings[0].missing, 500);
  }
});

test('décisions 1 et 15 indépendantes et anciennes suppressions mensuelles conservées', () => {
  const input = { ...base(), categories: [], todayIso: '2026-09-01', profiles: [profile], movements: [movement(1000, 'planned', { movement_type: 'income', movement_date: '2026-09-14' })], savingsProposals: [{ source_account_id: 'a', destination_account_id: 's', source_month: '2026-09-01', decision_slot: 1, amount: 0, status: 'deleted' }] };
  const result = build(input);
  assert.ok(!monthOps(result).some(o => o.savingsProposal?.decisionSlot === 1));
  assert.ok(monthOps(result).some(o => o.savingsProposal?.decisionSlot === 15));
  input.savingsProposals[0].decision_slot = 0;
  assert.ok(!monthOps(build(input)).some(o => o.source === 'savings'));
});

test('vrai creux intramensuel, clôture positive', () => {
  const input = { ...base(), categories: [], currentBalances: { a: 100, b: 0, s: 0 }, movements: [movement(500, 'planned', { movement_date: '2026-09-20' }), movement(1000, 'planned', { id: 'income', movement_type: 'income', movement_date: '2026-09-28' })] };
  const result = build(input); invariant(input, result);
  assert.equal(Math.min(...result.trajectory.map(p => p.balances.a)), -400); assert.equal(result.points[0].balances.a, 600);
});

test('ENFANTS virtuel puis pointé : ni perte ni double débit', () => {
  const row = movement(100, 'planned', { category_id: null, source_type: 'children', source_key: 'children:2026-09', virtual_source: true });
  const result = build({ ...base(), categories: [], movements: [row] });
  assert.equal(monthOps(result).length, 1);
  assert.equal(monthOps(build({ ...base(), categories: [], movements: [{ ...row, status: 'completed' }] })).length, 0);
});

test('photo et URSSAF ne sont projetés qu’une fois, overrides compris', () => {
  const photo = { id: 'photo', display_name: 'Test', wedding_date: null, payment_type: 'balance', amount: 1000, expected_date: '2026-09-20', received_date: null, status: 'expected', accounting_status: 'expected', personal_account_id: 'a' };
  const result = build({ ...base(), categories: [], photoPayments: [photo] });
  assert.equal(result.operations.filter(o => o.source === 'photo').length, 1);
  assert.equal(result.operations.find(o => o.id === 'urssaf-2026-10').amount, 216);
  const paid = build({ ...base(), categories: [], photoPayments: [{ ...photo, status: 'received' }], urssafStates: [{ contribution_month: '2026-10-01', account_id: 'a', is_completed: true, completed_date: '2026-09-15' }] });
  assert.ok(!paid.operations.some(o => o.source === 'photo' || o.id === 'urssaf-2026-10'));
});

test('horloge Paris et date comptable, indépendantes de TZ', () => {
  assert.equal(todayParis(new Date('2026-09-30T22:30:00Z')), '2026-10-01');
  assert.equal(accountingDate({ movement_date: '2026-08-31', completed_at: '2026-09-01T00:01:00Z' }), '2026-09-01');
});

test('invariant monétaire sur 100 scénarios déterministes de virements et flux externes', () => {
  let seed = 42; const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let index = 0; index < 100; index++) {
    const input = { ...base(), categories: [], profiles: index % 2 ? [profile] : [], currentBalances: { a: round(random() * 1000), b: 0, s: round(random() * 1000) }, movements: [
      ...pair(round(random() * 1500)), movement(round(random() * 500), 'planned', { id: 'expense', category_id: null, movement_date: '2026-09-25' }),
      movement(round(random() * 900), 'planned', { id: 'income', category_id: null, movement_type: 'income', movement_date: '2026-09-22' }),
    ] };
    invariant(input, build(input));
  }
});

test('une occurrence annulée conserve son identité sans recréation virtuelle', () => {
  const input = base(); input.recurrences = [recurrence({})];
  input.movements = [movement(100, 'cancelled', { recurrence_id: 'r', occurrence_date: '2026-09-05', movement_date: '2026-10-02' })];
  const result = build(input);
  assert.equal(result.operations.filter(o => o.recurrence_id === 'r').length, 0);
  assert.equal(budget(result).committed, 0);
});

test('montant dérogatoire limité au mois choisi, sans modifier le budget habituel', () => {
  const input = base();
  input.months = 3;
  input.categories[0].budget_overrides = [{ budget_month: '2026-10-01', amount: 800 }];
  input.movements = [movement(100, 'planned', { movement_date: '2026-10-15' })];
  const result = build(input);
  const rows = result.budgetStatements.filter(row => row.id === 'budget');
  assert.deepEqual(Array.from(rows, row => row.initial), [600, 800, 600]);
  assert.equal(rows[1].committed, 100);
  assert.equal(rows[1].uncommitted, 700);
  assert.equal(rows[1].futureTotal, 800);
  assert.equal(rows[1].base_amount, 600);
  assert.equal(rows[1].has_override, true);
  assert.equal(rows[0].has_override, false);
  assert.equal(input.categories[0].monthly_budget, 600);
  invariant(input, result);
});

test('une dérogation à zéro reste visible et ne supprime pas les dépenses engagées', () => {
  const input = base();
  input.categories[0].budget_overrides = [{ budget_month: '2026-09-01', amount: 0 }];
  input.movements = [movement(250), movement(100, 'planned', { id: 'planned' })];
  const row = budget(build(input));
  assert.deepEqual([row.initial, row.realized, row.committed, row.uncommitted, row.overrun, row.futureTotal], [0, 250, 100, 0, 350, 100]);
});

test('supprimer la dérogation rétablit le montant habituel sans report', () => {
  const input = base();
  input.categories[0].budget_overrides = [];
  const result = build(input);
  assert.equal(budget(result).initial, 600);
  assert.equal(budget(result).has_override, false);
  assert.equal(result.budgetStatements.find(row => row.month === '2026-10').initial, 600);
});

test('le bilan affiche le compte explicite ou le compte de rattachement par défaut', () => {
  const input = base();
  assert.equal(budget(build(input)).account_name, 'Courant A');
  input.categories[0].account_id = null;
  input.movementDefaultAccountId = 'b';
  assert.equal(budget(build(input)).account_id, 'b');
  assert.equal(budget(build(input)).account_name, 'Courant B');
});

const { savingsWarningMessage } = load('src/lib/perso/savings-warning.ts');
for (const [status, amount, savings, reason, applied] of [
  ['accepted', 887.41, 13990.75, 'accepted', 0],
  ['deleted', 0, 13990.75, 'deleted', 0],
  ['pending', 20, 13990.75, 'limited', 20],
  ['pending', 0, 13990.75, 'limited', 0],
  [null, 0, 50, 'insufficient', 20],
]) test(`alerte épargne distingue ${reason}, montant retenu ${amount}`, () => {
  const input = { ...base(), categories: [], months: 1, todayIso: '2026-10-19', profiles: [profile],
    currentBalances: { a: 100, b: 0, s: savings },
    savingsProposals: status ? [{ source_account_id: 's', destination_account_id: 'a', source_month: '2026-10-01', decision_slot: 15, amount, status, transfer_group_id: status === 'accepted' ? 'accepted-group' : null }] : [],
    movements: [movement(44.84, 'planned', { movement_date: '2026-10-28', category_id: null }),
      ...(status === 'accepted' ? ['transfer_out', 'transfer_in'].map((type, index) => movement(887.41, 'completed', {
        id: `accepted-${index}`, account_id: index ? 'a' : 's', movement_type: type, category_id: null,
        movement_date: '2026-10-17', completed_date: '2026-10-17', transfer_group_id: 'accepted-group',
      })) : [])],
  };
  const original = JSON.stringify(input), result = build(input), warning = result.savingsWarnings[0];
  assert.equal(warning.reason, reason); assert.equal(warning.required, 44.84);
  assert.equal(warning.available, round(savings - 30)); assert.equal(warning.applied, applied);
  assert.equal(warning.missing, round(44.84 - applied)); assert.equal(warning.date, '2026-10-19');
  assert.equal(warning.decisionSlot, 15); assert.equal(warning.needDate, '2026-10-28');
  const message = savingsWarningMessage(warning, 'Courant', 'Livret');
  assert.equal(message.title.includes('Épargne insuffisante'), reason === 'insufficient');
  assert.ok(message.detail.includes('reste à couvrir')); assert.ok(message.title.includes('28/10/2026'));
  if (reason === 'accepted') {
    assert.ok(message.detail.includes('Aucun virement supplémentaire'));
    assert.equal(result.operations.filter(o => o.movement_type.startsWith('transfer')).length, 0);
  }
  if (reason === 'deleted') assert.ok(message.detail.includes('supprimée'));
  assert.equal(JSON.stringify(input), original); invariant(input, result);
});

test('épargne suffisante sans décision antérieure couvre le besoin sans alerte', () => {
  const input = { ...base(), categories: [], months: 1, profiles: [profile], currentBalances: { a: 100, b: 0, s: 13990.75 },
    movements: [movement(44.84, 'planned', { movement_date: '2026-09-28' })] };
  const result = build(input);
  assert.equal(result.savingsWarnings.length, 0);
  assert.equal(result.operations.find(o => o.savingsProposal?.kind === 'use').amount, 44.84);
  invariant(input, result);
});

for (const [name, opening, retained, expected] of [
  ['besoin déjà présent', 80, 0, '2026-10-19'],
  ['premier creux avant le minimum', 100, 0, '2026-10-22'],
  ['complément partiel couvrant le premier creux', 100, 20, '2026-10-28'],
]) test(`date du besoin non couvert : ${name}`, () => {
  const input = { ...base(), categories: [], months: 1, todayIso: '2026-10-19', profiles: [profile],
    currentBalances: { a: opening, b: 0, s: 1000 },
    savingsProposals: [{ source_account_id: 's', destination_account_id: 'a', source_month: '2026-10-01', decision_slot: 15, amount: retained, status: retained ? 'pending' : 'deleted' }],
    movements: [movement(20, 'planned', { id: 'first', movement_date: '2026-10-22' }), movement(50, 'planned', { id: 'second', movement_date: '2026-10-28' })],
  };
  const result = build(input);
  assert.equal(result.savingsWarnings[0].needDate, expected);
  assert.equal(result.savingsWarnings[0].date, '2026-10-19');
  invariant(input, result);
});

function supplementInput(supplements = []) {
  return { ...base(), categories: [], months: 1, todayIso: '2026-10-19', profiles: [profile], currentBalances: { a: 100, b: 0, s: 1000 },
    savingsProposals: [{ id: 'decision', source_account_id: 's', destination_account_id: 'a', source_month: '2026-10-01', decision_slot: 15, amount: 800, status: 'accepted', transfer_group_id: 'original', supplements }],
    movements: [movement(44.84, 'planned', { id: 'future', movement_date: '2026-10-28' }),
      ...['transfer_out', 'transfer_in'].map((type, i) => movement(800, 'completed', { id: `original-${i}`, account_id: i ? 'a' : 's', movement_type: type, amount: 800, movement_date: '2026-10-17', completed_date: '2026-10-17', transfer_group_id: 'original' }))] };
}
test('un nouveau besoin après acceptation produit un complément indépendant', () => {
  const input = supplementInput(), before = JSON.stringify(input), result = build(input);
  const rows = result.operations.filter(o => o.savingsProposal);
  assert.equal(rows.length, 2); assert.equal(rows[0].amount, 44.84);
  assert.equal(rows[0].savingsProposal.parentDecisionId, 'decision');
  assert.equal(rows[0].savingsProposal.previousTransferGroupId, 'original');
  assert.equal(result.savingsWarnings.length, 0); assert.equal(JSON.stringify(input), before); invariant(input, result);
});
for (const [status, amount, projected, reason] of [['pending', 20, 20, 'limited'], ['deleted', 0, 0, 'deleted']]) {
  test(`complément ${status} conserve son identité et respecte la décision`, () => {
    const input = supplementInput([{ previous_transfer_group_id: 'original', status, amount, transfer_group_id: null }]);
    for (const todayIso of ['2026-10-19', '2026-10-23']) {
      const result = build({ ...input, todayIso });
      assert.equal(result.operations.find(o => o.savingsProposal)?.amount ?? 0, projected);
      assert.equal(result.savingsWarnings[0].reason, reason); invariant(input, result);
    }
  });
}
test('un complément accepté est compté dans le solde, jamais projeté deux fois', () => {
  const input = supplementInput([{ previous_transfer_group_id: 'original', status: 'accepted', amount: 44.84, transfer_group_id: 'supplement-1' }]);
  input.currentBalances.a += 44.84; input.currentBalances.s -= 44.84;
  input.movements.push(...['transfer_out', 'transfer_in'].map((type, i) => movement(44.84, 'completed', { id: `supplement-${i}`, account_id: i ? 'a' : 's', movement_type: type, movement_date: '2026-10-18', completed_date: '2026-10-18', transfer_group_id: 'supplement-1' })));
  assert.equal(build(input).operations.filter(o => o.savingsProposal).length, 0);
  input.movements[0].amount += 10;
  const result = build(input), next = result.operations.find(o => o.savingsProposal);
  assert.equal(next.amount, 10); assert.equal(next.savingsProposal.previousTransferGroupId, 'supplement-1'); invariant(input, result);
});
test('aucun complément automatique si migration absente ou ancien virement encore prévu/incomplet', () => {
  for (const variant of ['migration', 'planned', 'incomplete']) {
    const input = supplementInput();
    if (variant === 'migration') delete input.savingsProposals[0].supplements;
    if (variant === 'planned') input.movements.slice(1).forEach(m => { m.status = 'planned'; });
    if (variant === 'incomplete') input.movements.pop();
    assert.equal(build(input).operations.filter(o => o.savingsProposal).length, 0);
  }
});

test('compensation opt-in : compte non rattaché, débit/crédit égaux, aucun effet sur les entrées',()=>{
 const input={...base(),categories:[],currentBalances:{a:50,b:200,s:1000},movements:[movement(150,'planned',{category_id:null,movement_date:'2026-09-20'})]};
 const before=JSON.stringify(input),normal=build(input),sim=build({...input,simulateBalanceCompensation:true});
 assert.equal(normal.points[0].balances.a,-100);assert.equal(normal.compensationTransfers.length,0);
 assert.equal(sim.points[0].balances.a,0);assert.equal(sim.points[0].balances.s,900);
 assert.equal(sim.compensationTransfers[0].date,'2026-09-20');assert.equal(sim.compensationTransfers[0].amount,100);
 assert.equal(sim.operations.filter(o=>o.source==='compensation').length,2);
 assert.ok(sim.operations.filter(o=>o.source==='compensation').every(o=>!o.savingsProposal));
 assert.equal(JSON.stringify(input),before);invariant(input,sim);
 assert.equal(JSON.stringify(build(input)),JSON.stringify(normal));
});
test('compensation : épargne insuffisante et plancher conservé, manque visible',()=>{
 const input={...base(),categories:[],currentBalances:{a:0,b:0,s:80},movements:[movement(100,'planned',{category_id:null,movement_date:'2026-09-20'})],simulateBalanceCompensation:true};
 const result=build(input);assert.equal(result.points[0].balances.a,-50);assert.equal(result.points[0].balances.s,30);invariant(input,result);
});
test('compensation : plusieurs sources et destinations ne dépensent pas deux fois les mêmes fonds',()=>{
 const input={...base(),categories:[],accounts:[...base().accounts,{id:'t',name:'Autre épargne',account_type:'savings'}],currentBalances:{a:0,b:0,s:100,t:100},movements:[movement(100,'planned',{id:'a',category_id:null,movement_date:'2026-09-20'}),movement(100,'planned',{id:'b',account_id:'b',category_id:null,movement_date:'2026-09-20'})],simulateBalanceCompensation:true};
 const result=build(input);assert.equal(result.points[0].balances.a,0);assert.equal(result.points[0].balances.b,-60);assert.equal(result.points[0].balances.s,30);assert.equal(result.points[0].balances.t,30);invariant(input,result);
});
test('compensation respecte projets intouchables et ne contourne pas le rattachement habituel',()=>{
 const input={...base(),categories:[],currentBalances:{a:0,b:0,s:1000},savingsBudgets:[{id:'protected',account_id:'s',name:'Projet',kind:'project',allocation_mode:'amount',allocation_value:900,protection:'untouchable',allow_recovery:false}],movements:[movement(100,'planned',{category_id:null,movement_date:'2026-09-20'})],simulateBalanceCompensation:true};
 const result=build(input);assert.equal(result.points[0].balances.a,-30);assert.equal(result.points[0].balances.s,930);invariant(input,result);
 const linked=build({...input,profiles:[profile],savingsProposals:[{source_account_id:'s',destination_account_id:'a',source_month:'2026-09-01',decision_slot:15,status:'deleted',amount:0}]});
 assert.equal(linked.compensationTransfers.length,0);
});
test('compensation couvre un creux intramensuel après le 15 et reste conservatrice sur 1, 3 et 5 ans',()=>{
 for(const months of [12,36,60]){
 const input={...base(),categories:[],months,currentBalances:{a:100,b:0,s:1000},movements:[movement(500,'planned',{id:'expense',category_id:null,movement_date:'2026-09-20'}),movement(1000,'planned',{id:'income',movement_type:'income',category_id:null,movement_date:'2026-09-28'})],simulateBalanceCompensation:true};
 const result=build(input);assert.equal(result.compensationTransfers.length,1);assert.equal(result.compensationTransfers[0].amount,400);assert.equal(result.points[0].balances.a,1000);assert.equal(Math.min(...result.trajectory.map(p=>p.balances.a)),0);invariant(input,result);
 }
});
test('compensation respecte les propositions liées existantes puis mobilise uniquement une autre épargne',()=>{
 const input={...base(),categories:[],profiles:[{...profile,threshold:0}],accounts:[...base().accounts,{id:'t',name:'Autre',account_type:'savings'}],currentBalances:{a:0,b:0,s:80,t:500},movements:[movement(200,'planned',{category_id:null,movement_date:'2026-09-20'})],simulateBalanceCompensation:true};
 const result=build(input);assert.equal(result.compensationTransfers[0].sourceAccountId,'t');assert.equal(result.compensationTransfers[0].amount,150);assert.equal(result.points[0].balances.s,30);assert.equal(result.points[0].balances.a,0);invariant(input,result);
});
test('compensation : découvert initial couvert immédiatement et absence de crédit fictif depuis la crypto',()=>{
 const input={...base(),categories:[],currentBalances:{a:-100,b:0,s:200},simulateBalanceCompensation:true};
 const result=build(input);assert.equal(result.compensationTransfers[0].date,input.todayIso);assert.equal(Math.min(...result.trajectory.map(p=>p.balances.a)),0);invariant(input,result);
 const noSavings=build({...input,accounts:input.accounts.map(a=>a.id==='s'?{...a,account_type:'crypto'}:a)});
 assert.equal(noSavings.compensationTransfers.length,0);assert.equal(noSavings.points[0].balances.a,-100);
});
