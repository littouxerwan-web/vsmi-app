"use client";

import { useMemo, useState } from "react";
import { BarChart3, Repeat2, Scale, TrendingDown, TrendingUp, WalletCards } from "lucide-react";

type Movement={id:string;account_id:string;category_id?:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;transfer_group_id?:string|null};
type Category={id:string;name:string;parent_id?:string|null;is_essential?:boolean|null};
type Account={id:string;name:string;account_type:string};
type Period="month"|"1y"|"3y";
const euro=(n:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);
const pct=(n:number)=>new Intl.NumberFormat("fr-FR",{style:"percent",maximumFractionDigits:0}).format(n);
const startFor=(period:Period)=>{const d=new Date(); if(period==="month") d.setDate(1); else {d.setFullYear(d.getFullYear()-(period==="1y"?1:3)); d.setDate(d.getDate()+1);} return d.toISOString().slice(0,10)};

export function AnalysisView({movements,categories,accounts}:{movements:Movement[];categories:Category[];accounts:Account[]}){
 const [period,setPeriod]=useState<Period>("month"); const [accountId,setAccountId]=useState("all");
 const data=useMemo(()=>{
  const start=startFor(period), end=new Date().toISOString().slice(0,10);
  const catById=new Map(categories.map(c=>[c.id,c]));
  const root=(id?:string|null)=>{let c=id?catById.get(id):undefined; const seen=new Set<string>(); while(c?.parent_id&&!seen.has(c.id)){seen.add(c.id);c=catById.get(c.parent_id)} return c};
  const rows=movements.filter(m=>m.status==="completed"&&m.movement_date>=start&&m.movement_date<=end&&(accountId==="all"||m.account_id===accountId)&&!m.movement_type.startsWith("transfer"));
  const expenses=rows.filter(m=>m.movement_type==="expense"), incomes=rows.filter(m=>m.movement_type==="income");
  const totalExp=expenses.reduce((s,m)=>s+Number(m.amount),0), totalInc=incomes.reduce((s,m)=>s+Number(m.amount),0);
  const byCat=new Map<string,{name:string;amount:number;essential:boolean}>();
  for(const m of expenses){const c=root(m.category_id); const key=c?.id??"none", prev=byCat.get(key)??{name:c?.name??"Sans catégorie",amount:0,essential:Boolean(c?.is_essential)};prev.amount+=Number(m.amount);byCat.set(key,prev)}
  const ranked=[...byCat.values()].sort((a,b)=>b.amount-a.amount);
  const essential=ranked.filter(x=>x.essential).reduce((s,x)=>s+x.amount,0), variable=totalExp-essential;
  const months=Math.max(1,period==="month"?1:period==="1y"?12:36), avg=totalExp/months;
  const top5=ranked.slice(0,5).reduce((s,x)=>s+x.amount,0);
  const biggest=expenses.slice().sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,5);
  return {totalExp,totalInc,ranked,essential,variable,avg,top5,biggest,months};
 },[period,accountId,movements,categories]);
 const top=data.ranked[0]; const savingsPotential=data.variable*.1;
 return <div className="mt-5 space-y-5">
  <section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6">
   <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-500">Analyse des dépenses réelles</p><h2 className="mt-2 text-2xl font-semibold">Où part ton argent ?</h2><p className="mt-1 text-sm text-neutral-500">Uniquement les mouvements pointés comme effectués. Les virements internes sont exclus.</p></div>
   <div className="flex flex-wrap gap-2">{([['month','Mois'],['1y','1 an'],['3y','3 ans']] as const).map(([id,label])=><button key={id} onClick={()=>setPeriod(id)} className={`rounded-xl px-4 py-2 text-sm font-medium ${period===id?'bg-black text-white':'border border-black/10 bg-white'}`}>{label}</button>)}<select value={accountId} onChange={e=>setAccountId(e.target.value)} className="min-h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"><option value="all">Tous les comptes</option>{accounts.filter(a=>a.account_type==="checking").map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div></div>
  </section>
  <div className="grid gap-3 px-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-4 lg:px-6"><Metric icon={WalletCards} label="Dépenses" value={euro(data.totalExp)}/><Metric icon={TrendingUp} label="Revenus" value={euro(data.totalInc)}/><Metric icon={Scale} label="Solde de la période" value={euro(data.totalInc-data.totalExp)}/><Metric icon={BarChart3} label="Dépense moyenne / mois" value={euro(data.avg)}/></div>
  <div className="grid gap-5 px-3 sm:px-5 lg:grid-cols-2 lg:px-6">
   <Panel title="Postes les plus coûteux" subtitle="Catégories classées par dépenses"><div className="space-y-4">{data.ranked.slice(0,8).map((x,i)=><div key={x.name}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span><b>{i+1}.</b> {x.name}</span><span className="font-semibold">{euro(x.amount)} <span className="font-normal text-neutral-400">· {data.totalExp?pct(x.amount/data.totalExp):'0 %'}</span></span></div><div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-black" style={{width:`${data.totalExp?Math.max(2,x.amount/data.totalExp*100):0}%`}}/></div></div>)}{!data.ranked.length?<Empty/>:null}</div></Panel>
   <Panel title="Structure des dépenses" subtitle="Contraintes et dépenses arbitrables"><div className="space-y-4"><Split label="Dépenses essentielles" amount={data.essential} total={data.totalExp}/><Split label="Autres dépenses" amount={data.variable} total={data.totalExp}/><div className="rounded-2xl bg-neutral-50 p-4 text-sm"><p className="text-neutral-500">Concentration</p><p className="mt-1 font-semibold">Tes 5 premiers postes représentent {data.totalExp?pct(data.top5/data.totalExp):'0 %'} des dépenses.</p></div></div></Panel>
   <Panel title="Plus grosses dépenses" subtitle="Mouvements individuels sur la période"><div className="divide-y divide-black/10">{data.biggest.map(m=><div key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{m.label}</p><p className="text-xs text-neutral-500">{new Date(m.movement_date+'T12:00:00').toLocaleDateString('fr-FR')}</p></div><b>{euro(Number(m.amount))}</b></div>)}{!data.biggest.length?<Empty/>:null}</div></Panel>
   <Panel title="Leviers" subtitle="Repères calculés à partir de tes dépenses"><div className="space-y-3 text-sm">{top?<Insight icon={TrendingDown} title={`${top.name} est ton premier poste`} text={`${euro(top.amount)} sur la période, soit ${data.totalExp?pct(top.amount/data.totalExp):'0 %'} de tes dépenses.`}/>:null}<Insight icon={Repeat2} title="Effet d’une baisse de 10 % des dépenses arbitrables" text={`${euro(savingsPotential)} sur la période, soit environ ${euro(savingsPotential/data.months)} par mois.`}/><Insight icon={BarChart3} title="Moyenne mensuelle observée" text={`${euro(data.avg)} de dépenses par mois sur l’horizon sélectionné.`}/></div></Panel>
  </div>
 </div>
}
function Metric({icon:Icon,label,value}:{icon:any;label:string;value:string}){return <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-neutral-500"><Icon size={16}/><span className="text-xs font-medium">{label}</span></div><p className="mt-3 text-xl font-semibold">{value}</p></div>}
function Panel({title,subtitle,children}:{title:string;subtitle:string;children:any}){return <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm"><h3 className="text-lg font-semibold">{title}</h3><p className="mb-5 mt-1 text-sm text-neutral-500">{subtitle}</p>{children}</section>}
function Split({label,amount,total}:{label:string;amount:number;total:number}){return <div><div className="flex justify-between text-sm"><span>{label}</span><b>{euro(amount)} · {total?pct(amount/total):'0 %'}</b></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-black" style={{width:`${total?amount/total*100:0}%`}}/></div></div>}
function Insight({icon:Icon,title,text}:{icon:any;title:string;text:string}){return <div className="flex gap-3 rounded-2xl bg-neutral-50 p-4"><Icon className="mt-0.5 shrink-0" size={17}/><div><p className="font-semibold">{title}</p><p className="mt-1 leading-5 text-neutral-500">{text}</p></div></div>}
function Empty(){return <p className="py-6 text-center text-sm text-neutral-400">Pas encore assez de données sur cette période.</p>}
