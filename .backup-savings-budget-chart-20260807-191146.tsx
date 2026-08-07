"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, PiggyBank, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { applySavingsBudgetReallocation, createSavingsBudget, deleteSavingsBudget, updateSavingsBudget } from "@/app/(app)/perso/actions";
import { mobilizableSavingsForAccount, savingsBudgetAmount, type SavingsBudgetAllocation } from "@/lib/perso/savings-engine";

type Account={id:string;name:string;account_type:"checking"|"savings";color?:string|null};
type ForecastRow={month:string;accountId:string;savings:number;savingsUsed:number};
type Props={accounts:Account[];budgets:SavingsBudgetAllocation[];currentBalances:Record<string,number>;forecastRows:ForecastRow[]};
type BudgetPoint={month:string;total:number;mobile:number;budgetValues:Record<string,number>};

const GLOBAL="__global__";
const FLOOR=30;
const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(v);
const monthLabel=(v:string)=>new Intl.DateTimeFormat("fr-FR",{month:"short",year:"2-digit"}).format(new Date(`${v}-01T12:00:00`));
const protectionLabel=(v:string)=>v==="free"?"Libre":v==="untouchable"?"Intouchable":"À préserver";
const PALETTE=["#2563eb","#7c3aed","#db2777","#ea580c","#0891b2","#65a30d","#b91c1c","#4f46e5","#0f766e","#a16207","#9333ea","#0369a1"];
const addMonths=(month:string,n:number)=>{const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7);};

