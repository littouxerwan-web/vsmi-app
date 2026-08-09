"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarRange, Repeat2, Scale, ShieldCheck, TrendingDown, TrendingUp, WalletCards } from "lucide-react";

type Movement={id:string;account_id:string;category_id?:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;transfer_group_id?:string|null;recurrence_id?:string|null;source?:string};
type Category={id:string;name:string;parent_id?:string|null;is_essential?:boolean|null;exclude_from_analysis?:boolean|null};
type Recurrence={id:string;is_essential?:boolean|null;exclude_from_analysis?:boolean|null};
type Account={id:string;name:string;account_type:string};
type Period="month"|"1y"|"3y";

const euro=(n:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);
const pct=(n:number)=>new Intl.NumberFormat("fr-FR",{style:"percent",maximumFractionDigits:0}).format(n);
const iso=(d:Date)=>d.toISOString().slice(0,10);
const monthStart=(d=new Date())=>`${iso(d).slice(0,7)}-01`;
const monthEnd=(start:string,months:number)=>{const d=new Date(`${start}T12:00:00`);d.setMonth(d.getMonth()+months);d.setDate(0);return iso(d)};

export function AnalysisView({movements,projectedOperations,categories,accounts,recurrences}:{movements:Movement[];projectedOperations:Movement[];categories:Category[];accounts:Account[];recurrences:Recurrence[]}){
 const [period,setPeriod]=useState<Period>("month"); const [accountId,setAccountId]=useState("all");
 const data=useMemo(()=>{
  const start=monthStart(), months=period==="month"?1:period==="1y"?12:36, end=monthEnd(start,months);
  const catById=new Map(categories.map(c=>[c.id,c])), recById=new Map(recurrences.map(r=>[r.id,r]));
  const root=(id?:string|null)=>{let c=id?catById.get(id):undefined;const seen=new Set<string>();while(c?.parent_id&&!seen.has(c.id)){seen.add(c.id);c=catById.get(c.parent_id)}return c};
  const excluded=(m:Movement)=>Boolean((m.category_id&&root(m.category_id)?.exclude_from_analysis)||(m.recurrence_id&&recById.get(m.recurrence_id)?.exclude_from_analysis));
  const valid=(m:Movement)=>m.movement_date>=start&&m.movement_date<=end&&(accountId==="all"||m.account_id===accountId)&&!m.movement_type.startsWith("transfer")&&!excluded(m);
  const realized=movements.filter(m=>m.status==="completed"&&valid(m));
  const forecast=projectedOperations.filter(m=>m.status!=="completed"&&valid(m));
  const rows=[...realized.map(m=>({...m,analysisKind:"realized" as const})),...forecast.map(m=>({...m,analysisKind:"forecast" as const}))];
  const expenses=rows.filter(m=>m.movement_type==="expense"), incomes=rows.filter(m=>m.movement_type==="income");
  const totalExp=expenses.reduce((s,m)=>s+Number(m.amount),0), totalInc=incomes.reduce((s,m)=>s+Number(m.amount),0);
  const realizedExp=expenses.filter(m=>m.analysisKind==="realized").reduce((s,m)=>s+Number(m.amount),0);
  const forecastExp=totalExp-realizedExp, realizedInc=incomes.filter(m=>m.analysisKind==="realized").reduce((s,m)=>s+Number(m.amount),0), forecastInc=totalInc-realizedInc;
  const byCat=new Map<string,{name:string;amount:number;realized:number;forecast:number;essential:boolean}>();
  for(const m of expenses){const c=root(m.category_id);const r=m.recurrence_id?recById.get(m.recurrence_id):undefined;const key=c?.id??"none",prev=byCat.get(key)??{name:c?.name??"Sans catégorie",amount:0,realized:0,forecast:0,essential:Boolean(r?.is_essential??c?.is_essential)};prev.amount+=Number(m.amount);prev[m.analysisKind]+=Number(m.amount);prev.essential=prev.essential||Boolean(r?.is_essential??c?.is_essential);byCat.set(key,prev)}
  const ranked=[...byCat.values()].sort((a,b)=>b.amount-a.amount);
  const essential=ranked.filter(x=>x.essential).reduce((s,x)=>s+x.amount,0), variable=totalExp-essential;
  const avg=totalExp/months, avgIncome=totalInc/months, top5=ranked.slice(0,5).reduce((s,x)=>s+x.amount,0);
  const biggest=expenses.slice().sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,7);
  const recurringForecast=forecast.filter(m=>Boolean(m.recurrence_id)&&m.movement_type==="expense").reduce((s,m)=>s+Number(m.amount),0);
  return {totalExp,totalInc,realizedExp,forecastExp,realizedInc,forecastInc,ranked,essential,variable,avg,avgIncome,top5,biggest,months,recurringMonthly:recurringForecast/months};
 },[period,accountId,movements,projectedOperations,categories,recurrences]);
 const top=data.ranked[0], savingsPotential=data.variable*.1, coverage=data.totalExp?data.totalInc/data.totalExp:0;
 return <div className="mt-5 space-y-5">
  <section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6">
   <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-500">Analyse réalisé + prévisionnel</p><h2 className="mt-2 text-2xl font-semibold">Où part ton argent ?</h2><p className="mt-1 text-sm text-neutral-500">Les vues 1 an et 3 ans cumulent tous les mois de la période, y compris récurrences, budgets restants et revenus PHOTO à venir. Les virements internes et éléments exclus dans Paramètres sont ignorés.</p></div>
   <div className="flex flex-wrap gap-2">{([["month","Mois"],["1y","1 an"],["3y","3 ans"]] as const).map(([id,label])=><button key={id} onClick={()=>setPeriod(id)} className={`rounded-xl px-4 py-2 text-sm font-medium ${period===id?"bg-black text-white":"border border-black/10 bg-white"}`}>{label}</button>)}<select value={accountId} onChange={e=>setAccountId(e.target.value)} className="min-h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"><option value="all">Tous les comptes courants</option>{accounts.filter(a=>a.account_type==="checking").map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div></div>
  </section>

  <div className="grid gap-3 px-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-4 lg:px-6">
   <Metric icon={WalletCards} label="Dépenses cumulées" value={euro(data.totalExp)} detail={`${euro(data.realizedExp)} réalisées · ${euro(data.forecastExp)} prévues`}/>
   <Metric icon={TrendingUp} label="Revenus cumulés" value={euro(data.totalInc)} detail={`${euro(data.realizedInc)} reçus · ${euro(data.forecastInc)} prévus`}/>
   <Metric icon={Scale} label="Solde de la période" value={euro(data.totalInc-data.totalExp)} detail={`Couverture ${pct(coverage)}`}/>
   <Metric icon={BarChart3} label="Dépense moyenne / mois" value={euro(data.avg)} detail={`Revenus moyens ${euro(data.avgIncome)}`}/>
  </div>

  <div className="grid gap-5 px-3 sm:px-5 lg:grid-cols-2 lg:px-6">
   <Panel title="Postes les plus coûteux" subtitle="Cumul réel + prévisionnel par catégorie"><div className="space-y-4">{data.ranked.slice(0,10).map((x,i)=><div key={x.name}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span><b>{i+1}.</b> {x.name}</span><span className="text-right font-semibold">{euro(x.amount)} <span className="font-normal text-neutral-400">· {data.totalExp?pct(x.amount/data.totalExp):"0 %"}</span></span></div><div className="mb-1 text-[11px] text-neutral-400">{euro(x.realized)} réalisé · {euro(x.forecast)} prévu</div><div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-black" style={{width:`${data.totalExp?Math.max(2,x.amount/data.totalExp*100):0}%`}}/></div></div>)}{!data.ranked.length?<Empty/>:null}</div></Panel>

   <Panel title="Structure des dépenses" subtitle="Contraintes, récurrence et marge de manœuvre"><div className="space-y-4"><Split label="Dépenses essentielles" amount={data.essential} total={data.totalExp}/><Split label="Dépenses arbitrables" amount={data.variable} total={data.totalExp}/><Info icon={Repeat2} label="Charge récurrente future moyenne" value={`${euro(data.recurringMonthly)} / mois`}/><Info icon={ShieldCheck} label="Part essentielle" value={data.totalExp?pct(data.essential/data.totalExp):"0 %"}/><Info icon={CalendarRange} label="Concentration Top 5" value={data.totalExp?pct(data.top5/data.totalExp):"0 %"}/></div></Panel>

   <Panel title="Plus grosses dépenses" subtitle="Mouvements individuels réalisés ou prévus"><div className="divide-y divide-black/10">{data.biggest.map(m=><div key={`${m.id}-${m.analysisKind}`} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{m.label}</p><p className="text-xs text-neutral-500">{new Date(m.movement_date+"T12:00:00").toLocaleDateString("fr-FR")} · {m.analysisKind==="realized"?"Réalisé":"Prévu"}</p></div><b>{euro(Number(m.amount))}</b></div>)}{!data.biggest.length?<Empty/>:null}</div></Panel>

   <Panel title="Leviers" subtitle="Repères chiffrés, sans modifier tes données"><div className="space-y-3 text-sm">{top?<Insight icon={TrendingDown} title={`${top.name} est ton premier poste`} text={`${euro(top.amount)} sur la période, soit ${data.totalExp?pct(top.amount/data.totalExp):"0 %"} de tes dépenses.`}/>:null}<Insight icon={Repeat2} title="Baisse de 10 % des dépenses arbitrables" text={`${euro(savingsPotential)} économisés sur la période, soit environ ${euro(savingsPotential/data.months)} par mois.`}/><Insight icon={Scale} title="Couverture des dépenses par les revenus" text={`${pct(coverage)} sur l’horizon sélectionné. ${coverage>=1?"Les revenus couvrent les dépenses prévues.":"Les dépenses dépassent les revenus sur cette période."}`}/><Insight icon={BarChart3} title="Poids des cinq premiers postes" text={`${data.totalExp?pct(data.top5/data.totalExp):"0 %"} de toutes les dépenses analysées.`}/></div></Panel>
  </div>
 </div>
}
function Metric({icon:Icon,label,value,detail}:{icon:any;label:string;value:string;detail:string}){return <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-neutral-500"><Icon size={16}/><span className="text-xs font-medium">{label}</span></div><p className="mt-3 text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-neutral-400">{detail}</p></div>}
function Panel({title,subtitle,children}:{title:string;subtitle:string;children:any}){return <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm"><h3 className="text-lg font-semibold">{title}</h3><p className="mb-5 mt-1 text-sm text-neutral-500">{subtitle}</p>{children}</section>}
function Split({label,amount,total}:{label:string;amount:number;total:number}){return <div><div className="flex justify-between text-sm"><span>{label}</span><b>{euro(amount)} · {total?pct(amount/total):"0 %"}</b></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-black" style={{width:`${total?amount/total*100:0}%`}}/></div></div>}
function Info({icon:Icon,label,value}:{icon:any;label:string;value:string}){return <div className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 p-4 text-sm"><span className="flex items-center gap-2 text-neutral-500"><Icon size={16}/>{label}</span><b>{value}</b></div>}
function Insight({icon:Icon,title,text}:{icon:any;title:string;text:string}){return <div className="flex gap-3 rounded-2xl bg-neutral-50 p-4"><Icon className="mt-0.5 shrink-0" size={17}/><div><p className="font-semibold">{title}</p><p className="mt-1 leading-5 text-neutral-500">{text}</p></div></div>}
function Empty(){return <p className="py-6 text-center text-sm text-neutral-400">Pas encore assez de données sur cette période.</p>}
