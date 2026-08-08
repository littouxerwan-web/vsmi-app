import { isBudgetActiveForMonth } from './budget-engine';
import { mobilizableSavingsForAccount, type SavingsBudgetAllocation, type SavingsProposalDecision } from './savings-engine';

export type RPAccount={id:string;name:string;account_type:'checking'|'savings';is_default?:boolean};
export type RPCategory={id:string;name?:string;parent_id:string|null;monthly_budget:number;account_id?:string|null;budget_period?:'monthly'|'specific_month';budget_month?:string|null;budget_start_date?:string|null;budget_end_date?:string|null};
export type RPMovement={id:string;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;completed_date?:string|null;recurrence_id?:string|null;transfer_group_id?:string|null};
export type RPRecurrence={id:string;account_id:string;destination_account_id:string|null;category_id:string|null;movement_type:'income'|'expense'|'transfer';label:string;amount:number;frequency:'weekly'|'monthly'|'quarterly'|'yearly';interval_count:number;start_date:string;end_date:string|null;annual_change_percent:number};
export type RPOverride={recurrence_id:string;occurrence_month:string;amount:number};
export type RPExclusion={recurrence_id:string;occurrence_date:string};
export type RPPhoto={id:string;display_name:string;wedding_date:string|null;payment_type:'deposit'|'balance';amount:number;expected_date:string|null;received_date:string|null;status:'expected'|'received'|'cancelled';accounting_status?:'expected'|'received'|'cancelled';personal_account_id:string|null};
export type RPUrssaf={contribution_month:string;account_id:string|null;is_completed:boolean;completed_date:string|null};
export type RPProfile={id:string;label:string;sourceAccountId:string|null;destinationAccountId:string|null;threshold:number};
export type RPSavingsMeta={sourceAccountId:string;destinationAccountId:string;sourceMonth:string;automaticAmount:number;status:'automatic'|'pending'|'accepted';kind:'deposit'|'use';previousTransferGroupId?:string|null};
export type RPOperation={id:string;projected:boolean;recurrence_id?:string|null;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;transfer_group_id?:string|null;savingsProposal?:RPSavingsMeta;source?:'movement'|'recurrence'|'photo'|'urssaf'|'budget'|'savings'};
export type RPPoint={date:string;balances:Record<string,number>;checking:number;savings:number;total:number};

type Input={
 accounts:RPAccount[];categories:RPCategory[];movements:RPMovement[];recurrences:RPRecurrence[];overrides:RPOverride[];exclusions:RPExclusion[];photoPayments:RPPhoto[];photoDefaultAccountId:string|null;movementDefaultAccountId:string|null;urssafDefaultAccountId:string|null;urssafStates:RPUrssaf[];savingsProposals:SavingsProposalDecision[];savingsBudgets:SavingsBudgetAllocation[];profiles:RPProfile[];currentBalances:Record<string,number>;todayIso:string;months?:number;
};

const SAVINGS_FLOOR=30;
const round=(n:number)=>Math.round((Number(n)||0)*100)/100;
const iso=(d:Date)=>d.toISOString().slice(0,10);
const parse=(s:string)=>new Date(`${s}T12:00:00`);
const monthEnd=(m:string)=>{const d=parse(`${m}-01`);d.setMonth(d.getMonth()+1);d.setDate(0);return iso(d)};
const shiftMonth=(m:string,n:number)=>{const d=parse(`${m}-01`);d.setMonth(d.getMonth()+n);return iso(d).slice(0,7)};
const addDays=(s:string,n:number)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const addOccurrence=(d:Date,f:RPRecurrence['frequency'],n:number)=>{const x=new Date(d);if(f==='weekly')x.setDate(x.getDate()+7*n);else if(f==='quarterly')x.setMonth(x.getMonth()+3*n);else if(f==='yearly')x.setFullYear(x.getFullYear()+n);else x.setMonth(x.getMonth()+n);return x};