export function SavingsBudgetView({accounts,budgets,currentBalances,forecastRows}:Props){
 const savingsAccounts=accounts.filter(a=>a.account_type==="savings");
 const [accountId,setAccountId]=useState(GLOBAL);
 const global=accountId===GLOBAL;
 const selected=global?null:savingsAccounts.find(a=>a.id===accountId)??null;
 const scopedAccounts=global?savingsAccounts:selected?[selected]:[];
 const scopedIds=new Set(scopedAccounts.map(a=>a.id));
 const scopedBudgets=budgets.filter(b=>scopedIds.has(b.account_id));
 const balanceFor=(id:string)=>Math.max(0,Number(currentBalances[id]??0));
 const currentSavings=scopedAccounts.reduce((s,a)=>s+balanceFor(a.id),0);
 const allocated=scopedBudgets.reduce((s,b)=>s+savingsBudgetAmount(b,balanceFor(b.account_id)),0);
 const mobilizable=scopedAccounts.reduce((s,a)=>s+mobilizableSavingsForAccount(balanceFor(a.id),a.id,budgets,FLOOR),0);
 const protectedAmount=Math.max(0,currentSavings-(FLOOR*scopedAccounts.length)-mobilizable);
 const physical=Math.max(0,currentSavings-(FLOOR*scopedAccounts.length));
 const overAllocated=Math.max(0,allocated-physical);

 const series=useMemo<BudgetPoint[]>(()=>{
  if(!scopedAccounts.length)return [];
  const firstForecastMonth=forecastRows.map(r=>r.month).sort()[0]??new Date().toISOString().slice(0,7);
  const months=Array.from({length:60},(_,i)=>addMonths(firstForecastMonth,i));
  return months.map(month=>{
   const monthBalances=new Map<string,number>();
   for(const account of scopedAccounts){
    const row=forecastRows.find(r=>r.accountId===account.id&&r.month===month);
    const latestPrevious=forecastRows.filter(r=>r.accountId===account.id&&r.month<=month).sort((a,b)=>b.month.localeCompare(a.month))[0];
    monthBalances.set(account.id,Math.max(0,Number(row?.savings??latestPrevious?.savings??currentBalances[account.id]??0)));
   }
   const total=scopedAccounts.reduce((s,a)=>s+(monthBalances.get(a.id)??0),0);
   const mobile=scopedAccounts.reduce((s,a)=>s+mobilizableSavingsForAccount(monthBalances.get(a.id)??0,a.id,budgets,FLOOR),0);
   const budgetValues:Record<string,number>={};
   for(const budget of scopedBudgets)budgetValues[budget.id]=savingsBudgetAmount(budget,monthBalances.get(budget.account_id)??0);
   return {month,total,mobile,budgetValues};
  });
 },[accountId,forecastRows,budgets,currentBalances,accounts]);

 const allowed=scopedBudgets.filter(b=>b.allow_recovery&&b.protection!=="untouchable");
 const criticalThreshold=global?allowed.reduce((s,b)=>s+Number(b.critical_threshold??0),0):Math.max(0,...allowed.map(b=>Number(b.critical_threshold??0)));
 const firstCritical=criticalThreshold>0?series.find(r=>r.mobile<=criticalThreshold)??null:null;
 const fixedSource=scopedBudgets.filter(b=>!b.allow_recovery&&b.protection!=="untouchable"&&b.allocation_mode==="amount"&&Number(b.allocation_value)>0).sort((a,b)=>Number(a.priority??0)-Number(b.priority??0))[0]??null;
 const fixedDestination=scopedBudgets.filter(b=>b.allow_recovery&&b.protection!=="untouchable"&&b.allocation_mode==="amount").sort((a,b)=>Number(a.priority??0)-Number(b.priority??0))[0]??null;
 const suggestedAmount=firstCritical&&fixedSource&&fixedDestination&&fixedSource.account_id===fixedDestination.account_id?Math.min(Number(fixedSource.allocation_value),Math.max(100,criticalThreshold*1.5-firstCritical.mobile)):0;

 return <div className="mt-5 space-y-5">
  <section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6">
   <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
    <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-500">Organisation de l’épargne</p><h2 className="mt-2 text-xl font-semibold">Budgets Épargne</h2><p className="mt-1 max-w-3xl text-sm text-neutral-500">Les enveloppes sont une ventilation virtuelle. Sans enveloppe sur un compte, toute son épargne reste mobilisable, hors plancher de {money(FLOOR)}.</p></div>
    <select value={accountId} onChange={e=>setAccountId(e.target.value)} className="min-h-11 rounded-xl border px-3"><option value={GLOBAL}>Vue globale · tous les comptes épargne</option>{savingsAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
   </div>
   {!savingsAccounts.length?<p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Crée d’abord un compte d’épargne.</p>:<>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label={global?"Épargne totale globale":"Épargne totale"} value={money(currentSavings)}/><Metric label="Épargne affectée" value={money(allocated)}/><Metric label="Épargne protégée" value={money(protectedAmount)}/><Metric label="Mobilisable trésorerie" value={money(mobilizable)} dark/></div>
    {overAllocated>0?<div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle size={17}/><p>Les enveloppes dépassent l’épargne disponible de {money(overAllocated)}.</p></div>:null}
    {global?<div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{savingsAccounts.map(a=>{const b=balanceFor(a.id),mob=mobilizableSavingsForAccount(b,a.id,budgets,FLOOR),aff=budgets.filter(x=>x.account_id===a.id).reduce((s,x)=>s+savingsBudgetAmount(x,b),0);return <button key={a.id} type="button" onClick={()=>setAccountId(a.id)} className="rounded-2xl border border-black/10 p-4 text-left hover:bg-neutral-50"><div className="flex justify-between gap-3"><span className="font-medium">{a.name}</span><span className="font-semibold">{money(b)}</span></div><p className="mt-1 text-xs text-neutral-500">Affecté {money(aff)} · mobilisable {money(mob)}</p></button>})}</div>:null}
   </>}
  </section>

  {!global&&selected?<section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6"><details><summary className="flex cursor-pointer items-center gap-2 font-semibold"><Plus size={17}/>Créer une enveloppe</summary><SavingsBudgetForm accountId={selected.id} savings={balanceFor(selected.id)}/></details><div className="mt-5 grid gap-3 lg:grid-cols-2">{scopedBudgets.length?scopedBudgets.map(b=><BudgetCard key={b.id} budget={b} accountId={selected.id} savings={balanceFor(selected.id)}/>):<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Aucun budget d’épargne : toute l’épargne de ce compte peut être utilisée si la trésorerie l’exige.</div>}</div></section>:global?<section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6"><div className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-4"><PiggyBank size={18}/><div><p className="font-medium">Vue globale</p><p className="mt-1 text-sm text-neutral-500">Sélectionne un compte pour créer ou modifier ses enveloppes. Un pourcentage reste toujours calculé sur le solde de son propre compte.</p></div></div></section>:null}

  {scopedAccounts.length?<section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-500">Projection 5 ans</p><h2 className="mt-2 text-xl font-semibold">Évolution des Budgets Épargne</h2><p className="mt-1 text-sm text-neutral-500">Chaque enveloppe possède sa propre courbe. En vue globale, le nom du compte est indiqué dans la légende.</p></div><SavingsBudgetChart rows={series} budgets={scopedBudgets} accounts={accounts} global={global}/>{firstCritical?<div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4"><div className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 text-amber-700"/><div><p className="font-semibold text-amber-950">Seuil critique projeté en {monthLabel(firstCritical.month)}</p><p className="mt-1 text-sm text-amber-900">La capacité mobilisable descendrait à {money(firstCritical.mobile)} pour un seuil configuré de {money(criticalThreshold)}.</p></div></div>{suggestedAmount>0&&fixedSource&&fixedDestination?<form action={applySavingsBudgetReallocation} className="mt-4 flex flex-wrap items-end gap-2"><input type="hidden" name="source_budget_id" value={fixedSource.id}/><input type="hidden" name="destination_budget_id" value={fixedDestination.id}/><label className="text-xs font-medium text-neutral-600">Réaffectation proposée<input name="amount" type="number" min="1" step="0.01" defaultValue={suggestedAmount.toFixed(2)} className="mt-1 block w-36 rounded-xl border bg-white px-3 py-2 text-sm"/></label><div className="pb-2 text-sm"><strong>{fixedSource.name}</strong> <ArrowRight size={14} className="inline"/> <strong>{fixedDestination.name}</strong></div><button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white">Appliquer</button></form>:null}</div>:criticalThreshold>0?<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Aucun seuil critique détecté sur les 5 prochaines années.</div>:null}</section>:null}
 </div>;
}

