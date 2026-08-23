"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, PiggyBank, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { createSavingsBudget, deleteSavingsBudget, updateSavingsBudget } from "@/app/(app)/perso/actions";
import { mobilizableSavingsForAccount, savingsAvailabilityForAccount, savingsBudgetAmount, savingsProjectAmountForAccount, type SavingsBudgetAllocation } from "@/lib/perso/savings-engine";

type Account={id:string;name:string;account_type:"checking"|"savings"|"crypto";color?:string|null};
type ForecastRow={month:string;accountId:string;savings:number;savingsUsed:number;proposal?:number;proposalDate?:string|null;savingsUseDate?:string|null};
type GoalMovement={savings_budget_id?:string|null;movement_type:string;amount:number;movement_date:string;status:string};
type GoalRecurrence={id:string;savings_budget_id?:string|null;movement_type:string;amount:number;frequency:string;interval_count:number;start_date:string;end_date?:string|null;is_active?:boolean};
type Props={accounts:Account[];budgets:SavingsBudgetAllocation[];currentBalances:Record<string,number>;forecastRows:ForecastRow[];movements?:GoalMovement[];recurrences?:GoalRecurrence[]};
type BudgetPoint={date:string;total:number;mobile:number;budgetValues:Record<string,number>};

const GLOBAL="__global__";
const FLOOR=30;
const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(v);
const monthLabel=(v:string)=>new Intl.DateTimeFormat("fr-FR",{month:"short",year:"2-digit"}).format(new Date(`${v}-01T12:00:00`));
const dateLabel=(v:string)=>new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${v}T12:00:00`));
const iso=(d:Date)=>d.toISOString().slice(0,10);
const PALETTE=["#2563eb","#7c3aed","#db2777","#ea580c","#0891b2","#65a30d","#b91c1c","#4f46e5","#0f766e","#a16207","#9333ea","#0369a1"];
const addMonths=(month:string,n:number)=>{const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7);};

export function SavingsBudgetView({accounts,budgets,currentBalances,forecastRows,movements=[],recurrences=[]}:Props){
 const savingsAccounts=accounts.filter(a=>a.account_type==="savings");
 const [accountId,setAccountId]=useState(GLOBAL);
 const global=accountId===GLOBAL;
 const selected=global?null:savingsAccounts.find(a=>a.id===accountId)??null;
 const scopedAccounts=global?savingsAccounts:selected?[selected]:[];
 const scopedIds=new Set(scopedAccounts.map(a=>a.id));
 const scopedBudgets=budgets.filter(b=>scopedIds.has(b.account_id));
 const projectBudgets=scopedBudgets.filter(b=>b.kind==="project");
 const standardBudgets=scopedBudgets.filter(b=>b.kind!=="project");
 const balanceFor=(id:string)=>Math.max(0,Number(currentBalances[id]??0));
 const currentSavings=scopedAccounts.reduce((s,a)=>s+balanceFor(a.id),0);
 const allocated=scopedBudgets.reduce((s,b)=>s+savingsBudgetAmount(b,balanceFor(b.account_id),budgets),0);
 const projectsAllocated=projectBudgets.reduce((s,b)=>s+savingsBudgetAmount(b,balanceFor(b.account_id),budgets),0);
 const standardAllocated=standardBudgets.reduce((s,b)=>s+savingsBudgetAmount(b,balanceFor(b.account_id),budgets),0);
 const availability=scopedAccounts.reduce((acc,a)=>{const v=savingsAvailabilityForAccount(balanceFor(a.id),a.id,budgets,FLOOR);acc.mobilizable+=v.mobilizable;acc.free+=v.free;acc.untouchable+=v.untouchable;acc.usable+=v.totalUsable;return acc;},{mobilizable:0,free:0,untouchable:0,usable:0});
 const mobilizable=availability.usable;
 // Les enveloppes ventilent le solde total. Le plancher de 30 € limite ce qui est
 // mobilisable, mais ne doit pas déclencher une fausse sur-affectation à 100 %.
 const overAllocated=Math.max(0,Math.round((allocated-currentSavings)*100)/100);
 const hasOverAllocation=overAllocated>0.02;

 const series=useMemo<BudgetPoint[]>(()=>{
  if(!scopedAccounts.length)return [];
  const startDate=new Date();startDate.setHours(12,0,0,0);
  const endDate=new Date(startDate);endDate.setFullYear(endDate.getFullYear()+5);
  const balances=new Map(scopedAccounts.map(a=>[a.id,balanceFor(a.id)]));
  const events=new Map<string,Map<string,number>>();
  const addEvent=(date:string|undefined|null,account:string,delta:number)=>{if(!date||!account||!Number.isFinite(delta)||Math.abs(delta)<0.005)return;const byAccount=events.get(date)??new Map<string,number>();byAccount.set(account,(byAccount.get(account)??0)+delta);events.set(date,byAccount);};
  for(const row of forecastRows){
   if(!scopedIds.has(row.accountId))continue;
   addEvent(row.proposalDate,row.accountId,Number(row.proposal??0));
   addEvent(row.savingsUseDate,row.accountId,-Number(row.savingsUsed??0));
  }
  const monthlyTargets=new Map(forecastRows.filter(r=>scopedIds.has(r.accountId)).map(r=>[`${r.accountId}:${r.month}`,Number(r.savings)]));
  const out:BudgetPoint[]=[];
  let day=new Date(startDate);
  while(day<=endDate){
   const date=iso(day),month=date.slice(0,7);
   const dayEvents=events.get(date);
   if(dayEvents)for(const [account,delta] of dayEvents)balances.set(account,Math.max(FLOOR,Math.round(((balances.get(account)??0)+delta)*100)/100));
   const tomorrow=new Date(day);tomorrow.setDate(tomorrow.getDate()+1);
   if(tomorrow.getMonth()!==day.getMonth()){
    // Le moteur calculateSavingsPlan reste l'autorité sur le solde de fin de mois.
    // Ce recalage garantit que la trajectoire journalière rejoint exactement la
    // Projection à chaque clôture mensuelle, tout en positionnant les variations
    // aux vraies dates de versement/utilisation dans le mois.
    for(const account of scopedAccounts){const target=monthlyTargets.get(`${account.id}:${month}`);if(Number.isFinite(target))balances.set(account.id,Math.max(FLOOR,Number(target)));}
   }
   const total=scopedAccounts.reduce((sum,a)=>sum+(balances.get(a.id)??0),0);
   const mobile=scopedAccounts.reduce((sum,a)=>sum+mobilizableSavingsForAccount(balances.get(a.id)??0,a.id,budgets,FLOOR),0);
   const budgetValues:Record<string,number>={};
   for(const budget of scopedBudgets)budgetValues[budget.id]=savingsBudgetAmount(budget,balances.get(budget.account_id)??0,budgets);
   out.push({date,total,mobile,budgetValues});
   day=tomorrow;
  }
  return out;
 },[accountId,forecastRows,budgets,currentBalances,accounts]);

 return <div className="perso-savings-budget-view mt-5 space-y-5">
  <section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6">
   <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
    <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-500">Organisation de l’épargne</p><h2 className="mt-2 text-xl font-semibold">Budgets Épargne</h2><p className="mt-1 max-w-3xl text-sm text-neutral-500">Les budgets d’épargne organisent la trésorerie disponible. Les achats à préparer sont isolés dans le bloc « Projet » : les sommes qui leur sont affectées sont retirées de l’assiette utilisée pour calculer les autres budgets en pourcentage. Le plancher de {money(FLOOR)} par compte reste protégé.</p></div>
    <select value={accountId} onChange={e=>setAccountId(e.target.value)} className="min-h-11 rounded-xl border px-3"><option value={GLOBAL}>Vue globale · tous les comptes épargne</option>{savingsAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
   </div>
   {!savingsAccounts.length?<p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Crée d’abord un compte d’épargne.</p>:<>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric label={global?"Épargne totale globale":"Épargne totale"} value={money(currentSavings)}/><Metric label="Budgets hors projets" value={money(standardAllocated)}/><Metric label="Affecté aux projets" value={money(projectsAllocated)}/><Metric label="Épargne mobilisable" value={money(availability.mobilizable)} dark/><Metric label="Libre en relais" value={money(availability.free)}/><Metric label="Intouchable" value={money(availability.untouchable)}/></div>
    {hasOverAllocation?<div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle size={17}/><p>Les enveloppes dépassent l’épargne disponible de {money(overAllocated)}.</p></div>:null}
    {global?<div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{savingsAccounts.map(a=>{const b=balanceFor(a.id),v=savingsAvailabilityForAccount(b,a.id,budgets,FLOOR),aff=budgets.filter(x=>x.account_id===a.id).reduce((s,x)=>s+savingsBudgetAmount(x,b,budgets),0);return <button key={a.id} type="button" onClick={()=>setAccountId(a.id)} className="rounded-2xl border border-black/10 p-4 text-left hover:bg-neutral-50"><div className="flex justify-between gap-3"><span className="font-medium">{a.name}</span><span className="font-semibold">{money(b)}</span></div><p className="mt-1 text-xs text-neutral-500">Affecté {money(aff)} · mobilisable {money(v.mobilizable)} · libre {money(v.free)} · intouchable {money(v.untouchable)}</p></button>})}</div>:null}
   </>}
  </section>

  {!global&&selected?<div className="space-y-5">
   <section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-500">Budgets d’épargne</p><h3 className="mt-1 text-lg font-semibold">Réserves et protections</h3><p className="mt-1 text-sm text-neutral-500">Les pourcentages sont calculés sur le solde du compte après déduction des sommes affectées aux projets.</p></div></div>
    <details className="mt-4"><summary className="flex cursor-pointer items-center gap-2 font-semibold"><Plus size={17}/>Créer un budget d’épargne</summary><SavingsBudgetForm accountId={selected.id} savings={balanceFor(selected.id)} forceKind="reserve" allBudgets={budgets}/></details>
    <div className="mt-5 grid gap-3 lg:grid-cols-2">{standardBudgets.length?standardBudgets.map(b=><BudgetCard key={b.id} budget={b} accountId={selected.id} savings={balanceFor(selected.id)} movements={movements} recurrences={recurrences} allBudgets={budgets}/>):<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Aucun budget hors projet : l’épargne non affectée reste disponible au-dessus du plancher.</div>}</div>
   </section>
   <section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6">
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="flex items-start gap-3"><Sparkles size={19}/><div><p className="font-semibold text-violet-950">Projet</p><p className="mt-1 text-sm text-violet-900">Prépare un achat avec un montant cible. Les virements ponctuels ou réguliers affectés au projet alimentent sa progression et ses dates prévisionnelles à 50 % et 100 %. Cette somme est exclue du calcul en % des autres budgets.</p></div></div></div>
    <details className="mt-4"><summary className="flex cursor-pointer items-center gap-2 font-semibold"><Plus size={17}/>Créer un projet</summary><SavingsBudgetForm accountId={selected.id} savings={balanceFor(selected.id)} forceKind="project" allBudgets={budgets}/></details>
    <div className="mt-5 grid gap-3 lg:grid-cols-2">{projectBudgets.length?projectBudgets.map(b=><BudgetCard key={b.id} budget={b} accountId={selected.id} savings={balanceFor(selected.id)} movements={movements} recurrences={recurrences} allBudgets={budgets}/>):<div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">Aucun projet pour ce compte d’épargne.</div>}</div>
   </section>
  </div>:global?<section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6"><div className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-4"><PiggyBank size={18}/><div><p className="font-medium">Vue globale</p><p className="mt-1 text-sm text-neutral-500">Sélectionne un compte pour gérer séparément ses budgets d’épargne et ses projets.</p></div></div></section>:null}

  {scopedAccounts.length?<section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6"><div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><p className="font-semibold text-sky-950">Projection future centralisée</p><p className="mt-1 text-sm text-sky-900">Les Budgets Épargne définissent uniquement les enveloppes, protections et montants mobilisables. La trajectoire future des soldes est désormais calculée exclusivement dans Projection afin d’éviter toute divergence entre deux moteurs.</p></div></section>:null}
 </div>;
}

function SavingsBudgetForm({accountId,savings,budget,forceKind,allBudgets=[]}:{accountId:string;savings:number;budget?:SavingsBudgetAllocation;forceKind?:"project"|"reserve";allBudgets?:SavingsBudgetAllocation[]}){
 const [kind,setKind]=useState<"project"|"reserve">(forceKind??budget?.kind??"reserve");
 const [mode,setMode]=useState<"amount"|"percent">(kind==="project"?"amount":budget?.allocation_mode??"amount");
 const [value,setValue]=useState(String(budget?.allocation_value??""));
 const numeric=Math.max(0,Number(value)||0);
 const projectAllocated=savingsProjectAmountForAccount(savings,accountId,allBudgets.filter(b=>b.id!==budget?.id));
 const percentBase=Math.max(0,savings-projectAllocated);
 const preview=mode==="percent"?Math.round((percentBase*Math.min(100,numeric)/100)*100)/100:numeric;
 const projectProtection=budget?.kind==="project"&&budget?.protection==="untouchable"?"untouchable":"free";
 return <form action={budget?updateSavingsBudget:createSavingsBudget} className="mt-4 grid gap-3 rounded-2xl bg-neutral-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
  {budget?<input type="hidden" name="id" value={budget.id}/>:null}
  <input type="hidden" name="account_id" value={accountId}/>
  {kind==="reserve"?<input type="hidden" name="protection" value="free"/>:null}
  {forceKind?<input type="hidden" name="kind" value={forceKind}/>:null}
  {kind==="project"?<input type="hidden" name="allocation_mode" value="amount"/>:null}
  <label className="text-xs text-neutral-600">Nom<input name="name" required defaultValue={budget?.name??""} placeholder="Vacances, sécurité…" className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label>
  {!forceKind?<label className="text-xs text-neutral-600">Type<select name="kind" value={kind} onChange={e=>{const next=e.target.value as "project"|"reserve";setKind(next);if(next==="project")setMode("amount")}} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="project">Projet</option><option value="reserve">Réserve</option></select></label>:<div className="rounded-xl border bg-white px-3 py-2 text-xs text-neutral-600"><span className="block">Type</span><strong className="mt-1 block text-sm text-neutral-900">{forceKind==="project"?"Projet":"Budget d’épargne"}</strong></div>}
  {kind==="project"?null:<label className="text-xs text-neutral-600">Mode<select name="allocation_mode" value={mode} onChange={e=>setMode(e.target.value as "amount"|"percent")} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="amount">Montant €</option><option value="percent">Pourcentage %</option></select></label>}
  <label className="text-xs text-neutral-600">{kind==="project"?"Déjà affecté au projet €":mode==="percent"?"Pourcentage":"Montant"}<input name="allocation_value" value={value} onChange={e=>setValue(e.target.value)} type="number" min={kind==="project"?"0":"0.01"} max={mode==="percent"?100:undefined} step="0.01" required className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/>{mode==="percent"?<span className="mt-1 block font-medium text-neutral-600">{numeric} % de {money(percentBase)} hors projets = {money(preview)}</span>:kind==="project"?<span className="mt-1 block text-neutral-500">Laisse 0 si le projet doit être alimenté uniquement par des virements affectés.</span>:null}</label>
  {kind==="project"?<label className="text-xs text-neutral-600">Protection<select name="protection" defaultValue={projectProtection} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="free">Libre · utilisable après la réserve</option><option value="untouchable">Intouchable · jamais utilisée</option></select></label>:<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><strong>Réserve</strong><span className="mt-1 block">Mobilisable immédiatement pour protéger la trésorerie.</span></div>}
  <label className="text-xs text-neutral-600">Seuil critique €<input name="critical_threshold" type="number" min="0" step="0.01" defaultValue={budget?.critical_threshold??0} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label>
  <label className="text-xs text-neutral-600">Objectif €<input name="target_amount" type="number" min="0" step="0.01" defaultValue={budget?.target_amount??""} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label>
  <label className="text-xs text-neutral-600">Date cible<input name="target_date" type="date" defaultValue={budget?.target_date??""} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label>
  <div className="flex items-end"><button className="min-h-10 rounded-xl bg-black px-4 text-sm font-medium text-white">{budget?"Enregistrer":"Créer"}</button></div>
 </form>;
}

function addFrequency(date:Date,frequency:string,interval:number){const d=new Date(date);const n=Math.max(1,interval||1);if(frequency==="weekly")d.setDate(d.getDate()+7*n);else if(frequency==="quarterly")d.setMonth(d.getMonth()+3*n);else if(frequency==="yearly")d.setFullYear(d.getFullYear()+n);else d.setMonth(d.getMonth()+n);return d;}
function projectedGoalDates(budget:SavingsBudgetAllocation,current:number,movements:GoalMovement[],recurrences:GoalRecurrence[]){
 const target=Math.max(0,Number(budget.target_amount??0)); if(!target)return {half:null,full:null};
 const events:{date:string;amount:number}[]=[]; const todayIso=iso(new Date());
 for(const m of movements)if(m.savings_budget_id===budget.id&&m.movement_type==="transfer_in"&&m.status!=="completed"&&m.status!=="cancelled"&&m.movement_date>=todayIso)events.push({date:m.movement_date,amount:Number(m.amount)||0});
 const horizon=new Date();horizon.setFullYear(horizon.getFullYear()+10);
 for(const r of recurrences)if(r.savings_budget_id===budget.id&&r.movement_type==="transfer"&&r.is_active!==false){let d=new Date(`${r.start_date}T12:00:00`);const end=r.end_date?new Date(`${r.end_date}T12:00:00`):horizon;while(d<=horizon&&d<=end){const di=iso(d);if(di>=todayIso)events.push({date:di,amount:Number(r.amount)||0});d=addFrequency(d,r.frequency,Number(r.interval_count)||1);}}
 events.sort((a,b)=>a.date.localeCompare(b.date)); let value=current; let half:string|null=value>=target*.5?todayIso:null; let full:string|null=value>=target?todayIso:null; for(const e of events){value+=e.amount;if(!half&&value>=target*.5)half=e.date;if(!full&&value>=target){full=e.date;break;}}return {half,full};
}
function BudgetCard({budget,accountId,savings,movements,recurrences,allBudgets}:{budget:SavingsBudgetAllocation;accountId:string;savings:number;movements:GoalMovement[];recurrences:GoalRecurrence[];allBudgets:SavingsBudgetAllocation[]}){
 const amount=savingsBudgetAmount(budget,savings,allBudgets); const target=Math.max(0,Number(budget.target_amount??0)); const progress=target?Math.min(100,(amount/target)*100):0; const dates=projectedGoalDates(budget,amount,movements,recurrences);
 const status=budget.kind==="reserve"?"Réserve · mobilisable immédiatement":budget.protection==="untouchable"?"Projet · Intouchable · jamais mobilisé":"Projet · Libre · utilisé après la réserve";
 return <details className="rounded-2xl border border-black/10 p-4"><summary className="cursor-pointer list-none"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-neutral-100">{budget.kind==="reserve"?<ShieldCheck size={15}/>:<Sparkles size={15}/>}</span><p className="font-semibold">{budget.name}</p></div><p className="mt-2 text-xs text-neutral-500">{status}</p>{target>0?<><div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-black" style={{width:`${progress}%`}}/></div><p className="mt-1 text-xs font-medium text-neutral-700">{money(amount)} / {money(target)} · {Math.round(progress)} %</p><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-neutral-50 p-2"><span className="text-neutral-500">50 % estimé</span><strong className="mt-1 block">{dates.half?dateLabel(dates.half):"Non déterminable"}</strong></div><div className="rounded-xl bg-neutral-50 p-2"><span className="text-neutral-500">100 % estimé</span><strong className="mt-1 block">{dates.full?dateLabel(dates.full):"Non déterminable"}</strong></div></div></>:null}</div><p className="font-semibold">{money(amount)}</p></div></summary><SavingsBudgetForm accountId={accountId} savings={savings} budget={budget} allBudgets={allBudgets}/><form action={deleteSavingsBudget.bind(null,budget.id)} className="mt-3"><button className="flex items-center gap-2 text-xs font-medium text-red-700"><Trash2 size={14}/>Supprimer cette enveloppe</button></form></details>;
}
function Metric({label,value,dark}:{label:string;value:string;dark?:boolean}){return <div className={`rounded-2xl p-4 ${dark?"bg-black text-white":"bg-neutral-100"}`}><p className="text-xs opacity-70">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>}

function SavingsBudgetChart({rows,budgets,accounts,global}:{rows:BudgetPoint[];budgets:SavingsBudgetAllocation[];accounts:Account[];global:boolean}){
 const [cursor,setCursor]=useState(0);
 if(rows.length<2)return null;
 const safe=Math.min(cursor,rows.length-1);
 const selectedRow=rows[safe];
 const values=[...rows.map(r=>r.total),...rows.map(r=>r.mobile),...budgets.flatMap(b=>rows.map(r=>Number(r.budgetValues[b.id]??0))),0];
 const rawMax=Math.max(...values),rawMin=Math.min(...values);
 let top=Math.ceil(rawMax/1000)*1000,bottom=Math.floor(rawMin/1000)*1000;
 if(top===bottom)top=bottom+1000;
 const range=Math.max(1000,top-bottom);
 const y=(v:number)=>90-((v-bottom)/range)*80;
 const x=(i:number)=>(i/Math.max(1,rows.length-1))*100;
 const pts=(values:number[])=>values.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
 const grids:number[]=[];
 for(let v=bottom;v<=top;v+=1000)grids.push(v);
 const cursorX=x(safe);

 return <div className="mt-5">
  <div className="flex flex-wrap gap-2 rounded-2xl border border-black/10 bg-white p-3">
   <LegendItem color="#111827" label="Épargne totale" value={money(selectedRow.total)} thick/>
   <LegendItem color="#16a34a" label="Mobilisable pour la trésorerie" value={money(selectedRow.mobile)} dashed/>
   {budgets.map((b,i)=>{
    const account=accounts.find(a=>a.id===b.account_id);
    const label=`${b.name}${global&&account?` · ${account.name}`:""}`;
    return <LegendItem key={b.id} color={PALETTE[i%PALETTE.length]} label={label} value={money(Number(selectedRow.budgetValues[b.id]??0))}/>;
   })}
  </div>

  <div className="mt-3 overflow-hidden rounded-2xl bg-neutral-50 p-3">
   <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
    <div>
     <p className="text-xs font-medium text-neutral-500">Position du curseur</p>
     <p className="text-base font-semibold">{dateLabel(selectedRow.date)}</p>
    </div>
    <p className="text-xs text-neutral-500">{dateLabel(rows[0].date)} → {dateLabel(rows.at(-1)!.date)}</p>
   </div>

   <svg viewBox="0 0 100 100" className="h-64 w-full" preserveAspectRatio="none" role="img" aria-label={`Projection des budgets épargne en ${dateLabel(selectedRow.date)}`}>
    {grids.map(v=><line key={v} x1="0" y1={y(v)} x2="100" y2={y(v)} stroke="currentColor" opacity=".11" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>)}
    <polyline points={pts(rows.map(r=>r.total))} fill="none" stroke="#111827" strokeWidth="2" opacity=".7" vectorEffect="non-scaling-stroke"/>
    <polyline points={pts(rows.map(r=>r.mobile))} fill="none" stroke="#16a34a" strokeWidth="2" strokeDasharray="4 2" vectorEffect="non-scaling-stroke"/>
    {budgets.map((b,i)=><polyline key={b.id} points={pts(rows.map(r=>Number(r.budgetValues[b.id]??0)))} fill="none" stroke={PALETTE[i%PALETTE.length]} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>)}
    <line x1={cursorX} y1="4" x2={cursorX} y2="94" stroke="#111827" strokeWidth="1.2" opacity=".6" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>
    <circle cx={cursorX} cy={y(selectedRow.total)} r="1.5" fill="#111827" vectorEffect="non-scaling-stroke"/>
    <circle cx={cursorX} cy={y(selectedRow.mobile)} r="1.5" fill="#16a34a" vectorEffect="non-scaling-stroke"/>
    {budgets.map((b,i)=><circle key={`cursor-${b.id}`} cx={cursorX} cy={y(Number(selectedRow.budgetValues[b.id]??0))} r="1.35" fill={PALETTE[i%PALETTE.length]} vectorEffect="non-scaling-stroke"/>)}
   </svg>

   <input
    type="range"
    min="0"
    max={rows.length-1}
    value={safe}
    onChange={e=>setCursor(Number(e.target.value))}
    className="mt-3 w-full accent-black"
    aria-label="Déplacer le curseur dans la projection des budgets épargne"
   />

   <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
    <div className="rounded-xl border border-black/10 bg-white p-3">
     <p className="text-xs text-neutral-500">Épargne totale</p>
     <p className="mt-1 font-semibold">{money(selectedRow.total)}</p>
    </div>
    <div className="rounded-xl border border-emerald-200 bg-white p-3">
     <p className="text-xs text-emerald-700">Mobilisable pour la trésorerie</p>
     <p className="mt-1 font-semibold text-emerald-700">{money(selectedRow.mobile)}</p>
    </div>
    {budgets.map((b,i)=>{
     const account=accounts.find(a=>a.id===b.account_id);
     return <div key={`value-${b.id}`} className="rounded-xl border border-black/10 bg-white p-3">
      <div className="flex items-center gap-2">
       <span className="block h-1 w-8 rounded-full" style={{backgroundColor:PALETTE[i%PALETTE.length]}}/>
       <p className="text-xs font-medium">{b.name}</p>
      </div>
      {global&&account?<p className="mt-1 text-[11px] text-neutral-500">{account.name}</p>:null}
      <p className="mt-1 font-semibold">{money(Number(selectedRow.budgetValues[b.id]??0))}</p>
     </div>;
    })}
   </div>
  </div>
 </div>;
}

function LegendItem({color,label,value,dashed=false,thick=false}:{color:string;label:string;value:string;dashed?:boolean;thick?:boolean}){
 return <div className="flex min-w-[210px] flex-1 items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2">
  <svg width="42" height="12" viewBox="0 0 42 12" className="shrink-0" aria-hidden="true">
   <line x1="1" y1="6" x2="41" y2="6" stroke={color} strokeWidth={thick?3:2.4} strokeDasharray={dashed?"7 4":undefined} strokeLinecap="round"/>
  </svg>
  <div className="min-w-0">
   <p className="truncate text-xs font-medium">{label}</p>
   <p className="text-sm font-semibold" style={{color}}>{value}</p>
  </div>
 </div>;
}

