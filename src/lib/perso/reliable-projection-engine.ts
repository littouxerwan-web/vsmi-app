import { calculateBudgetUsage, isBudgetActiveForMonth } from './budget-engine';
import { mobilizableSavingsForAccount, type SavingsBudgetAllocation, type SavingsProposalDecision } from './savings-engine';

export type RPAccount={id:string;name:string;account_type:'checking'|'savings'|'crypto';is_default?:boolean};
export type RPCategory={id:string;name?:string;parent_id:string|null;monthly_budget:number;movement_type?:string;account_id?:string|null;budget_period?:'monthly'|'specific_month';budget_month?:string|null;budget_start_date?:string|null;budget_end_date?:string|null};
export type RPMovement={id:string;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;completed_date?:string|null;recurrence_id?:string|null;transfer_group_id?:string|null;source_type?:string|null;source_key?:string|null;virtual_source?:boolean};
export type RPRecurrence={id:string;account_id:string;destination_account_id:string|null;category_id:string|null;movement_type:'income'|'expense'|'transfer';label:string;amount:number;frequency:'weekly'|'monthly'|'quarterly'|'yearly';interval_count:number;start_date:string;end_date:string|null;annual_change_percent:number};
export type RPOverride={recurrence_id:string;occurrence_month:string;amount:number};
export type RPExclusion={recurrence_id:string;occurrence_date:string};
export type RPPhoto={id:string;display_name:string;wedding_date:string|null;payment_type:'deposit'|'balance';amount:number;expected_date:string|null;received_date:string|null;status:'expected'|'received'|'cancelled';accounting_status?:'expected'|'received'|'cancelled';personal_account_id:string|null};
export type RPUrssaf={contribution_month:string;account_id:string|null;is_completed:boolean;completed_date:string|null;amount_override?:number|null};
export type RPProfile={id:string;label:string;sourceAccountId:string|null;destinationAccountId:string|null;threshold:number};
export type RPSavingsMeta={sourceAccountId:string;destinationAccountId:string;sourceMonth:string;automaticAmount:number;status:'automatic'|'pending'|'accepted';kind:'deposit'|'use';previousTransferGroupId?:string|null};
export type RPOperation={id:string;projected:boolean;recurrence_id?:string|null;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;transfer_group_id?:string|null;source_type?:string|null;source_key?:string|null;virtual_source?:boolean;photo?:boolean;photoPayment?:RPPhoto;savingsProposal?:RPSavingsMeta;source?:'movement'|'recurrence'|'photo'|'urssaf'|'budget'|'savings'};
export type RPPoint={date:string;balances:Record<string,number>;checking:number;savings:number;crypto:number;total:number};
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
 const checkingAccounts=input.accounts.filter(a=>a.account_type==='checking');
 const savingsAccounts=input.accounts.filter(a=>a.account_type==='savings');
 const budgetCategories=input.categories.filter(c=>!c.parent_id&&Number(c.monthly_budget)>0);
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
 const photoAmountByMonth=new Map<string,number>();
 for(const p of input.photoPayments){
  if(p.status==='cancelled')continue;
  const m=String((p.accounting_status==='received'?(p.received_date??p.expected_date):p.expected_date)??'').slice(0,7);
  if(m)photoAmountByMonth.set(m,(photoAmountByMonth.get(m)??0)+Number(p.amount));
 }
 const urssafStateByMonth=new Map(input.urssafStates.map(s=>[String(s.contribution_month).slice(0,7),s]));
 for(let i=0;i<months;i++){
  const m=shiftMonth(startMonth,i),state=urssafStateByMonth.get(m);if(state?.is_completed)continue;
  const calculatedAmount=round(Number(photoAmountByMonth.get(shiftMonth(m,-1))??0)*0.216),amount=state?.amount_override!=null?round(Number(state.amount_override)):calculatedAmount,account=state?.account_id??input.urssafDefaultAccountId;if(amount>0&&account)ops.push({id:`urssaf-${m}`,projected:true,account_id:account,category_id:null,movement_type:'expense',label:`URSSAF · 21,6 % CA photo`,amount,movement_date:monthEnd(m),status:'planned',source:'urssaf'});
 }

 // Budgets : on réserve uniquement le VRAI reliquat du mois.
 // Les flux sont indexés une seule fois par mois + catégorie racine. Cela conserve
 // strictement le même calcul tout en évitant de rescanner tous les mouvements pour
 // chaque budget sur chacun des 60 mois.
 const recordedBudgetFlowsByKey=new Map<string,RPMovement[]>();
 for(const mv of input.movements){
  if(mv.status==='cancelled'||mv.movement_type==='transfer_in')continue;
  const rootId=root(mv.category_id);if(!rootId)continue;
  const key=`${mv.movement_date.slice(0,7)}:${rootId}`;
  const rows=recordedBudgetFlowsByKey.get(key);if(rows)rows.push(mv);else recordedBudgetFlowsByKey.set(key,[mv]);
 }
 const projectedBudgetFlowsByKey=new Map<string,RPOperation[]>();
 for(const o of ops){
  if(o.source!=='recurrence')continue;
  const rootId=root(o.category_id);if(!rootId)continue;
  const key=`${o.movement_date.slice(0,7)}:${rootId}`;
  const rows=projectedBudgetFlowsByKey.get(key);if(rows)rows.push(o);else projectedBudgetFlowsByKey.set(key,[o]);
 }
 for(let i=0;i<months;i++){
  const m=shiftMonth(startMonth,i);
  for(const b of budgetCategories){
   if(!isBudgetActiveForMonth(b,m))continue;
   const target=b.account_id??defaultChecking;if(!target)continue;
   const key=`${m}:${b.id}`;
   const {remaining}=calculateBudgetUsage(
    Number(b.monthly_budget),
    [...(recordedBudgetFlowsByKey.get(key)??[]),...(projectedBudgetFlowsByKey.get(key)??[])],
    b.movement_type??"expense",
   );
   if(remaining>0){
    // Le reliquat budgétaire n'est pas débité artificiellement en bloc le dernier jour.
    // Il est réparti sur chaque jour restant du mois afin de produire une trajectoire
    // de trésorerie prudente mais réaliste. Pour le mois courant, le lissage commence
    // aujourd'hui ; pour les mois futurs, il commence le 1er.
    const firstDay=m===startMonth?input.todayIso:`${m}-01`;
    const lastDay=monthEnd(m);
    const days:string[]=[];
    for(let d=firstDay;d<=lastDay;d=addDays(d,1))days.push(d);
    if(days.length){
     const cents=Math.round(remaining*100);
     const base=Math.floor(cents/days.length);
     let remainder=cents-base*days.length;
     days.forEach((date,index)=>{
      const dayCents=base+(remainder>0?1:0);
      if(remainder>0)remainder--;
      if(dayCents<=0)return;
      ops.push({id:`budget-${b.id}-${m}-${index}`,projected:true,account_id:target,category_id:b.id,movement_type:b.movement_type==='income'?'income':'expense',label:`Budget ${b.movement_type==='income'?'à créditer':'restant'} · ${b.name??'Budget'}`,amount:dayCents/100,movement_date:date,status:'planned',source:'budget'});
     });
    }
   }
  }
 }

 const baseOps=ops.sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id));
 const balances=new Map(input.accounts.map(a=>[a.id,round(Number(input.currentBalances[a.id]??0))]));
 const allOps:RPOperation[]=[...baseOps];const points:RPPoint[]=[];const audits:RPMonthAudit[]=[];const savingsWarnings:{month:string;checkingAccountId:string;savingsAccountId:string;required:number;available:number;missing:number}[]=[];
 const monthOps=new Map<string,RPOperation[]>();for(const o of baseOps){const m=o.movement_date.slice(0,7);monthOps.set(m,[...(monthOps.get(m)??[]),o])}
 const profileByChecking=new Map(input.profiles.filter(p=>p.sourceAccountId&&p.destinationAccountId).map(p=>[p.sourceAccountId!,p]));
 const proposalKey=(source:string,dest:string,m:string)=>`${source}:${dest}:${m}`;
 const pendingProposalByKey=new Map(input.savingsProposals.filter(p=>p.status==='pending').map(p=>[proposalKey(p.source_account_id,p.destination_account_id,String(p.source_month).slice(0,7)),p]));
 const acceptedProposalByKey=new Map(input.savingsProposals.filter(p=>p.status==='accepted'&&p.transfer_group_id).map(p=>[proposalKey(p.source_account_id,p.destination_account_id,String(p.source_month).slice(0,7)),p]));
 const pendingProposal=(source:string,dest:string,m:string)=>pendingProposalByKey.get(proposalKey(source,dest,m));
 const acceptedProposal=(source:string,dest:string,m:string)=>acceptedProposalByKey.get(proposalKey(source,dest,m));

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
  const accepted=acceptedProposal(source,dest,m);
  const meta:RPSavingsMeta={sourceAccountId:source,destinationAccountId:dest,sourceMonth:m,automaticAmount:amount,status:stored?'pending':'automatic',kind,previousTransferGroupId:accepted?.transfer_group_id??null};
  const group=`auto-${kind}-${source}-${dest}-${date}`;
  const out:RPOperation={id:`${group}-out`,projected:true,transfer_group_id:group,account_id:source,category_id:null,movement_type:'transfer_out',label,amount,movement_date:date,status:'planned',source:'savings',savingsProposal:meta};
  const inn:RPOperation={...out,id:`${group}-in`,account_id:dest,movement_type:'transfer_in'};
  apply(out);apply(inn);allOps.push(out,inn);monthOps.set(m,[...(monthOps.get(m)??[]),out,inn]);
  if(kind==='use'){
   // Impact signé sur les DEUX comptes : sortie de l'épargne, entrée sur le courant.
   audit.savingsUsed[source]=round((audit.savingsUsed[source]??0)-amount);
   audit.savingsUsed[dest]=round((audit.savingsUsed[dest]??0)+amount);
  }else{
   // Impact signé sur les DEUX comptes : sortie du courant, entrée sur l'épargne.
   audit.savingsDeposited[source]=round((audit.savingsDeposited[source]??0)-amount);
   audit.savingsDeposited[dest]=round((audit.savingsDeposited[dest]??0)+amount);
  }
  return amount;
 };
 const delta=(o:RPOperation)=>['income','transfer_in'].includes(o.movement_type)?Number(o.amount):-Number(o.amount);

 for(let mi=0;mi<months;mi++){
  const m=shiftMonth(startMonth,mi),rows=(monthOps.get(m)??[]).filter(o=>o.source!=='savings').sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id));
  const audit:RPMonthAudit={month:m,opening:Object.fromEntries([...balances].map(([k,v])=>[k,round(v)])),credits:{},debits:{},budgetDebits:{},savingsUsed:{},savingsDeposited:{},closing:{}};
  const rowsByAccount=new Map<string,RPOperation[]>();for(const o of rows){const accountRows=rowsByAccount.get(o.account_id);if(accountRows)accountRows.push(o);else rowsByAccount.set(o.account_id,[o]);}
  const windowMinimum=(checkingId:string,from:string,through:string)=>{
   let simulated=Number(balances.get(checkingId)??0),minimum=simulated;
   for(const o of rowsByAccount.get(checkingId)??[]){if(o.movement_date<from||o.movement_date>through)continue;simulated=round(simulated+delta(o));minimum=Math.min(minimum,simulated);}
   return round(minimum);
  };

  // Deux décisions de trésorerie par mois : début de mois puis le 15.
  // Chaque décision regarde uniquement la quinzaine qui suit : 1 -> 14, puis 15 -> fin du mois.
  const decisions=[{date:`${m}-01`,through:`${m}-14`},{date:`${m}-15`,through:monthEnd(m)}];
  let rowIndex=0;
  for(const decision of decisions){
   // Les flux antérieurs à la date de décision sont d'abord intégrés au solde réel de la projection.
   while(rowIndex<rows.length&&rows[rowIndex].movement_date<decision.date)apply(rows[rowIndex++],audit);

   // Dans le mois courant, aucune proposition n'est créée rétroactivement pour une date déjà passée.
   if(m===startMonth&&decision.date<input.todayIso)continue;

   for(const checking of checkingAccounts){
    const p=profileByChecking.get(checking.id);if(!p?.destinationAccountId)continue;
    const threshold=Math.max(0,Number(p.threshold||0));
    const minimum=windowMinimum(checking.id,decision.date,decision.through);

    if(minimum<threshold-0.009){
     const required=round(threshold-minimum);
     const savings=p.destinationAccountId;
     const avail=mobilizableSavingsForAccount(Number(balances.get(savings)??0),savings,input.savingsBudgets,SAVINGS_FLOOR);
     if(avail+0.009<required)savingsWarnings.push({month:m,checkingAccountId:checking.id,savingsAccountId:savings,required,available:round(avail),missing:round(required-avail)});
     if(avail>0.009)synthetic(m,decision.date,savings,checking.id,Math.min(required,avail),'use',`Utilisation d'épargne · ${p.label}`,audit);
     continue;
    }

    // Si toute la quinzaine reste au-dessus du seuil, seul l'excédent réellement sûr
    // sur cette fenêtre peut être proposé à l'épargne dès la date de décision.
    const surplus=round(Math.max(0,minimum-threshold));
    if(surplus>0.009)synthetic(m,decision.date,checking.id,p.destinationAccountId,surplus,'deposit',`Versement épargne proposé · ${p.label}`,audit);
   }
  }

  // Intègre ensuite les flux restant jusqu'à la fin du mois.
  while(rowIndex<rows.length)apply(rows[rowIndex++],audit);

  // Invariant physique : l'épargne ne peut jamais être négative.
  for(const a of savingsAccounts)if(Number(balances.get(a.id)??0)<0)balances.set(a.id,0);
  const copy=Object.fromEntries([...balances].map(([k,v])=>[k,round(v)]));audit.closing=copy;audits.push(audit);
  const checking=checkingAccounts.reduce((s,a)=>s+Number(copy[a.id]??0),0);const savings=savingsAccounts.reduce((s,a)=>s+Number(copy[a.id]??0),0);const crypto=input.accounts.filter(a=>a.account_type==='crypto').reduce((s,a)=>s+Number(copy[a.id]??0),0);
  points.push({date:monthEnd(m),balances:copy,checking:round(checking),savings:round(savings),crypto:round(crypto),total:round(checking+savings+crypto)});
 }
 return {points,operations:allOps.sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id)),operationsByMonth:monthOps,audits,savingsWarnings};
}
