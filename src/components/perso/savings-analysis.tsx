"use client";

import { useMemo } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

type Account={id:string;name:string;account_type:"checking"|"savings"};
type Category={id:string;parent_id:string|null;monthly_budget:number;account_id?:string|null};
type Snapshot={account_id:string;balance:number;snapshot_date:string};
type Movement={label:string;account_id:string;category_id:string|null;movement_type:string;amount:number;movement_date:string;status:string};
type Recurrence={account_id:string;destination_account_id:string|null;category_id:string|null;movement_type:"income"|"expense"|"transfer";amount:number;frequency:string;interval_count:number;start_date:string;end_date:string|null};
type PhotoPayment={amount:number;expected_date:string|null;received_date:string|null;status:string;personal_account_id:string|null};
type MonthFlow={month:string;income:number;expense:number;net:number};
type SavingsProposal={source_account_id:string;destination_account_id:string;source_month:string;amount:number;status:string;transfer_group_id?:string|null};
type SavingsRow={month:string;checking:number;savings:number;proposal:number;income:number;expense:number;requiredReserve:number;proposalStatus:"automatic"|"modified"|"accepted"|"deleted"};
const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(v);
const monthLabel=(v:string)=>new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(new Date(`${v}-01T12:00:00`));
const shift=(m:string,n:number)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};

