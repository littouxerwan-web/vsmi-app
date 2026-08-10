"use client";

import { useMemo, useState } from "react";
import { BarChart3, Bitcoin, Landmark, PiggyBank, X } from "lucide-react";

type Account={id:string;name:string;account_type:"checking"|"savings"|"crypto";color?:string|null};
type Audit={month:string;opening:Record<string,number>;credits:Record<string,number>;debits:Record<string,number>;closing:Record<string,number>};
type Operation={id:string;account_id:string;movement_type:string;amount:number;movement_date:string;label:string;source?:string};
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
  const rows=operations.filter(o=>o.account_id===selected.id&&o.movement_date.startsWith(month)).sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id));
  const daily=new Map<string,{date:string;balance:number;label:string}>();
  for(const o of rows){
   balance+=isCredit(o.movement_type)?Number(o.amount):-Number(o.amount);
   // Une seule valeur par date : le solde après la dernière opération de la journée.
   // Cela évite les segments verticaux artificiels lorsque plusieurs mouvements
   // partagent la même date (notamment le 1er et le dernier jour du mois).
   daily.set(o.movement_date,{date:o.movement_date,balance,label:o.label});
  }
  const closing=Number(audit.closing[selected.id]??balance);
  const lastDay=daysInMonth(month);
  const firstDate=`${month}-01`;
  const lastDate=`${month}-${String(lastDay).padStart(2,"0")}`;
  if(!daily.has(firstDate))daily.set(firstDate,{date:firstDate,balance:opening,label:"Ouverture"});
  // La clôture du moteur fait foi pour le dernier point du mois.
  daily.set(lastDate,{date:lastDate,balance:closing,label:"Clôture"});
  const pts=[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date));

  const rawMin=Math.min(...pts.map(p=>p.balance),0),rawMax=Math.max(...pts.map(p=>p.balance),0);
  let axisMin=Math.floor(rawMin/500)*500,axisMax=Math.ceil(rawMax/500)*500;
  if(axisMin===axisMax){axisMin-=500;axisMax+=500;}
  const ticks:number[]=[];for(let v=axisMin;v<=axisMax;v+=500)ticks.push(v);
  const dateTicks=[1,5,10,15,20,25,lastDay].filter((d,i,a)=>d<=lastDay&&a.indexOf(d)===i);
  const W=760,H=300,left=76,right=18,top=16,bottom=42,plotW=W-left-right,plotH=H-top-bottom;
  const y=(v:number)=>top+(axisMax-v)/(axisMax-axisMin)*plotH;
  const day=(date:string)=>Math.max(1,Math.min(lastDay,Number(date.slice(8,10))||1));
  const x=(date:string)=>left+((day(date)-1)/Math.max(1,lastDay-1))*plotW;
  const coords=pts.map(p=>({...p,x:x(p.date),y:y(p.balance)}));
  return {pts,coords,axisMin,axisMax,ticks,dateTicks,lastDay,closing,W,H,left,right,top,bottom,plotW,plotH,y,x};
 },[selected,month,operations,audits]);
 return <>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{accounts.map(a=>{const audit=currentAudit;const current=Number(audit?.opening[a.id]??0);const beforeSavings=current+Number(audit?.credits[a.id]??0)-Number(audit?.debits[a.id]??0);const afterSavings=Number(audit?.closing[a.id]??beforeSavings);const Icon=a.account_type==="savings"?PiggyBank:a.account_type==="crypto"?Bitcoin:Landmark;const type=a.account_type==="savings"?"Épargne":a.account_type==="crypto"?"Crypto":"Compte courant";return <div key={a.id} className="border-l-4 border-y border-r border-black/10 p-4" style={{backgroundColor:`${a.color??"#ffffff"}18`,borderLeftColor:a.color??"#d4d4d4"}}><div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center bg-white/80"><Icon size={18}/></span><div className="flex items-center gap-2"><button type="button" onClick={()=>{setOpenAccount(a.id);setMonth(currentMonth)}} title="Voir l’évolution graphique" aria-label={`Voir l’évolution graphique de ${a.name}`} className="grid size-8 place-items-center rounded-lg bg-white/80 text-neutral-600 transition hover:bg-white hover:text-black"><BarChart3 size={16}/></button><span className="bg-white/80 px-2 py-1 text-xs font-medium text-neutral-600">{type}</span></div></div><p className="mt-3 font-semibold">{a.name}</p><div className="mt-3 grid grid-cols-3 gap-2"><div><p className="text-[11px] text-neutral-500">Aujourd’hui</p><p className={`mt-1 font-semibold ${current<0?"text-red-700":""}`}>{money(current)}</p></div><div><p className="text-[11px] text-neutral-500">Fin de mois</p><p className={`mt-1 font-semibold ${beforeSavings<0?"text-red-700":""}`}>{money(beforeSavings)}</p></div><div><p className="text-[11px] text-neutral-500">Après épargne</p><p className={`mt-1 font-semibold ${afterSavings<0?"text-red-700":"text-emerald-700"}`}>{money(afterSavings)}</p></div></div></div>})}</div>
  {selected&&chart?<div className="fixed inset-0 z-[250] grid place-items-center bg-black/45 p-3" onPointerDown={e=>{if(e.target===e.currentTarget)setOpenAccount(null)}}><div className="w-full max-w-4xl rounded-3xl bg-white p-4 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-400">Évolution du solde</p><h3 className="mt-1 text-xl font-semibold">{selected.name}</h3></div><button type="button" onClick={()=>setOpenAccount(null)} className="grid size-10 place-items-center rounded-full bg-neutral-100" aria-label="Fermer"><X size={18}/></button></div><label className="mt-4 block max-w-xs text-xs font-medium text-neutral-600">Mois<select value={month} onChange={e=>setMonth(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label><div className="mt-5 overflow-x-auto rounded-2xl border border-black/10 bg-neutral-50 p-3"><svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="h-[300px] min-w-[680px] w-full" role="img" aria-label="Évolution du solde par date avec graduation tous les 500 euros">
   {chart.ticks.map(v=><g key={v}><line x1={chart.left} y1={chart.y(v)} x2={chart.W-chart.right} y2={chart.y(v)} stroke={v===0?"#dc2626":"currentColor"} strokeOpacity={v===0?0.65:0.12} strokeDasharray={v===0?undefined:"4 4"}/><text x={chart.left-10} y={chart.y(v)+4} textAnchor="end" fontSize="11" fill="currentColor" opacity=".62">{compactMoney(v)}</text></g>)}
   {chart.dateTicks.map(d=>{const date=`${month}-${String(d).padStart(2,"0")}`;return <g key={d}><line x1={chart.x(date)} y1={chart.top} x2={chart.x(date)} y2={chart.H-chart.bottom} stroke="currentColor" strokeOpacity=".07"/><text x={chart.x(date)} y={chart.H-16} textAnchor="middle" fontSize="11" fill="currentColor" opacity=".62">{d}</text></g>})}
   <polyline points={chart.coords.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke={selected.color??"currentColor"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
  </svg><div className="mt-1 flex items-center justify-between gap-3 px-2 text-xs text-neutral-500"><span>Ouverture {money(chart.pts[0]?.balance??0)}</span><span>Dates du mois</span><span>Clôture {money(chart.closing)}</span></div></div><p className="mt-3 text-xs text-neutral-500">Axe horizontal : dates du mois. Axe vertical : tranches de 500 €. Le tracé reprend les mêmes opérations et transferts d’épargne que Projection.</p></div></div>:null}
 </>;
}