function recurrenceOccurrences(r:RPRecurrence,start:string,end:string){
 const out:string[]=[];let d=parse(r.start_date),guard=0;const stop=parse(end);
 while(d<=stop&&guard++<10000){const day=iso(d);if(day>=start&&(!r.end_date||day<=r.end_date))out.push(day);d=addOccurrence(d,r.frequency,Math.max(1,Number(r.interval_count)||1));}
 return out;
}
function changedRecurrenceAmount(r:RPRecurrence,date:string){
 const pct=Number(r.annual_change_percent||0)/100;if(!pct)return Number(r.amount);
 const years=Math.max(0,Number(date.slice(0,4))-Number(r.start_date.slice(0,4)));
 return round(Number(r.amount)*Math.pow(1+pct,years));
}
function photoDate(p:RPPhoto){return p.expected_date??p.received_date}
function photoLabel(p:RPPhoto){return `Mariage ${p.display_name} · ${p.payment_type==='deposit'?'Acompte':'Solde'}`}

export function buildReliableProjection(input:Input){
 const months=Math.max(1,input.months??60);const startMonth=input.todayIso.slice(0,7);const horizonEnd=monthEnd(shiftMonth(startMonth,months-1));
 const accountById=new Map(input.accounts.map(a=>[a.id,a]));const categoryById=new Map(input.categories.map(c=>[c.id,c]));
 const root=(id:string|null)=>{let c=id?categoryById.get(id):undefined;const seen=new Set<string>();while(c?.parent_id&&!seen.has(c.id)){seen.add(c.id);c=categoryById.get(c.parent_id)}return c?.id??null};
 const defaultChecking=input.movementDefaultAccountId??input.accounts.find(a=>a.account_type==='checking'&&a.is_default)?.id??input.accounts.find(a=>a.account_type==='checking')?.id??null;
 const ops:RPOperation[]=[];
 const materialized=new Set(input.movements.filter(m=>m.recurrence_id).map(m=>`${m.recurrence_id}:${m.movement_date}`));
 const excluded=new Set(input.exclusions.map(e=>`${e.recurrence_id}:${e.occurrence_date}`));
 const override=new Map(input.overrides.map(o=>[`${o.recurrence_id}:${String(o.occurrence_month).slice(0,7)}`,Number(o.amount)]));

 // Le solde actuel contient déjà tout mouvement pointé. Seuls les mouvements non pointés sont projetés.
 for(const m of input.movements){
  if(m.status==='cancelled'||m.status==='completed')continue;
  let date=m.movement_date<input.todayIso?input.todayIso:m.movement_date;if(date>horizonEnd)continue;
  ops.push({...m,movement_date:date,amount:Number(m.amount),projected:false,source:'movement'});
 }
 for(const r of input.recurrences){
  for(const originalDate of recurrenceOccurrences(r,`${startMonth}-01`,horizonEnd)){
   if(materialized.has(`${r.id}:${originalDate}`)||excluded.has(`${r.id}:${originalDate}`))continue;
   const date=originalDate<input.todayIso?input.todayIso:originalDate;
   const amount=override.get(`${r.id}:${originalDate.slice(0,7)}`)??changedRecurrenceAmount(r,originalDate);
   if(r.movement_type==='transfer'){
    ops.push({id:`rec-${r.id}-${originalDate}-out`,projected:true,recurrence_id:r.id,transfer_group_id:`rec-${r.id}-${originalDate}`,account_id:r.account_id,category_id:r.category_id,movement_type:'transfer_out',label:r.label,amount,movement_date:date,status:'planned',source:'recurrence'});
    if(r.destination_account_id)ops.push({id:`rec-${r.id}-${originalDate}-in`,projected:true,recurrence_id:r.id,transfer_group_id:`rec-${r.id}-${originalDate}`,account_id:r.destination_account_id,category_id:r.category_id,movement_type:'transfer_in',label:r.label,amount,movement_date:date,status:'planned',source:'recurrence'});
   }else ops.push({id:`rec-${r.id}-${originalDate}`,projected:true,recurrence_id:r.id,account_id:r.account_id,category_id:r.category_id,movement_type:r.movement_type,label:r.label,amount,movement_date:date,status:'planned',source:'recurrence'});
  }
 }
 for(const p of input.photoPayments){
  if(p.status!=='expected')continue;const raw=photoDate(p);if(!raw)continue;const date=raw<input.todayIso?input.todayIso:raw;if(date>horizonEnd)continue;const account=p.personal_account_id??input.photoDefaultAccountId;if(!account)continue;
  ops.push({id:`photo-${p.id}`,projected:false,account_id:account,category_id:null,movement_type:'income',label:photoLabel(p),amount:Number(p.amount),movement_date:date,status:'planned',source:'photo'});
 }
 const photoMonthAmount=(m:string)=>input.photoPayments.filter(p=>p.status!=='cancelled'&&String((p.accounting_status==='received'?(p.received_date??p.expected_date):p.expected_date)??'').slice(0,7)===m).reduce((s,p)=>s+Number(p.amount),0);
 for(let i=0;i<months;i++){
  const m=shiftMonth(startMonth,i),state=input.urssafStates.find(s=>String(s.contribution_month).slice(0,7)===m);if(state?.is_completed)continue;
  const amount=round(photoMonthAmount(shiftMonth(m,-1))*0.216),account=state?.account_id??input.urssafDefaultAccountId;if(amount>0&&account)ops.push({id:`urssaf-${m}`,projected:true,account_id:account,category_id:null,movement_type:'expense',label:`URSSAF · 21,6 % CA photo`,amount,movement_date:monthEnd(m),status:'planned',source:'urssaf'});
 }

 // Budgets : on réserve uniquement le reliquat net du mois (débits - crédits rattachés).
 for(let i=0;i<months;i++){
  const m=shiftMonth(startMonth,i);
  for(const b of input.categories.filter(c=>!c.parent_id&&Number(c.monthly_budget)>0&&isBudgetActiveForMonth(c,m))){
   const target=b.account_id??defaultChecking;if(!target)continue;let netUsed=0;
   for(const o of ops.filter(o=>o.movement_date.slice(0,7)===m&&root(o.category_id)===b.id)){
    if(['expense','transfer_out'].includes(o.movement_type))netUsed+=Number(o.amount);else if(['income','transfer_in'].includes(o.movement_type))netUsed-=Number(o.amount);
   }
   const remaining=round(Math.max(0,Number(b.monthly_budget)-Math.max(0,netUsed)));
   if(remaining>0)ops.push({id:`budget-${b.id}-${m}`,projected:true,account_id:target,category_id:b.id,movement_type:'expense',label:`Budget restant · ${b.name??'Budget'}`,amount:remaining,movement_date:monthEnd(m),status:'planned',source:'budget'});
  }
 }

 const baseOps=ops.sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id));
 const balances=new Map(input.accounts.map(a=>[a.id,round(Number(input.currentBalances[a.id]??0))]));
 const allOps:RPOperation[]=[...baseOps];const points:RPPoint[]=[];
 const monthOps=new Map<string,RPOperation[]>();for(const o of baseOps){const m=o.movement_date.slice(0,7);monthOps.set(m,[...(monthOps.get(m)??[]),o])}
 const profileByChecking=new Map(input.profiles.filter(p=>p.sourceAccountId&&p.destinationAccountId).map(p=>[p.sourceAccountId!,p]));
 const pendingProposal=(source:string,dest:string,m:string)=>input.savingsProposals.find(p=>p.source_account_id===source&&p.destination_account_id===dest&&String(p.source_month).slice(0,7)===m&&p.status==='pending');

 const transferCaps=new Map<string,number>();
 const apply=(o:RPOperation)=>{
  const account=accountById.get(o.account_id);if(!account)return;const before=Number(balances.get(o.account_id)??0);const plus=['income','transfer_in'].includes(o.movement_type);let amount=Number(o.amount);
  if(o.movement_type==='transfer_in'&&o.transfer_group_id&&transferCaps.has(o.transfer_group_id))amount=Number(transferCaps.get(o.transfer_group_id));
  if(!plus&&account.account_type==='savings'){amount=Math.min(amount,Math.max(0,before));if(o.movement_type==='transfer_out'&&o.transfer_group_id)transferCaps.set(o.transfer_group_id,amount);}
  balances.set(o.account_id,round(plus?before+amount:before-amount));
 };
 const synthetic=(m:string,date:string,source:string,dest:string,amount:number,kind:'use'|'deposit',label:string)=>{
  amount=round(Math.max(0,amount));if(amount<0.01)return;
  const sourceAccount=accountById.get(source);const sourceBalance=Number(balances.get(source)??0);
  if(sourceAccount?.account_type==='savings')amount=Math.min(amount,mobilizableSavingsForAccount(sourceBalance,source,input.savingsBudgets,SAVINGS_FLOOR));else amount=Math.min(amount,Math.max(0,sourceBalance));
  if(amount<0.01)return;
  const stored=pendingProposal(source,dest,m);if(stored)amount=Math.min(amount,Number(stored.amount));
  const meta:RPSavingsMeta={sourceAccountId:source,destinationAccountId:dest,sourceMonth:m,automaticAmount:amount,status:stored?'pending':'automatic',kind};
  const group=`auto-${kind}-${source}-${dest}-${m}`;
  const out:RPOperation={id:`${group}-out`,projected:true,transfer_group_id:group,account_id:source,category_id:null,movement_type:'transfer_out',label,amount,movement_date:date,status:'planned',source:'savings',savingsProposal:meta};
  const inn:RPOperation={...out,id:`${group}-in`,account_id:dest,movement_type:'transfer_in'};
  apply(out);apply(inn);allOps.push(out,inn);monthOps.set(m,[...(monthOps.get(m)??[]),out,inn]);
 };

 for(let mi=0;mi<months;mi++){
  const m=shiftMonth(startMonth,mi),rows=(monthOps.get(m)??[]).filter(o=>o.source!=='savings').sort((a,b)=>a.movement_date.localeCompare(b.movement_date));
  const opening=new Map(balances);
  const firstNeedDate=(checkingId:string,threshold:number)=>{
   let bal=Number(opening.get(checkingId)??0);let first:string|null=null;
   const relevant=rows.filter(o=>o.account_id===checkingId).sort((a,b)=>a.movement_date.localeCompare(b.movement_date));
   for(const o of relevant){bal+=['income','transfer_in'].includes(o.movement_type)?Number(o.amount):-Number(o.amount);if(first===null&&bal<threshold-0.009)first=o.movement_date;}
   return first;
  };
  // Applique les flux réels/théoriques du mois dans l'ordre.
  for(const o of rows)apply(o);

  // Protection : l'épargne associée est mobilisée avant de laisser le courant sous son seuil.
  for(const checking of input.accounts.filter(a=>a.account_type==='checking')){
   const p=profileByChecking.get(checking.id);if(!p?.destinationAccountId)continue;const threshold=Math.max(0,Number(p.threshold||0));const bal=Number(balances.get(checking.id)??0);if(bal>=threshold-0.009)continue;
   const savings=p.destinationAccountId;const avail=mobilizableSavingsForAccount(Number(balances.get(savings)??0),savings,input.savingsBudgets,SAVINGS_FLOOR);const need=round(threshold-bal);const needDate=firstNeedDate(checking.id,threshold)??monthEnd(m);let useDate=addDays(needDate,-2);if(useDate<`${m}-01`)useDate=`${m}-01`;if(m===startMonth&&useDate<input.todayIso)useDate=input.todayIso;if(avail>0)synthetic(m,useDate,savings,checking.id,Math.min(need,avail),'use',`Utilisation d'épargne · ${p.label}`);
  }
  // Mise de côté : à la clôture mensuelle, tout excédent au-dessus du seuil est envoyé vers l'épargne associée.
  for(const checking of input.accounts.filter(a=>a.account_type==='checking')){
   const p=profileByChecking.get(checking.id);if(!p?.destinationAccountId)continue;const threshold=Math.max(0,Number(p.threshold||0));const bal=Number(balances.get(checking.id)??0);const surplus=round(bal-threshold);if(surplus>0)synthetic(m,monthEnd(m),checking.id,p.destinationAccountId,surplus,'deposit',`Versement épargne proposé · ${p.label}`);
  }
  // Invariant physique absolu : aucune épargne négative.
  for(const a of input.accounts.filter(a=>a.account_type==='savings'))if(Number(balances.get(a.id)??0)<0)balances.set(a.id,0);
  const copy=Object.fromEntries([...balances].map(([k,v])=>[k,round(v)]));const checking=input.accounts.filter(a=>a.account_type==='checking').reduce((s,a)=>s+Number(copy[a.id]??0),0);const savings=input.accounts.filter(a=>a.account_type==='savings').reduce((s,a)=>s+Number(copy[a.id]??0),0);
  points.push({date:monthEnd(m),balances:copy,checking:round(checking),savings:round(savings),total:round(checking+savings)});
 }
 return {points,operations:allOps.sort((a,b)=>a.movement_date.localeCompare(b.movement_date)),operationsByMonth:monthOps};
}
