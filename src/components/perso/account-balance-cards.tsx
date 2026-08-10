"use client";

import { useMemo, useState } from "react";
import { BarChart3, Bitcoin, Landmark, PiggyBank, X } from "lucide-react";

type Account={id:string;name:string;account_type:"checking"|"savings"|"crypto";color?:string|null};
type Audit={month:string;opening:Record<string,number>;credits:Record<string,number>;debits:Record<string,number>;closing:Record<string,number>};
type Operation={id:string;account_id:string;movement_type:string;amount:number;movement_date:string;label:string;source?:string};
const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(v);
const monthLabel=(m:string)=>new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(new Date(`${m}-01T12:00:00`));
const isCredit=(t:string)=>["income","transfer_in"].includes(t);

export function AccountBalanceCards({accounts,audits,operations,currentMonth}:{accounts:Account[];audits:Audit[];operations:Operation[];currentMonth:string}){
 const [openAccount,setOpenAccount]=useState<string|null>(null);
 const [month,setMonth]=useState(currentMonth);
 const selected=accounts.find(a=>a.id===openAccount)??null;
 const auditByMonth=new Map(audits.map(a=>[a.month,a]));
 const currentAudit=auditByMonth.get(currentMonth);
 const months=audits.map(a=>a.month);
 const chart=useMemo(()=>{
  if(!selected)return null;const audit=auditByMonth.get(month);if(!audit)return null;
  let balance=Number(audit.opening[selected.id]??0);
  const rows=operations.filter(o=>o.account_id===selected.id&&o.movement_date.startsWith(month)).sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id));
  const pts=[{date:`${month}-01`,balance,label:"Ouverture"}];
  for(const o of rows){balance+=isCredit(o.movement_type)?Number(o.amount):-Number(o.amount);pts.push({date:o.movement_date,balance,label:o.label});}
  const min=Math.min(...pts.map(p=>p.balance),0),max=Math.max(...pts.map(p=>p.balance),1),span=Math.max(1,max-min);
  const coords=pts.map((p,i)=>({ ...p,x:pts.length===1?0:(i/(pts.length-1))*100,y:92-((p.balance-min)/span)*82 }));
  return {pts,coords,min,max,closing:Number(audit.closing[selected.id]??balance)};
 },[selected,month,operations,audits]);
 return <>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{accounts.map(a=>{const audit=currentAudit;const current=Number(audit?.opening[a.id]??0);const beforeSavings=current+Number(audit?.credits[a.id]??0)-Number(audit?.debits[a.id]??0);const afterSavings=Number(audit?.closing[a.id]??beforeSavings);const Icon=a.account_type==="savings"?PiggyBank:a.account_type==="crypto"?Bitcoin:Landmark;const type=a.account_type==="savings"?"Épargne":a.account_type==="crypto"?"Crypto":"Compte courant";return <div key={a.id} className="border-l-4 border-y border-r border-black/10 p-4" style={{backgroundColor:`${a.color??"#ffffff"}18`,borderLeftColor:a.color??"#d4d4d4"}}><div className="flex items-start justify-between gap-3"><span className="grid size-9 place-items-center bg-white/80"><Icon size={18}/></span><div className="flex items-center gap-2"><button type="button" onClick={()=>{setOpenAccount(a.id);setMonth(currentMonth)}} title="Voir l’évolution graphique" aria-label={`Voir l’évolution graphique de ${a.name}`} className="grid size-8 place-items-center rounded-lg bg-white/80 text-neutral-600 transition hover:bg-white hover:text-black"><BarChart3 size={16}/></button><span className="bg-white/80 px-2 py-1 text-xs font-medium text-neutral-600">{type}</span></div></div><p className="mt-3 font-semibold">{a.name}</p><div className="mt-3 grid grid-cols-3 gap-2"><div><p className="text-[11px] text-neutral-500">Aujourd’hui</p><p className={`mt-1 font-semibold ${current<0?"text-red-700":""}`}>{money(current)}</p></div><div><p className="text-[11px] text-neutral-500">Fin de mois</p><p className={`mt-1 font-semibold ${beforeSavings<0?"text-red-700":""}`}>{money(beforeSavings)}</p></div><div><p className="text-[11px] text-neutral-500">Après épargne</p><p className={`mt-1 font-semibold ${afterSavings<0?"text-red-700":"text-emerald-700"}`}>{money(afterSavings)}</p></div></div></div>})}</div>
  {selected&&chart?<div className="fixed inset-0 z-[250] grid place-items-center bg-black/45 p-3" onPointerDown={e=>{if(e.target===e.currentTarget)setOpenAccount(null)}}><div className="w-full max-w-3xl rounded-3xl bg-white p-4 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-400">Évolution du solde</p><h3 className="mt-1 text-xl font-semibold">{selected.name}</h3></div><button type="button" onClick={()=>setOpenAccount(null)} className="grid size-10 place-items-center rounded-full bg-neutral-100" aria-label="Fermer"><X size={18}/></button></div><label className="mt-4 block max-w-xs text-xs font-medium text-neutral-600">Mois<select value={month} onChange={e=>setMonth(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm">{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></label><div className="mt-5 rounded-2xl border border-black/10 bg-neutral-50 p-3"><svg viewBox="0 0 100 100" className="h-64 w-full" preserveAspectRatio="none"><line x1="0" y1={92-((0-chart.min)/Math.max(1,chart.max-chart.min))*82} x2="100" y2={92-((0-chart.min)/Math.max(1,chart.max-chart.min))*82} stroke="currentColor" strokeOpacity=".16" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/><polyline points={chart.coords.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg><div className="mt-2 flex justify-between text-xs text-neutral-500"><span>Ouverture {money(chart.pts[0]?.balance??0)}</span><span>Clôture {money(chart.closing)}</span></div></div><p className="mt-3 text-xs text-neutral-500">Le tracé reprend les mêmes opérations et transferts d’épargne que Projection. Pour le mois en cours, il part du solde disponible aujourd’hui.</p></div></div>:null}
 </>;
}