function SavingsBudgetForm({accountId,savings,budget}:{accountId:string;savings:number;budget?:SavingsBudgetAllocation}){
 const [mode,setMode]=useState<"amount"|"percent">(budget?.allocation_mode??"amount");
 const [value,setValue]=useState(String(budget?.allocation_value??""));
 const numeric=Math.max(0,Number(value)||0);
 const preview=mode==="percent"?Math.round((savings*Math.min(100,numeric)/100)*100)/100:numeric;
 return <form action={budget?updateSavingsBudget:createSavingsBudget} className="mt-4 grid gap-3 rounded-2xl bg-neutral-50 p-4 sm:grid-cols-2 xl:grid-cols-4">{budget?<input type="hidden" name="id" value={budget.id}/>:null}<input type="hidden" name="account_id" value={accountId}/><label className="text-xs text-neutral-600">Nom<input name="name" required defaultValue={budget?.name??""} placeholder="Vacances, sécurité…" className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label><label className="text-xs text-neutral-600">Type<select name="kind" defaultValue={budget?.kind??"project"} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="project">Projet</option><option value="reserve">Réserve</option></select></label><label className="text-xs text-neutral-600">Mode<select name="allocation_mode" value={mode} onChange={e=>setMode(e.target.value as "amount"|"percent")} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="amount">Montant €</option><option value="percent">Pourcentage %</option></select></label><label className="text-xs text-neutral-600">{mode==="percent"?"Pourcentage":"Montant"}<input name="allocation_value" value={value} onChange={e=>setValue(e.target.value)} type="number" min="0.01" max={mode==="percent"?100:undefined} step="0.01" required className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/>{mode==="percent"?<span className="mt-1 block font-medium text-neutral-600">{numeric} % de {money(savings)} = {money(preview)}</span>:null}</label><label className="text-xs text-neutral-600">Protection<select name="protection" defaultValue={budget?.protection??"preserve"} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"><option value="free">Libre</option><option value="preserve">À préserver</option><option value="untouchable">Intouchable</option></select></label><label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm"><input name="allow_recovery" type="checkbox" defaultChecked={budget?.allow_recovery??false}/>Disponible pour utilisation d’épargne conseillée</label><label className="text-xs text-neutral-600">Seuil critique €<input name="critical_threshold" type="number" min="0" step="0.01" defaultValue={budget?.critical_threshold??0} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label><label className="text-xs text-neutral-600">Priorité<input name="priority" type="number" min="0" step="1" defaultValue={budget?.priority??0} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label><label className="text-xs text-neutral-600">Objectif €<input name="target_amount" type="number" min="0" step="0.01" defaultValue={budget?.target_amount??""} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label><label className="text-xs text-neutral-600">Date cible<input name="target_date" type="date" defaultValue={budget?.target_date??""} className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm"/></label><div className="flex items-end"><button className="min-h-10 rounded-xl bg-black px-4 text-sm font-medium text-white">{budget?"Enregistrer":"Créer"}</button></div></form>;
}