export function SavingsAnalysis({accounts,categories,snapshots,movements,recurrences,photoPayments,proposals,sourceAccountId,destinationAccountId}:{accounts:Account[];categories:Category[];snapshots:Snapshot[];movements:Movement[];recurrences:Recurrence[];photoPayments:PhotoPayment[];proposals:SavingsProposal[];sourceAccountId:string|null;destinationAccountId:string|null}){
 const source=accounts.find(a=>a.id===sourceAccountId);const destination=accounts.find(a=>a.id===destinationAccountId);
 const rows=useMemo(()=>{
  if(!source||!destination)return[];
  const categoryById=new Map(categories.map(c=>[c.id,c]));
  const root=(id:string|null)=>{let c=id?categoryById.get(id):undefined;while(c?.parent_id)c=categoryById.get(c.parent_id);return c?.id??null};
  const roots=categories.filter(c=>!c.parent_id&&Number(c.monthly_budget)>0);
  const latest=snapshots.filter(s=>s.account_id===source.id).sort((a,b)=>b.snapshot_date.localeCompare(a.snapshot_date))[0];
  let checking=Number(latest?.balance??0);
  const latestSave=snapshots.filter(s=>s.account_id===destination.id).sort((a,b)=>b.snapshot_date.localeCompare(a.snapshot_date))[0];
  let savings=Number(latestSave?.balance??0);
  const start=new Date();start.setDate(1);start.setHours(12,0,0,0);

  const flows:MonthFlow[]=[];
  for(let i=0;i<60;i++){
   const month=shift(start.toISOString().slice(0,7),i);
   let income=0,expense=0;
   const spentByRoot=new Map<string,number>();
   for(const m of movements.filter(x=>x.movement_date.startsWith(month)&&!x.label?.startsWith("Versement épargne proposé"))){
    const sign=["income","transfer_in"].includes(m.movement_type)?1:-1;
    if(m.account_id===source.id){if(sign>0)income+=Number(m.amount);else expense+=Number(m.amount)}
    if(m.movement_type==="expense"&&m.account_id===source.id){const r=root(m.category_id);if(r)spentByRoot.set(r,(spentByRoot.get(r)??0)+Number(m.amount));}
   }
   for(const r of recurrences){
    if(r.end_date&&r.end_date.slice(0,7)<month)continue;
    if(r.start_date.slice(0,7)>month)continue;
    const amount=Number(r.amount);
    if(r.movement_type==="income"&&r.account_id===source.id)income+=amount;
    else if(r.movement_type==="expense"&&r.account_id===source.id){expense+=amount;const rt=root(r.category_id);if(rt)spentByRoot.set(rt,(spentByRoot.get(rt)??0)+amount)}
    else if(r.movement_type==="transfer"){if(r.account_id===source.id)expense+=amount;if(r.destination_account_id===source.id)income+=amount}
   }
   for(const p of photoPayments.filter(x=>(x.expected_date??x.received_date??"").startsWith(month)&&x.status!=="cancelled"&&x.personal_account_id===source.id))income+=Number(p.amount);
   for(const b of roots){if(b.account_id===source.id){const remaining=Math.max(0,Number(b.monthly_budget)-(spentByRoot.get(b.id)??0));expense+=remaining;}}
   flows.push({month,income,expense,net:income-expense});
  }

  // Pour chaque fin de mois, on conserve assez de trésorerie pour absorber
  // le pire cumul négatif des mois suivants tout en gardant 500 € minimum.
  const reserveAfterMonth=new Array<number>(flows.length).fill(500);
  let futureCumulative=0;
  let futureMinimum=0;
  for(let i=flows.length-1;i>=0;i--){
   reserveAfterMonth[i]=500+Math.max(0,-futureMinimum);
   futureCumulative=flows[i].net+futureCumulative;
   futureMinimum=Math.min(0,futureCumulative);
  }

  const proposalByMonth=new Map(proposals.filter(p=>p.source_account_id===source.id&&p.destination_account_id===destination.id).map(p=>[String(p.source_month).slice(0,7),p]));
  const out:SavingsRow[]=[];
  for(let i=0;i<flows.length;i++){
   const flow=flows[i];
   checking+=flow.net;
   const requiredReserve=reserveAfterMonth[i];
   const savedProposal=proposalByMonth.get(flow.month);
   let proposalStatus:SavingsRow["proposalStatus"]="automatic";
   let proposal=Math.max(0,checking-requiredReserve);
   if(savedProposal?.status==="deleted"){proposal=0;proposalStatus="deleted";}
   else if(savedProposal?.status==="accepted"){proposal=Math.max(0,Number(savedProposal.amount));proposalStatus="accepted";}
   else if(savedProposal?.status==="modified"){proposal=Math.max(0,Number(savedProposal.amount));proposalStatus="modified";}
   if(proposal>0){checking-=proposal;savings+=proposal;}
   out.push({month:flow.month,checking,savings,proposal,income:flow.income,expense:flow.expense,requiredReserve,proposalStatus});
  }
  return out;
 },[source,destination,categories,snapshots,movements,recurrences,photoPayments,proposals]);
 if(!source||!destination)return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-xl font-semibold">Analyse du potentiel d’épargne</h2><p className="mt-2 text-sm text-neutral-700">Choisis dans Paramètres le compte courant analysé et le compte d’épargne destinataire.</p></section>;
 const max=Math.max(1,...rows.map(r=>r.savings));const points=rows.map((r,i)=>`${(i/Math.max(1,rows.length-1))*100},${92-(r.savings/max)*82}`).join(" ");
 return <div className="space-y-7"><section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6"><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Sparkles size={20}/></span><div><h2 className="text-xl font-semibold">Analyse du potentiel d’épargne</h2><p className="mt-1 text-sm text-neutral-600">Le moteur conserve au minimum 500 € sur {source.name}, ainsi que la réserve nécessaire pour couvrir les déficits prévus des mois suivants, avant de proposer un virement vers {destination.name}.</p></div></div></section>
 <section className="rounded-3xl border bg-white p-6"><h3 className="text-lg font-semibold">Évolution projetée sur 5 ans</h3><div className="mt-4 overflow-hidden rounded-2xl bg-neutral-50 p-3"><svg viewBox="0 0 100 100" className="h-56 w-full" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Épargne actuelle" value={money(rows[0]?.savings-(rows[0]?.proposal??0) || 0)}/><Metric label="Épargne dans 12 mois" value={money(rows[11]?.savings??0)}/><Metric label="Épargne dans 5 ans" value={money(rows.at(-1)?.savings??0)} dark/></div></section>
 <section className="rounded-3xl border bg-white p-6"><h3 className="text-lg font-semibold">Virements proposés</h3><div className="mt-4 space-y-3">{rows.filter(r=>r.proposal>0).slice(0,24).map(r=><div key={r.month} className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-violet-950">{r.proposalStatus==="accepted"?"Versement épargne accepté":r.proposalStatus==="modified"?"Versement épargne ajusté":"Versement épargne proposé"}</p><p className="mt-1 text-xs text-violet-800">1er {monthLabel(shift(r.month,1))} · {source.name} <ArrowRight className="inline" size={13}/> {destination.name}</p><p className="mt-1 text-xs text-violet-700">Réserve conservée après virement : {money(r.requiredReserve)}</p></div><p className="text-lg font-semibold text-violet-900">{money(r.proposal)}</p></div></div>)}</div></section></div>
}
function Metric({label,value,dark}:{label:string;value:string;dark?:boolean}){return <div className={`rounded-2xl p-4 ${dark?"bg-black text-white":"bg-neutral-100"}`}><p className="text-xs opacity-70">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>}
