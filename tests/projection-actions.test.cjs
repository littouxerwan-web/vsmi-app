// Exercises the real server action/RPC boundary; no network or production writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const load = require('./helpers/load-typescript.cjs');
function setup(error = null) {
  const calls = [];
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    rpc: async (name, payload) => { calls.push({ name, payload }); return { error }; },
    from: () => { throw new Error('Les deux jambes doivent être traitées par une seule transaction RPC'); } };
  const imports = {
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'), { url }); } },
    'next/headers': { headers: async () => new Headers() },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/perso/children-sync': load('src/lib/perso/children-sync.ts'),
    '@/lib/perso/calendar': load('src/lib/perso/calendar.ts'),
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync('src/app/(app)/perso/actions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => { assert.ok(name in imports); return imports[name]; }, FormData, URL, Intl, Date, Set, console });
  return { calls, actions: exports };
}
function form(slot) {
  const fd = new FormData();
  Object.entries({ source_account_id: 's', destination_account_id: 'a', source_month: '2026-09', proposal_date: '2026-09-28', decision_slot: String(slot), amount: '120.50', return_view: 'projection' }).forEach(([k,v]) => fd.set(k,v));
  return fd;
}
for (const [action, operation] of [['acceptSavingsProposal', 'accept'], ['updateSavingsProposalAmount', 'update'], ['deleteSavingsProposal', 'delete']]) {
  test(`${operation} : une transaction et une identité persistante distincte pour le 1 et le 15`, async () => {
    const s = setup();
    for (const slot of [1,15]) {
      await assert.rejects(s.actions[action](form(slot)), e => Boolean(e.url?.includes('succes=')));
      const call = s.calls.at(-1);
      assert.equal(call.name, 'mutate_personal_savings_decision');
      assert.equal(call.payload.p_slot, slot);
      assert.equal(call.payload.p_month, '2026-09-01');
      assert.equal(call.payload.p_action, operation);
      assert.equal(call.payload.p_amount, operation === 'delete' ? 0 : 120.5);
    }
    assert.equal(s.calls.length, 2);
  });
}
test('un refus SQL de fonds insuffisants est remonté, sans écriture de secours', async () => {
  const s = setup({ message: 'Fonds insuffisants' });
  await assert.rejects(s.actions.acceptSavingsProposal(form(15)), e => Boolean(e.url?.includes('erreur=')));
  assert.equal(s.calls.length, 1);
});
