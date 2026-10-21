const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {commonContributions}=require('./helpers/load-typescript.cjs')('src/lib/commun/budget.ts');
const cents=x=>Math.round(x*100);

test('CAF : les montants de la capture avec et sans déduction, puis réactivation',()=>{
 const base1=550.68/2+1650*20000/41871,base2=2200.68-base1;
 const amounts=[419.82,572.08];
 const enabled=commonContributions(base1,base2,...amounts);
 assert.equal(cents(enabled.contribution1),64365);
 assert.equal(cents(enabled.contribution2),56513);
 assert.equal(cents(enabled.contribution1+enabled.contribution2+991.90),220068);
 const disabled=commonContributions(base1,base2,...amounts,false);
 assert.equal(cents(disabled.contribution1),106347);
 assert.equal(cents(disabled.contribution2),113721);
 assert.equal(disabled.appliedCaf1+disabled.appliedCaf2,0);
 assert.deepEqual(commonContributions(base1,base2,...amounts,true),enabled);
});

test('CAF : pas de versement négatif et aucune déduction lorsque désactivée',()=>{
 assert.equal(commonContributions(100,200,150,0,true).contribution1,0);
 assert.equal(commonContributions(100,200,150,0,false).contribution1,100);
});

for(const include of [true,false]) test(`CAF : enregistrement ${include?'coché':'décoché'} sans effacer les montants`,async()=>{
 let saved;
 const client={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from:table=>{
  assert.equal(table,'common_settings');
  return {upsert:async row=>{saved=row;return {error:null};}};
 }};
 const imports={
  'next/cache':{revalidatePath(){}},
  'next/navigation':{redirect:url=>{throw Object.assign(new Error('redirect'),{url});}},
  'next/headers':{headers:async()=>new Headers({referer:"https://vsmi.example/commun?vue=budget"})},
  '@/lib/supabase/server':{createClient:async()=>client},
 };
 const exports={};
 const code=ts.transpileModule(fs.readFileSync('src/app/(app)/commun/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in imports);return imports[name];},URL,Date,Intl});
 const form=new FormData();
 Object.entries({income_n1_person_1:'20000',income_n1_person_2:'21871',caf_credit_amount:'991.90',caf_person_1_amount:'419.82',caf_person_2_amount:'572.08',return_view:'budget'}).forEach(([key,value])=>form.set(key,value));
 if(include)form.set('include_caf_in_budget','true');
 await assert.rejects(exports.saveCommonSettings(form),error=>error.url?.includes('vue=budget')&&error.url.includes('succes='));
 assert.equal(saved.include_caf_in_budget,include);
 assert.equal(saved.caf_credit_amount,991.90);
 assert.equal(saved.caf_person_1_amount,419.82);
 assert.equal(saved.caf_person_2_amount,572.08);
});
