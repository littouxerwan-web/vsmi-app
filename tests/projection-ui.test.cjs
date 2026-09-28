const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const react = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const loadLib = require('./helpers/load-typescript.cjs');
function viewModule(accountId) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file); if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(source, { exports, Date, Intl, Map, Set, console, require: name => {
      if (name === 'react') return { ...react, useMemo: fn => fn(), useState: initial => [initial === 'all' ? accountId : typeof initial === 'function' ? initial() : initial, () => {}] };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
      if (name.includes('/perso/actions')) return new Proxy({}, { get: () => () => {} });
      if (name.startsWith('@/lib/perso/')) return loadLib(`src/${name.slice(2)}.ts`);
      if (name.startsWith('@/components/')) return load(`src/${name.slice(2)}.tsx`);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.tsx`));
      throw new Error(`Unexpected import ${name}`);
    } }, { filename: file });
    return exports;
  }
  return load('src/components/perso/projection-view.tsx');
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
