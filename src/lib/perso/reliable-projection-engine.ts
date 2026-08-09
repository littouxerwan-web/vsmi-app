import { calculateBudgetUsage, isBudgetActiveForMonth } from './budget-engine';
import { mobilizableSavingsForAccount, type SavingsBudgetAllocation, type SavingsProposalDecision } from './savings-engine';

export type RPAccount={id:string;name:string;account_type:'checking'|'savings';is_default?:boolean};
export type RPCategory={id:string;name?:string;parent_id:string|null;monthly_budget:number;account_id?:string|null;budget_period?:'monthly'|'specific_month';budget_month?:string|null;budget_start_date?:string|null;budget_end_date?:string|null};
export type RPMovement={id:string;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;completed_date?:string|null;recurrence_id?:string|null;transfer_group_id?:string|null;source_type?:string|null;source_key?:string|null;virtual_source?:boolean};
export type RPRecurrence={id:string;account_id:string;destination_account_id:string|null;category_id:string|null;movement_type:'income'|'expense'|'transfer';label:string;amount:number;frequency:'weekly'|'monthly'|'quarterly'|'yearly';interval_count:number;start_date:string;end_date:string|null;annual_change_percent:number};
export type RPOverride={recurrence_id:string;occurrence_month:string;amount:number};
export type RPExclusion={recurrence_id:string;occurrence_date:string};
export type RPPhoto={id:string;display_name:string;wedding_date:string|null;payment_type:'deposit'|'balance';amount:number;expected_date:string|null;received_date:string|null;status:'expected'|'received'|'cancelled';accounting_status?:'expected'|'received'|'cancelled';personal_account_id:string|null};
export type RPUrssaf={contribution_month:string;account_id:string|null;is_completed:boolean;completed_date:string|null};
export type RPProfile={id:string;label:string;sourceAccountId:string|null;destinationAccountId:string|null;threshold:number};
export type RPSavingsMeta={sourceAccountId:string;destinationAccountId:string;sourceMonth:string;automaticAmount:number;status:'automatic'|'pending'|'accepted';kind:'deposit'|'use';previousTransferGroupId?:string|null};
export type RPOperation={id:string;projected:boolean;recurrence_id?:string|null;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;transfer_group_id?:string|null;source_type?:string|null;source_key?:string|null;virtual_source?:boolean;photo?:boolean;photoPayment?:RPPhoto;savingsProposal?:RPSavingsMeta;source?:'movement'|'recurrence'|'photo'|'urssaf'|'budget'|'savings'};
export type RPPoint={date:string;balances:Record<string,number>;checking:number;savings:number;total:number};
export type RPMonthAudit={month:string;opening:Record<string,number>;credits:Record<string,number>;debits:Record<string,number>;budgetDebits:Record<string,number>;savingsUsed:Record<string,number>;savingsDeposited:Record<string,number>;closing:Record<string,number>;};

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
  // PHOTO: une recette n'est projetée que si elle est encore réellement attendue côté PHOTO
  // ET qu'elle n'a pas déjà été intégrée manuellement dans PERSO.
  // `status` = état PERSO; `accounting_status` = état réel du paiement PHOTO.
  if(p.status!=='expected'||p.accounting_status==='received'||p.accounting_status==='cancelled')continue;const raw=photoDate(p);if(!raw)continue;const date=raw<input.todayIso?input.todayIso:raw;if(date>horizonEnd)continue;const account=p.personal_account_id??input.photoDefaultAccountId;if(!account)continue;
  ops.push({id:`photo-${p.id}`,projected:false,account_id:account,category_id:null,movement_type:'income',label:photoLabel(p),amount:Number(p.amount),movement_date:date,status:'planned',source:'photo',photo:true,photoPayment:p});
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
   const target=b.account_id??defaultChecking;if(!target)continue;
   const linked=ops.filter(o=>o.movement_date.slice(0,7)===m&&root(o.category_id)===b.id&&o.source!=="budget");
   const {remaining}=calculateBudgetUsage(Number(b.monthly_budget),linked);
   if(remaining>0)ops.push({id:`budget-${b.id}-${m}`,projected:true,account_id:target,category_id:b.id,movement_type:'expense',label:`Budget restant · ${b.name??'Budget'}`,amount:remaining,movement_date:monthEnd(m),status:'planned',source:'budget'});
  }
 }

 const baseOps=ops.sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id));
 const balances=new Map(input.accounts.map(a=>[a.id,round(Number(input.currentBalances[a.id]??0))]));
 const allOps:RPOperation[]=[...baseOps];const points:RPPoint[]=[];const audits:RPMonthAudit[]=[];
 const monthOps=new Map<string,RPOperation[]>();for(const o of baseOps){const m=o.movement_date.slice(0,7);monthOps.set(m,[...(monthOps.get(m)??[]),o])}
 const profileByChecking=new Map(input.profiles.filter(p=>p.sourceAccountId&&p.destinationAccountId).map(p=>[p.sourceAccountId!,p]));
 const pendingProposal=(source:string,dest:string,m:string)=>input.savingsProposals.find(p=>p.source_account_id===source&&p.destination_account_id===dest&&String(p.source_month).slice(0,7)===m&&p.status==='pending');

 const transferCaps=new Map<string,number>();
 const apply=(o:RPOperation,audit?:RPMonthAudit)=>{
  const account=accountById.get(o.account_id);if(!account)return;const before=Number(balances.get(o.account_id)??0);const plus=['income','transfer_in'].includes(o.movement_type);let amount=round(Number(o.amount));
  if(o.movement_type==='transfer_in'&&o.transfer_group_id&&transferCaps.has(o.transfer_group_id))amount=Number(transferCaps.get(o.transfer_group_id));
  if(!plus&&account.account_type==='savings'){amount=Math.min(amount,Math.max(0,before));if(o.movement_type==='transfer_out'&&o.transfer_group_id)transferCaps.set(o.transfer_group_id,amount);}
  balances.set(o.account_id,round(plus?before+amount:before-amount));
  if(audit){
   if(plus)audit.credits[o.account_id]=round((audit.credits[o.account_id]??0)+amount);else audit.debits[o.account_id]=round((audit.debits[o.account_id]??0)+amount);
   if(o.source==='budget'&&!plus)audit.budgetDebits[o.account_id]=round((audit.budgetDebits[o.account_id]??0)+amount);
  }
 };
 const synthetic=(m:string,date:string,source:string,dest:string,amount:number,kind:'use'|'deposit',label:string,audit:RPMonthAudit)=>{
  amount=round(Math.max(0,amount));if(amount<0.01)return 0;
  const sourceAccount=accountById.get(source);const sourceBalance=Number(balances.get(source)??0);
  if(sourceAccount?.account_type==='savings')amount=Math.min(amount,mobilizableSavingsForAccount(sourceBalance,source,input.savingsBudgets,SAVINGS_FLOOR));else amount=Math.min(amount,Math.max(0,sourceBalance));
  if(amount<0.01)return 0;
  const stored=pendingProposal(source,dest,m);if(stored)amount=Math.min(amount,Number(stored.amount));
  if(amount<0.01)return 0;
  const meta:RPSavingsMeta={sourceAccountId:source,destinationAccountId:dest,sourceMonth:m,automaticAmount:amount,status:stored?'pending':'automatic',kind};
  const group=`auto-${kind}-${source}-${dest}-${m}`;
  const out:RPOperation={id:`${group}-out`,projected:true,transfer_group_id:group,account_id:source,category_id:null,movement_type:'transfer_out',label,amount,movement_date:date,status:'planned',source:'savings',savingsProposal:meta};
  const inn:RPOperation={...out,id:`${group}-in`,account_id:dest,movement_type:'transfer_in'};
  apply(out);apply(inn);allOps.push(out,inn);monthOps.set(m,[...(monthOps.get(m)??[]),out,inn]);
  if(kind==='use')audit.savingsUsed[dest]=round((audit.savingsUsed[dest]??0)+amount);else audit.savingsDeposited[source]=round((audit.savingsDeposited[source]??0)+amount);
  return amount;
 };
 const delta=(o:RPOperation)=>['income','transfer_in'].includes(o.movement_type)?Number(o.amount):-Number(o.amount);
 const safeSurplus45=(checkingId:string,threshold:number,fromMonth:string)=>{
  let simulated=Number(balances.get(checkingId)??0);let minimum=simulated;const from=monthEnd(fromMonth);const through=addDays(from,45);
  for(const o of baseOps.filter(o=>o.account_id===checkingId&&o.movement_date>from&&o.movement_date<=through).sort((a,b)=>a.movement_date.localeCompare(b.movement_date))){simulated=round(simulated+delta(o));minimum=Math.min(minimum,simulated);}
  return round(Math.max(0,minimum-threshold));
 };

 for(let mi=0;mi<months;mi++){
  const m=shiftMonth(startMonth,mi),rows=(monthOps.get(m)??[]).filter(o=>o.source!=='savings').sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id));
  const audit:RPMonthAudit={month:m,opening:Object.fromEntries([...balances].map(([k,v])=>[k,round(v)])),credits:{},debits:{},budgetDebits:{},savingsUsed:{},savingsDeposited:{},closing:{}};
  const opening=new Map(balances);
  const needInfo=(checkingId:string,threshold:number)=>{
   let bal=Number(opening.get(checkingId)??0),minimum=bal,first:string|null=bal<threshold-0.009?`${m}-01`:null;
   for(const o of rows.filter(o=>o.account_id===checkingId).sort((a,b)=>a.movement_date.localeCompare(b.movement_date))){bal=round(bal+delta(o));if(bal<minimum)minimum=bal;if(first===null&&bal<threshold-0.009)first=o.movement_date;}
   return {minimum,first,required:round(Math.max(0,threshold-minimum))};
  };

  // 1. Flux du mois, une seule fois et dans l'ordre chronologique.
  for(const o of rows)apply(o,audit);

  // 2. Protection du seuil : besoin calculé sur le minimum intramensuel, pas uniquement sur la clôture.
  for(const checking of input.accounts.filter(a=>a.account_type==='checking')){
   const p=profileByChecking.get(checking.id);if(!p?.destinationAccountId)continue;const threshold=Math.max(0,Number(p.threshold||0));const info=needInfo(checking.id,threshold);if(info.required<=0.009)continue;
   const savings=p.destinationAccountId;const avail=mobilizableSavingsForAccount(Number(balances.get(savings)??0),savings,input.savingsBudgets,SAVINGS_FLOOR);if(avail<=0.009)continue;
   let needDate=info.first??monthEnd(m);let useDate=addDays(needDate,-2);if(useDate<`${m}-01`)useDate=`${m}-01`;if(m===startMonth&&useDate<input.todayIso)useDate=input.todayIso;
   synthetic(m,useDate,savings,checking.id,Math.min(info.required,avail),'use',`Utilisation d'épargne · ${p.label}`,audit);
  }

  // 3. Mise de côté prudente : seulement l'excédent qui reste sûr sur les 45 jours suivants.
  for(const checking of input.accounts.filter(a=>a.account_type==='checking')){
   const p=profileByChecking.get(checking.id);if(!p?.destinationAccountId)continue;const threshold=Math.max(0,Number(p.threshold||0));const balance=Number(balances.get(checking.id)??0);if(balance<=threshold+0.009)continue;
   const safe45=safeSurplus45(checking.id,threshold,m);const surplus=round(Math.min(balance-threshold,safe45));
   if(surplus>0.009)synthetic(m,monthEnd(m),checking.id,p.destinationAccountId,surplus,'deposit',`Versement épargne proposé · ${p.label}`,audit);
  }

  // 4. Invariants physiques : l'épargne ne peut jamais être négative.
  for(const a of input.accounts.filter(a=>a.account_type==='savings'))if(Number(balances.get(a.id)??0)<0)balances.set(a.id,0);
  const copy=Object.fromEntries([...balances].map(([k,v])=>[k,round(v)]));audit.closing=copy;audits.push(audit);
  const checking=input.accounts.filter(a=>a.account_type==='checking').reduce((s,a)=>s+Number(copy[a.id]??0),0);const savings=input.accounts.filter(a=>a.account_type==='savings').reduce((s,a)=>s+Number(copy[a.id]??0),0);
  points.push({date:monthEnd(m),balances:copy,checking:round(checking),savings:round(savings),total:round(checking+savings)});
 }
 return {points,operations:allOps.sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id)),operationsByMonth:monthOps,audits};
}
