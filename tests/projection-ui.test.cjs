const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const react = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const loadLib = require('./helpers/load-typescript.cjs');
function viewModule(accountId, entry = "src/components/perso/projection-view.tsx") {
  const cache = new Map();
  const hookStates = new Map(); let hookIndex = 0;
  function load(file) {
    file = path.resolve(file); if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(source, { exports, Date, Intl, Map, Set, console, require: name => {
      if (name === 'react') return { ...react, useMemo: fn => fn(), useTransition: () => [false, () => {}], useState: initial => { const index = hookIndex++; if (!hookStates.has(index)) hookStates.set(index, initial === 'all' ? accountId : typeof initial === 'function' ? initial() : initial); return [hookStates.get(index), next => hookStates.set(index, typeof next === 'function' ? next(hookStates.get(index)) : next)]; } };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
      if (name === 'next/navigation') return { useRouter: () => ({ push() {} }) };
      if (name.includes('/perso/actions') || name.includes('/aujourd-hui/actions')) return new Proxy({}, { get: () => () => {} });
      if (name.startsWith('@/lib/perso/')) return loadLib(`src/${name.slice(2)}.ts`);
      if (name.startsWith('@/components/')) return load(`src/${name.slice(2)}.tsx`);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.tsx`));
      throw new Error(`Unexpected import ${name}`);
    } }, { filename: file });
    return exports;
  }
  const result = load(entry);
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, typeof value === "function" ? (...args) => { hookIndex = 0; return value(...args); } : value]));
}
function nodes(tree, predicate, out = []) {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, predicate, out));
  else if (tree && typeof tree === 'object') {
    if (predicate(tree)) out.push(tree);
    nodes(tree.props?.children, predicate, out);
  }
  return out;
}

test('les vraies cartes et le contrôle reçoivent le même bilan quel que soit le compte filtré', () => {
  const props = { todayIso: '2026-09-16', accounts: [{ id: 'a', name: 'A', account_type: 'checking' }, { id: 'b', name: 'B', account_type: 'checking' }],
    categories: [{ id: 'budget', name: 'Courses', parent_id: null, monthly_budget: 600, movement_type: 'expense', account_id: 'a' }], snapshots: [], recurrences: [],
    movements: [{ id: 'paid', account_id: 'b', category_id: 'budget', amount: 250, label: 'Courses', movement_type: 'expense', movement_date: '2026-08-30', completed_date: '2026-09-10', status: 'completed' },
      { id: 'planned', account_id: 'a', category_id: 'budget', amount: 100, label: 'Courses prévues', movement_type: 'expense', movement_date: '2026-09-20', status: 'planned' }],
    currentBalances: { a: 1000, b: 1000 } };
  for (const filter of ['all', 'a', 'b']) {
    const { ProjectionView } = viewModule(filter);
    const tree = ProjectionView(props);
    const cards = nodes(tree, node => typeof node.type === 'function' && node.type.name === 'BudgetStatements');
    assert.equal(cards.length, 2); // Control + monthly movements.
    assert.equal(cards[0].props.rows, cards[1].props.rows);
    const row = cards[0].props.rows[0];
    assert.deepEqual([row.realized, row.committed, row.uncommitted, row.futureTotal], [250, 100, 250, 350]);
    const markup = renderToStaticMarkup(cards[0]);
    assert.match(markup, /Réalisé/); assert.match(markup, /250/); assert.match(markup, /350/);
  }
});


test('le formulaire de budget porte le mois exact et affiche son compte et le retour au montant habituel', () => {
  const { BudgetStatements } = viewModule('all', 'src/components/perso/budget-statements.tsx');
  const row = { id: 'courses', name: 'Courses', month: '2026-10', account_id: 'a', account_name: 'Compte A',
    movement_type: 'expense', initial: 800, base_amount: 600, has_override: true,
    realized: 250, committed: 100, uncommitted: 450, overrun: 0, futureTotal: 550 };
  const tree = BudgetStatements({ rows: [row], editable: true });
  const forms = nodes(tree, node => node.type === 'form');
  assert.equal(forms.length, 2);
  for (const form of forms) {
    assert.equal(nodes(form, node => node.type === 'input' && node.props.name === 'budget_month')[0].props.value, '2026-10');
    assert.equal(nodes(form, node => node.type === 'input' && node.props.name === 'category_id')[0].props.value, 'courses');
  }
  assert.equal(nodes(forms[0], node => node.type === 'input' && node.props.name === 'amount')[0].props.defaultValue, 800);
  assert.equal(nodes(forms[1], node => node.type === 'input' && node.props.name === 'operation')[0].props.value, 'reset');
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /Compte A/);
  assert.match(markup, /octobre 2026/);
  assert.match(markup, /Revenir au montant habituel/);
  assert.equal(nodes(BudgetStatements({ rows: [row], editable: false }), node => node.type === 'form').length, 0);
});

test('Tous les comptes additionne les soldes à date, même négatifs, et non les soldes projetés', () => {
  const { AccountBalanceCards } = viewModule('all', 'src/components/perso/account-balance-cards.tsx');
  const accounts = [{ id: 'a', name: 'Courant', account_type: 'checking' }, { id: 's', name: 'Épargne', account_type: 'savings' }, { id: 'c', name: 'Crypto', account_type: 'crypto' }];
  const tree = AccountBalanceCards({ accounts, audits: [{ month: '2026-10', opening: { a: 9999 }, closing: { a: 7777 }, credits: {}, debits: {} }],
    operations: [], currentMonth: '2026-10', currentBalances: { a: -50, s: 1000, c: 25 } });
  const card = nodes(tree, node => node.type === 'button' && nodes(node, child => child.type === 'p' && child.props.children === 'Tous les comptes').length > 0)[0];
  assert.ok(card);
  const markup = renderToStaticMarkup(card);
  assert.match(markup, /975,00/);
  assert.match(markup, /Épargne incluse/);
  assert.doesNotMatch(markup, /7777|9999/);
});

test('les trois formulaires de complément transmettent son identité distincte', () => {
  const { ProjectionView }=viewModule('all');
  const props={todayIso:'2026-10-19',accounts:[{id:'a',name:'Courant',account_type:'checking'},{id:'s',name:'Livret',account_type:'savings'}],categories:[],snapshots:[],recurrences:[],currentBalances:{a:100,s:1000},profiles:[{id:'profile-1',sourceAccountId:'a',destinationAccountId:'s',threshold:100}],
    savingsProposals:[{id:'parent',source_account_id:'s',destination_account_id:'a',source_month:'2026-10-01',decision_slot:15,status:'accepted',amount:100,transfer_group_id:'previous',supplements:[]}],
    movements:[{id:'future',account_id:'a',movement_type:'expense',label:'Dépense',amount:30,movement_date:'2026-10-28',status:'planned',category_id:null},
      ...['transfer_out','transfer_in'].map((type,i)=>({id:`old-${i}`,account_id:i?'a':'s',movement_type:type,label:'Virement',amount:100,movement_date:'2026-10-17',completed_date:'2026-10-17',status:'completed',category_id:null,transfer_group_id:'previous'}))]};
  const tree=ProjectionView(props);
  const forms=nodes(tree,node=>node.type==='form').filter(form=>nodes(form,node=>node.type==='input'&&node.props.name==='parent_decision_id').length);
  assert.equal(forms.length,3);
  for(const form of forms){
    assert.equal(nodes(form,node=>node.props?.name==='parent_decision_id')[0].props.value,'parent');
    assert.equal(nodes(form,node=>node.props?.name==='previous_transfer_group_id')[0].props.value,'previous');
  }
});

test('la sélection du compte active une seule carte et rend Tous les comptes neutre', () => {
  const { AccountBalanceCards } = viewModule('all', 'src/components/perso/account-balance-cards.tsx');
  const accounts = [{ id: 'a', name: 'Courant', account_type: 'checking' }, { id: 's', name: 'Livret', account_type: 'savings' }];
  for (const selectedAccountId of [null, 'all', 'a', 's', 'inconnu']) {
    const tree = AccountBalanceCards({ accounts, audits: [], operations: [], currentMonth: '2026-10', currentBalances: {}, selectedAccountId });
    const cards = nodes(tree, node => node.props?.['aria-pressed'] !== undefined);
    assert.equal(cards.length, 3);
    assert.equal(cards.filter(card => card.props['aria-pressed']).length, 1);
    assert.equal(cards[0].props['aria-pressed'], !['a', 's'].includes(selectedAccountId));
    assert.equal(cards[1].props['aria-pressed'], selectedAccountId === 'a');
    assert.equal(cards[2].props['aria-pressed'], selectedAccountId === 's');
  }
});

test('la coche de compensation actualise le graphique puis restitue la projection normale sans formulaire de transfert fictif',()=>{
 const {ProjectionView}=viewModule('a');
 const props={todayIso:'2026-10-20',accounts:[{id:'a',name:'Courant',account_type:'checking'},{id:'s',name:'Épargne',account_type:'savings'}],categories:[],snapshots:[],recurrences:[],currentBalances:{a:50,s:1000},movements:[{id:'bill',account_id:'a',category_id:null,amount:150,label:'Dépense',movement_type:'expense',movement_date:'2026-10-25',status:'planned'}]};
 const chart=tree=>nodes(tree,n=>typeof n.type==='function'&&n.type.name==='ProjectionChart')[0];
 const toggle=tree=>nodes(tree,n=>n.type==='input'&&n.props.type==='checkbox'&&typeof n.props.checked==='boolean')[0];
 let tree=ProjectionView(props);assert.equal(chart(tree).props.values[0],-100);assert.equal(toggle(tree).props.checked,false);
 const originalForms=nodes(tree,n=>n.type==='form').length;
 toggle(tree).props.onChange({target:{checked:true}});tree=ProjectionView(props);
 assert.equal(chart(tree).props.values[0],0);assert.equal(chart(tree).props.savingsValues[0],900);assert.equal(chart(tree).props.baselineValues[0],-100);
 assert.equal(nodes(tree,n=>n.type==='form').length,originalForms);
 toggle(tree).props.onChange({target:{checked:false}});tree=ProjectionView(props);assert.equal(chart(tree).props.values[0],-100);assert.equal(chart(tree).props.savingsValues[0],1000);
});