function BudgetCard({budget,accountId,savings}:{budget:SavingsBudgetAllocation;accountId:string;savings:number}){const amount=savingsBudgetAmount(budget,savings);return <details className="rounded-2xl border border-black/10 p-4"><summary className="cursor-pointer list-none"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-neutral-100">{budget.kind==="reserve"?<ShieldCheck size={15}/>:<Sparkles size={15}/>}</span><p className="font-semibold">{budget.name}</p></div><p className="mt-2 text-xs text-neutral-500">{budget.kind==="reserve"?"Réserve":"Projet"} · {protectionLabel(budget.protection)}{budget.allow_recovery&&budget.protection!=="untouchable"?" · mobilisable":""}</p>{budget.allocation_mode==="percent"?<p className="mt-1 text-xs font-medium text-neutral-700">{Number(budget.allocation_value)} % de {money(savings)} = {money(amount)}</p>:null}</div><p className="font-semibold">{money(amount)}</p></div></summary><SavingsBudgetForm accountId={accountId} savings={savings} budget={budget}/><form action={deleteSavingsBudget.bind(null,budget.id)} className="mt-3"><button className="flex items-center gap-2 text-xs font-medium text-red-700"><Trash2 size={14}/>Supprimer cette enveloppe</button></form></details>}
function Metric({label,value,dark}:{label:string;value:string;dark?:boolean}){return <div className={`rounded-2xl p-4 ${dark?"bg-black text-white":"bg-neutral-100"}`}><p className="text-xs opacity-70">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>}

function SavingsBudgetChart({rows,budgets,accounts,global}:{rows:BudgetPoint[];budgets:SavingsBudgetAllocation[];accounts:Account[];global:boolean}){
 if(rows.length<2)return null;
 const values=[...rows.map(r=>r.total),...rows.map(r=>r.mobile),...budgets.flatMap(b=>rows.map(r=>Number(r.budgetValues[b.id]??0))),0];
 const rawMax=Math.max(...values),rawMin=Math.min(...values);
 let top=Math.ceil(rawMax/1000)*1000,bottom=Math.floor(rawMin/1000)*1000;if(top===bottom)top=bottom+1000;
 const range=Math.max(1000,top-bottom),y=(v:number)=>90-((v-bottom)/range)*80;
 const pts=(values:number[])=>values.map((v,i)=>`${(i/Math.max(1,values.length-1))*100},${y(v)}`).join(" ");
 const grids:number[]=[];for(let v=bottom;v<=top;v+=1000)grids.push(v);
 return <div className="mt-5 overflow-hidden rounded-2xl bg-neutral-50 p-3"><svg viewBox="0 0 100 100" className="h-64 w-full" preserveAspectRatio="none">{grids.map(v=><line key={v} x1="0" y1={y(v)} x2="100" y2={y(v)} stroke="currentColor" opacity=".11" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>)}<polyline points={pts(rows.map(r=>r.total))} fill="none" stroke="#111827" strokeWidth="2" opacity=".7" vectorEffect="non-scaling-stroke"/><polyline points={pts(rows.map(r=>r.mobile))} fill="none" stroke="#16a34a" strokeWidth="2" strokeDasharray="4 2" vectorEffect="non-scaling-stroke"/>{budgets.map((b,i)=><polyline key={b.id} points={pts(rows.map(r=>Number(r.budgetValues[b.id]??0)))} fill="none" stroke={PALETTE[i%PALETTE.length]} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>)}</svg><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs"><span className="flex items-center gap-2"><i className="block h-0.5 w-5 bg-neutral-900"/>Épargne totale</span><span className="flex items-center gap-2 text-emerald-700"><i className="block h-0.5 w-5 bg-emerald-600"/>Mobilisable</span>{budgets.map((b,i)=>{const account=accounts.find(a=>a.id===b.account_id);return <span key={b.id} className="flex items-center gap-2"><i className="block h-0.5 w-5" style={{backgroundColor:PALETTE[i%PALETTE.length]}}/><span>{b.name}{global&&account?` · ${account.name}`:""}</span></span>})}<span className="ml-auto text-neutral-500">{monthLabel(rows[0].month)} → {monthLabel(rows.at(-1)!.month)}</span></div></div>;
}
