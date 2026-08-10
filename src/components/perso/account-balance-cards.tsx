"use client";

import { useMemo, useState } from "react";
import { BarChart3, Bitcoin, Landmark, PiggyBank, X } from "lucide-react";

type Account={id:string;name:string;account_type:"checking"|"savings"|"crypto";color?:string|null};
type Audit={month:string;opening:Record<string,number>;credits:Record<string,number>;debits:Record<string,number>;closing:Record<string,number>};
type Operation={id:string;account_id:string;movement_type:string;amount:number;movement_date:string;label:string;source?:string;projected?:boolean};
const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(v);
const compactMoney=(v:number)=>new Intl.NumberFormat("fr-FR",{maximumFractionDigits:0}).format(v)+" €";
const monthLabel=(m:string)=>new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(new Date(`${m}-01T12:00:00`));
const isCredit=(t:string)=>["income","transfer_in"].includes(t);
const daysInMonth=(month:string)=>{const [y,m]=month.split("-").map(Number);return new Date(y,m,0).getDate();};

export function AccountBalanceCards({accounts,audits,operations,currentMonth}:{accounts:Account[];audits:Audit[];operations:Operation[];currentMonth:string}){
 const [openAccount,setOpenAccount]=useState<string|null>(null);
 const [month,setMonth]=useState(currentMonth);
 const selected=accounts.find(a=>a.id===openAccount)??null;
 const auditByMonth=new Map(audits.map(a=>[a.month,a]));
 const currentAudit=auditByMonth.get(currentMonth);
 const months=audits.map(a=>a.month);
 const chart=useMemo(()=>{
  if(!selected)return null;
  const audit=auditByMonth.get(month);if(!audit)return null;
  const opening=Number(audit.opening[selected.id]??0);
  let balance=opening;
  const rows=operations
   .filter(o=>o.account_id===selected.id&&o.movement_date.startsWith(month))
   .sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id));
  type DayPoint={date:string;balance:number;change:number;labels:string[];sources:string[]};
  const daily=new Map<string,DayPoint>();
  for(const o of rows){
   const delta=isCredit(o.movement_type)?Number(o.amount):-Number(o.amount);
   balance+=delta;
   const previous=daily.get(o.movement_date);
   daily.set(o.movement_date,{
    date:o.movement_date,
    balance,
    change:Number((Number(previous?.change??0)+delta).toFixed(2)),
    labels:[...(previous?.labels??[]),o.label],
    sources:[...(previous?.sources??[]),String(o.source??"movement")],
   });
  }
  const auditClosing=Number(audit.closing[selected.id]??balance);
  const computedClosing=Number(balance.toFixed(2));
  const lastDay=daysInMonth(month);
  const firstDate=`${month}-01`;
  const lastDate=`${month}-${String(lastDay).padStart(2,"0")}`;
  // Le graphe représente le solde de fin de journée. L'ouverture reste une donnée
  // séparée : une opération du 1er ne doit jamais être présentée comme l'ouverture.
  if(!daily.has(firstDate))daily.set(firstDate,{date:firstDate,balance:opening,change:0,labels:["Ouverture"],sources:["opening"]});
  // Si aucune opération n'a lieu le dernier jour, on prolonge simplement le dernier
  // solde connu. On ne force jamais la courbe vers audit.closing : cela créait des
  // baisses artificielles sans mouvement correspondant.
  if(!daily.has(lastDate))daily.set(lastDate,{date:lastDate,balance:computedClosing,change:0,labels:["Clôture"],sources:["closing"]});
  const pts=[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const reconciliationGap=Number((auditClosing-computedClosing).toFixed(2));
  const syntheticEvents=pts.filter(p=>p.sources.some(source=>["budget","savings","urssaf","photo"].includes(source))&&Math.abs(p.change)>=0.01);
  const budgetRows=rows.filter(o=>o.source==="budget");
  const budgetTotal=Number(budgetRows.reduce((sum,o)=>sum+Number(o.amount||0),0).toFixed(2));
  const budgetDates=[...new Set(budgetRows.map(o=>o.movement_date))].sort();
  const budgetDays=budgetDates.length;
  const budgetPerDay=budgetDays?Number((budgetTotal/budgetDays).toFixed(2)):0;
  const savingsRows=rows.filter(o=>o.source==="savings");
  const savingsSummary=savingsRows.map(o=>({date:o.movement_date,change:isCredit(o.movement_type)?Number(o.amount):-Number(o.amount),label:o.label}));
  const otherSynthetic=syntheticEvents.filter(p=>p.sources.some(source=>["urssaf","photo"].includes(source)));

  const rawMin=Math.min(...pts.map(p=>p.balance),0),rawMax=Math.max(...pts.map(p=>p.balance),0);
  let axisMin=Math.floor(rawMin/500)*500,axisMax=Math.ceil(rawMax/500)*500;
  if(axisMin===axisMax){axisMin-=500;axisMax+=500;}
  const ticks:number[]=[];for(let v=axisMin;v<=axisMax;v+=500)ticks.push(v);
  const dateTicks=[1,5,10,15,20,25,lastDay].filter((d,i,a)=>d<=lastDay&&a.indexOf(d)===i);
  const W=620,H=280,left=70,right=14,top=14,bottom=38,plotW=W-left-right,plotH=H-top-bottom;
  const y=(v:number)=>top+(axisMax-v)/(axisMax-axisMin)*plotH;
  const day=(date:string)=>Math.max(1,Math.min(lastDay,Number(date.slice(8,10))||1));
  const x=(date:string)=>left+((day(date)-1)/Math.max(1,lastDay-1))*plotW;
  const coords=pts.map(p=>({...p,x:x(p.date),y:y(p.balance)}));
  return {pts,coords,opening,axisMin,axisMax,ticks,dateTicks,lastDay,auditClosing,computedClosing,reconciliationGap,syntheticEvents,budgetTotal,budgetDays,budgetPerDay,budgetDates,savingsSummary,otherSynthetic,W,H,left,right,top,bottom,plotW,plotH,y,x};
 },[selected,month,operations,audits]);
 return <>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{accounts.map(a=>{const audit=currentAudit;const current=Number(audit?.opening[a.id]??0);const beforeSavings=current+Number(audit?.credits[a.id]??0)-Number(audit?.debits[a.id]??0);const afterSavings=Number(audit?.closing[a.id]??beforeSavings);const Icon=a.account_type==="savings"?PiggyBank:a.account_type==="crypto"?Bitcoin:Landmark;const type=a.account_type==="savings"?"Épargne":a.account_type==="crypto"?"Crypto":"Compte courant";return <div key={a.id} className="border-l-4 border-y border-r border-black/10 p-4" style={{backgroundColor:`${a.color??"#ffffff"}18`,borderLeftColor:a.color??"#d4d4d4"}}><div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center bg-white/80"><Icon size={18}/></span><div className="flex items-center gap-2"><button type="button" onClick={()=>{setOpenAccount(a.id);setMonth(currentMonth)}} title="Voir l’évolution graphique" aria-label={`Voir l’évolution graphique de ${a.name}`} className="grid size-8 place-items-center rounded-lg bg-white/80 text-neutral-600 transition hover:bg-white hover:text-black"><BarChart3 size={16}/></button><span className="bg-white/80 px-2 py-1 text-xs font-medium text-neutral-600">{type}</span></div></div><p className="mt-3 font-semibold">{a.name}</p><div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2"><div className="min-w-0"><p className="text-[10px] leading-tight text-neutral-500 sm:text-[11px]">Aujourd’hui</p><p className={`mt-1 truncate text-[12px] font-semibold sm:text-base ${current<0?"text-red-700":""}`}>{money(current)}</p></div><div className="min-w-0"><p className="text-[10px] leading-tight text-neutral-500 sm:text-[11px]">Fin de mois</p><p className={`mt-1 truncate text-[12px] font-semibold sm:text-base ${beforeSavings<0?"text-red-700":""}`}>{money(beforeSavings)}</p></div><div className="min-w-0"><p className="text-[10px] leading-tight text-neutral-500 sm:text-[11px]">Après épargne</p><p className={`mt-1 truncate text-[12px] font-semibold sm:text-base ${afterSavings<0?"text-red-700":"text-emerald-700"}`}>{money(afterSavings)}</p></div></div></div>})}</div>
  {selected&&chart?<div className="fixed inset-0 z-[250] flex items-end justify-center bg-black/45 p-0 sm:grid sm:place-items-center sm:p-3" onPointerDown={e=>{if(e.target===e.currentTarget)setOpenAccount(null)}}><div className="max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white p-3 shadow-2xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-400">Évolution du solde</p><h3 className="mt-1 text-xl font-semibold">{selected.name}</h3></div><button type="button" onClick={()=>setOpenAccount(null)} className="grid size-10 place-items-center rounded-full bg-neutral-100" aria-label="Fermer"><X size={18}/></button></div><label className="mt-4 block max-w-xs text-xs font-medium text-neutral-600">Mois<select value={month} onChange={e=>setMonth(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label><div className="mt-4 overflow-hidden rounded-2xl border border-black/10 bg-neutral-50 p-2 sm:mt-5 sm:p-3"><svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="block h-auto max-h-[300px] w-full" role="img" aria-label="Évolution du solde par date avec graduation tous les 500 euros">
   {chart.ticks.map(v=><g key={v}><line x1={chart.left} y1={chart.y(v)} x2={chart.W-chart.right} y2={chart.y(v)} stroke={v===0?"#dc2626":"currentColor"} strokeOpacity={v===0?0.65:0.12} strokeDasharray={v===0?undefined:"4 4"}/><text x={chart.left-10} y={chart.y(v)+4} textAnchor="end" fontSize="14" fill="currentColor" opacity=".62">{compactMoney(v)}</text></g>)}
   {chart.dateTicks.map(d=>{const date=`${month}-${String(d).padStart(2,"0")}`;return <g key={d}><line x1={chart.x(date)} y1={chart.top} x2={chart.x(date)} y2={chart.H-chart.bottom} stroke="currentColor" strokeOpacity=".07"/><text x={chart.x(date)} y={chart.H-16} textAnchor="middle" fontSize="14" fill="currentColor" opacity=".62">{d}</text></g>})}
   <polyline points={chart.coords.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke={selected.color??"currentColor"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
   {chart.coords.filter(p=>Math.abs(p.change)>=0.01).map(p=><circle key={p.date} cx={p.x} cy={p.y} r="3.2" fill={selected.color??"currentColor"}><title>{`${p.date.slice(8,10)}/${p.date.slice(5,7)} · ${p.change>0?"+":""}${money(p.change)} · ${p.labels.join(" · ")}`}</title></circle>)}
  </svg><div className="mt-2 grid grid-cols-2 gap-1 px-1 text-[11px] text-neutral-500 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:px-2 sm:text-xs"><span>Ouverture {money(chart.opening)}</span><span className="hidden sm:inline">Dates du mois</span><span className="text-right sm:text-left">Clôture {money(chart.auditClosing)}</span></div></div>{(chart.budgetTotal>0||chart.savingsSummary.length>0||chart.otherSynthetic.length>0)?<div className="mt-3 rounded-xl border border-black/10 bg-neutral-50 px-3 py-3"><p className="text-xs font-semibold text-neutral-700">Détail de la projection</p><div className="mt-2 space-y-2 text-xs text-neutral-600">{chart.budgetTotal>0?<p><span className="font-medium text-neutral-800">Lissage des budgets restants :</span> {money(chart.budgetTotal)} à répartir sur {chart.budgetDays} jour{chart.budgetDays>1?"s":""}, soit environ <span className="font-semibold">{money(chart.budgetPerDay)}/jour</span>{chart.budgetDates.length?` du ${chart.budgetDates[0].slice(8,10)}/${chart.budgetDates[0].slice(5,7)} au ${chart.budgetDates.at(-1)?.slice(8,10)}/${chart.budgetDates.at(-1)?.slice(5,7)}`:""}.</p>:null}{chart.savingsSummary.map((o,i)=><p key={`${o.date}-${i}`}><span className="font-medium text-neutral-800">Épargne :</span> {o.date.slice(8,10)}/{o.date.slice(5,7)} · <span className={o.change<0?"text-red-700":"text-emerald-700"}>{o.change>0?"+":""}{money(o.change)}</span> · {o.label}</p>)}{chart.otherSynthetic.map(p=><p key={p.date}><span className="font-medium text-neutral-800">Autre flux projeté :</span> {p.date.slice(8,10)}/{p.date.slice(5,7)} · <span className={p.change<0?"text-red-700":"text-emerald-700"}>{p.change>0?"+":""}{money(p.change)}</span> · {p.labels.filter(l=>!l.startsWith("Budget restant")).join(" · ")}</p>)}</div></div>:null}{Math.abs(chart.reconciliationGap)>=0.01?<div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Écart de contrôle : la somme des flux visibles donne {money(chart.computedClosing)}, alors que Projection annonce {money(chart.auditClosing)}. Le graphique n’invente plus de mouvement pour masquer cet écart.</div>:null}<p className="mt-3 text-xs text-neutral-500">Axe horizontal : dates du mois. Axe vertical : tranches de 500 €. Chaque point représente le solde de fin de journée. Les budgets et transferts automatiques intégrés à Projection sont signalés ci-dessus lorsqu’ils existent.</p></div></div>:null}
 </>;
}
