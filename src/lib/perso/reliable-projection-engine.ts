import { buildBudgetStatements, type BudgetStatement } from './budget-engine';
import { addDays, monthEnd, shiftMonth, recurrenceOccurrences, occurrenceDate, accountingDate, projectionDate, decisionSlot } from './calendar';
import { mobilizableSavingsForAccount, type SavingsBudgetAllocation, type SavingsProposalDecision } from './savings-engine';

export type RPAccount={id:string;name:string;account_type:'checking'|'savings'|'crypto';is_default?:boolean};
export type RPCategory={id:string;name?:string;parent_id:string|null;monthly_budget:number;movement_type?:string;account_id?:string|null;budget_period?:'monthly'|'specific_month';budget_month?:string|null;budget_start_date?:string|null;budget_end_date?:string|null};
export type RPMovement={id:string;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;completed_date?:string|null;completed_at?:string|null;occurrence_date?:string|null;recurrence_id?:string|null;transfer_group_id?:string|null;source_type?:string|null;source_key?:string|null;virtual_source?:boolean};
export type RPRecurrence={id:string;account_id:string;destination_account_id:string|null;category_id:string|null;movement_type:'income'|'expense'|'transfer';label:string;amount:number;frequency:'weekly'|'monthly'|'quarterly'|'yearly';interval_count:number;start_date:string;end_date:string|null;annual_change_percent:number};
export type RPOverride={recurrence_id:string;occurrence_month:string;amount:number};
export type RPExclusion={recurrence_id:string;occurrence_date:string};
export type RPPhoto={id:string;display_name:string;wedding_date:string|null;payment_type:'deposit'|'balance';amount:number;expected_date:string|null;received_date:string|null;status:'expected'|'received'|'cancelled';accounting_status?:'expected'|'received'|'cancelled';personal_account_id:string|null};
export type RPUrssaf={contribution_month:string;account_id:string|null;is_completed:boolean;completed_date:string|null;amount_override?:number|null};
export type RPProfile={id:string;label:string;sourceAccountId:string|null;destinationAccountId:string|null;threshold:number};
export type RPSavingsMeta={sourceAccountId:string;destinationAccountId:string;sourceMonth:string;automaticAmount:number;status:'automatic'|'pending'|'accepted';kind:'deposit'|'use';decisionSlot:1|15;previousTransferGroupId?:string|null};
export type RPOperation={id:string;projected:boolean;occurrence_date?:string|null;original_date?:string;requested_amount?:number;unfunded_amount?:number;recurrence_id?:string|null;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;transfer_group_id?:string|null;source_type?:string|null;source_key?:string|null;virtual_source?:boolean;photo?:boolean;photoPayment?:RPPhoto;savingsProposal?:RPSavingsMeta;source?:'movement'|'recurrence'|'photo'|'urssaf'|'budget'|'savings'};
export type RPPoint={date:string;balances:Record<string,number>;checking:number;savings:number;crypto:number;total:number};
export type RPMonthAudit={month:string;opening:Record<string,number>;credits:Record<string,number>;debits:Record<string,number>;budgetDebits:Record<string,number>;savingsUsed:Record<string,number>;savingsDeposited:Record<string,number>;closing:Record<string,number>;budgets:BudgetStatement[];};

export type ProjectionInput={
 accounts:RPAccount[];categories:RPCategory[];movements:RPMovement[];recurrences:RPRecurrence[];overrides:RPOverride[];exclusions:RPExclusion[];photoPayments:RPPhoto[];photoDefaultAccountId:string|null;movementDefaultAccountId:string|null;urssafDefaultAccountId:string|null;urssafStates:RPUrssaf[];savingsProposals:SavingsProposalDecision[];savingsBudgets:SavingsBudgetAllocation[];profiles:RPProfile[];currentBalances:Record<string,number>;todayIso:string;months?:number;
};

const SAVINGS_FLOOR=30;
const round=(n:number)=>Math.round((Number(n)||0)*100)/100;
function changedRecurrenceAmount(r:RPRecurrence,date:string){
 const pct=Number(r.annual_change_percent||0)/100;if(!pct)return Number(r.amount);
 const years=Math.max(0,Number(date.slice(0,4))-Number(r.start_date.slice(0,4)));
 return round(Number(r.amount)*Math.pow(1+pct,years));
}
function photoDate(p:RPPhoto){return p.expected_date??p.received_date}
function photoLabel(p:RPPhoto){return `Mariage ${p.display_name} · ${p.payment_type==='deposit'?'Acompte':'Solde'}`}

export function buildReliableProjection(input:ProjectionInput){
 const months=Math.max(1,input.months??60);const startMonth=input.todayIso.slice(0,7);const horizonEnd=monthEnd(shiftMonth(startMonth,months-1));
 const accountById=new Map(input.accounts.map(a=>[a.id,a]));
 const checkingAccounts=input.accounts.filter(a=>a.account_type==='checking');
 const ops:RPOperation[]=[];
 const materialized=new Set(input.movements.filter(m=>m.recurrence_id).map(m=>`${m.recurrence_id}:${occurrenceDate(m)}`));
 const excluded=new Set(input.exclusions.map(e=>`${e.recurrence_id}:${e.occurrence_date}`));
 const override=new Map(input.overrides.map(o=>[`${o.recurrence_id}:${String(o.occurrence_month).slice(0,7)}`,Number(o.amount)]));

 // Le solde actuel contient déjà tout mouvement pointé. Seuls les mouvements non pointés sont projetés.
 for(const m of input.movements){
  if(m.status==='cancelled')continue;
  if(m.status==='completed'&&accountingDate(m)<=input.todayIso)continue;
  const date=projectionDate(m.status==='completed'?accountingDate(m):m.movement_date,input.todayIso);if(date>horizonEnd)continue;
  ops.push({...m,status:'planned',original_date:m.movement_date,occurrence_date:m.recurrence_id?occurrenceDate(m):null,movement_date:date,amount:Number(m.amount),projected:false,source:'movement'});
 }
 for(const r of input.recurrences){
  for(const originalDate of recurrenceOccurrences(r,`${startMonth}-01`,horizonEnd)){
   if(materialized.has(`${r.id}:${originalDate}`)||excluded.has(`${r.id}:${originalDate}`))continue;
   const date=originalDate<input.todayIso?input.todayIso:originalDate;
   const amount=override.get(`${r.id}:${originalDate.slice(0,7)}`)??changedRecurrenceAmount(r,originalDate);
   if(r.movement_type==='transfer'){
    ops.push({id:`rec-${r.id}-${originalDate}-out`,projected:true,recurrence_id:r.id,occurrence_date:originalDate,original_date:originalDate,transfer_group_id:`rec-${r.id}-${originalDate}`,account_id:r.account_id,category_id:r.category_id,movement_type:'transfer_out',label:r.label,amount,movement_date:date,status:'planned',source:'recurrence'});
    if(r.destination_account_id)ops.push({id:`rec-${r.id}-${originalDate}-in`,projected:true,recurrence_id:r.id,occurrence_date:originalDate,original_date:originalDate,transfer_group_id:`rec-${r.id}-${originalDate}`,account_id:r.destination_account_id,category_id:r.category_id,movement_type:'transfer_in',label:r.label,amount,movement_date:date,status:'planned',source:'recurrence'});
   }else ops.push({id:`rec-${r.id}-${originalDate}`,projected:true,recurrence_id:r.id,occurrence_date:originalDate,original_date:originalDate,account_id:r.account_id,category_id:r.category_id,movement_type:r.movement_type,label:r.label,amount,movement_date:date,status:'planned',source:'recurrence'});
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

 // Budgets are global monthly envelopes. The exact statements below also feed every card.
 const monthKeys=Array.from({length:months},(_,index)=>shiftMonth(startMonth,index));
 const budgetStatements=buildBudgetStatements({months:monthKeys,today:input.todayIso,categories:input.categories,
  accounts:input.accounts,movementDefaultAccountId:input.movementDefaultAccountId,movements:input.movements,futureOperations:ops});
 const issues:{date:string;message:string;operationId?:string}[]=[];
 for(const budget of budgetStatements){
  if(budget.uncommitted<=0)continue;
  if(!budget.account_id||!accountById.has(budget.account_id)){
   issues.push({date:`${budget.month}-01`,message:`Compte de projection manquant pour le budget ${budget.name}.`});continue;
  }
  const days:string[]=[];
  for(let date=budget.month===startMonth?input.todayIso:`${budget.month}-01`;date<=monthEnd(budget.month);date=addDays(date,1))days.push(date);
  const cents=Math.round(budget.uncommitted*100),base=Math.floor(cents/days.length),remainder=cents%days.length;
  days.forEach((date,index)=>{
   const amount=(base+(index<remainder?1:0))/100;if(!amount)return;
   ops.push({id:`budget-${budget.id}-${budget.month}-${index}`,projected:true,account_id:budget.account_id!,category_id:budget.id,
    movement_type:budget.movement_type==='income'?'income':'expense',label:`Budget restant · ${budget.name}`,amount,
    movement_date:date,status:'planned',source:'budget'});
  });
 }

 const balances=new Map(input.accounts.map(account=>[account.id,round(input.currentBalances[account.id]??0)]));
 const operations:RPOperation[]=[],points:RPPoint[]=[],trajectory:RPPoint[]=[],audits:RPMonthAudit[]=[];
 const savingsWarnings:{month:string;checkingAccountId:string;savingsAccountId:string;required:number;available:number;missing:number}[]=[];
 const snapshot=(date:string):RPPoint=>{
  const sum=(type:string)=>round(input.accounts.filter(a=>a.account_type===type).reduce((total,a)=>total+(balances.get(a.id)??0),0));
  const checking=sum('checking'),savings=sum('savings'),crypto=sum('crypto');
  return {date,balances:Object.fromEntries(balances),checking,savings,crypto,total:round(checking+savings+crypto)};
 };
 trajectory.push(snapshot(input.todayIso));
 // A job is one external flow or a whole internal transfer, never half a transfer.
 type Job={date:string;id:string;rows:RPOperation[]};
 const jobs:Job[]=[],groups=new Map<string,RPOperation[]>();
 for(const row of ops){
  if(row.transfer_group_id&&['transfer_out','transfer_in'].includes(row.movement_type)){
   const group=groups.get(row.transfer_group_id)??[];group.push(row);groups.set(row.transfer_group_id,group);
  }else jobs.push({date:row.movement_date,id:row.id,rows:[row]});
 }
 for(const [id,rows] of groups){
  const out=rows.filter(row=>row.movement_type==='transfer_out'),inn=rows.filter(row=>row.movement_type==='transfer_in');
  if(rows.length===2&&out.length===1&&inn.length===1){
   if(out[0].amount!==inn[0].amount||out[0].movement_date!==inn[0].movement_date||out[0].account_id===inn[0].account_id){
    issues.push({date:rows[0].movement_date,operationId:id,message:'Virement incohérent : montants, dates ou comptes incompatibles. Corriger les données avant de se fier à la projection.'});continue;
   }
   jobs.push({date:out[0].movement_date,id,rows:[out[0],inn[0]]});
  }else{
   // A common-account transfer has only one PERSO leg and crosses this perimeter.
   // A partially completed pair is instead an inconsistent internal transfer.
   const recorded=input.movements.filter(row=>row.transfer_group_id===id&&row.status!=='cancelled');
   if(rows.length!==1||recorded.length>1){issues.push({date:rows[0].movement_date,operationId:id,message:'Virement interne incomplet ou partiellement pointé : projection à vérifier.'});continue;}
   jobs.push({date:rows[0].movement_date,id,rows});
  }
 }
 jobs.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const plus=(row:RPOperation)=>['income','transfer_in'].includes(row.movement_type);
 const delta=(row:RPOperation)=>plus(row)?row.amount:-row.amount;
 const profileByChecking=new Map(input.profiles.filter(p=>p.sourceAccountId&&p.destinationAccountId).map(p=>[p.sourceAccountId!,p]));
 const decisionFor=(source:string,dest:string,month:string,slot:1|15)=>{
  const rows=input.savingsProposals.filter(p=>p.source_account_id===source&&p.destination_account_id===dest&&p.source_month.slice(0,7)===month);
  const exact=rows.find(p=>p.decision_slot===slot);if(exact)return exact;
  const legacy=rows.find(p=>!p.decision_slot);
  // Legacy accepted/deleted decisions were monthly. Preserve their whole-month scope.
  if(legacy?.status==='accepted'||legacy?.status==='deleted')return legacy;
  const firstSlot=month===startMonth?decisionSlot(input.todayIso):1;
  return slot===firstSlot?legacy:undefined;
 };
 const applyJob=(job:Job,audit:RPMonthAudit,savingsKind?:'use'|'deposit')=>{
  if(job.rows.some(row=>!accountById.has(row.account_id))){issues.push({date:job.date,operationId:job.id,message:'Compte absent : opération non applicable, projection incomplète.'});return;}
  const out=job.rows.find(row=>row.movement_type==='transfer_out');
  let amount:number|undefined;
  if(out&&accountById.get(out.account_id)?.account_type==='savings')amount=Math.min(round(out.amount),Math.max(0,balances.get(out.account_id)??0));
  for(const raw of job.rows){
   if(!accountById.has(raw.account_id)){issues.push({date:job.date,operationId:raw.id,message:'Compte absent de la projection.'});continue;}
   const actual=round(amount??raw.amount),shortfall=round(raw.amount-actual);
   const row={...raw,amount:actual,...(shortfall>0?{requested_amount:raw.amount,unfunded_amount:shortfall}:{})};
   balances.set(row.account_id,round((balances.get(row.account_id)??0)+delta(row)));
   operations.push(row);
   if(savingsKind){const impact=savingsKind==='use'?audit.savingsUsed:audit.savingsDeposited;impact[row.account_id]=round((impact[row.account_id]??0)+delta(row));}
   else{const totals=plus(row)?audit.credits:audit.debits;totals[row.account_id]=round((totals[row.account_id]??0)+actual);}
   if(row.source==='budget'&&!plus(row))audit.budgetDebits[row.account_id]=round((audit.budgetDebits[row.account_id]??0)+actual);
   if(accountById.get(row.account_id)?.account_type==='savings'&&(balances.get(row.account_id)??0)<0)
    issues.push({date:job.date,message:'Dépense d’épargne conservée intégralement : solde projeté déficitaire.',operationId:row.id});
  }
  if(amount!==undefined&&out&&amount<out.amount)issues.push({date:job.date,operationId:out.id,message:`Virement limité à ${amount} € ; ${round(out.amount-amount)} € non financés.`});
  trajectory.push(snapshot(job.date));
 };
 const windowMinimum=(accountId:string,from:string,through:string)=>{
  const simulated=new Map(balances);let minimum=simulated.get(accountId)??0;
  for(const job of jobs){if(job.date<from||job.date>through||job.rows.some(row=>!accountById.has(row.account_id)))continue;
   const out=job.rows.find(row=>row.movement_type==='transfer_out');
   const cap=out&&accountById.get(out.account_id)?.account_type==='savings'?Math.min(out.amount,Math.max(0,simulated.get(out.account_id)??0)):null;
   for(const row of job.rows)simulated.set(row.account_id,round((simulated.get(row.account_id)??0)+(plus(row)?1:-1)*(cap??row.amount)));
   minimum=Math.min(minimum,simulated.get(accountId)??0);
  }
  return minimum;
 };
 const synthetic=(month:string,date:string,slot:1|15,source:string,dest:string,requested:number,kind:'use'|'deposit',audit:RPMonthAudit)=>{
  const stored=decisionFor(source,dest,month,slot);
  if(stored?.status==='deleted'||stored?.status==='accepted')return 0;
  const available=kind==='use'?mobilizableSavingsForAccount(balances.get(source)??0,source,input.savingsBudgets,SAVINGS_FLOOR):Math.max(0,balances.get(source)??0);
  const automaticAmount=round(Math.max(0,Math.min(requested,available)));
  const amount=round(Math.min(automaticAmount,stored?.status==='pending'?Number(stored.amount):automaticAmount));if(amount<0.01)return 0;
  const group=`auto-${kind}-${source}-${dest}-${month}-${slot}`;
  const meta:RPSavingsMeta={sourceAccountId:source,destinationAccountId:dest,sourceMonth:month,decisionSlot:slot,automaticAmount,status:stored?'pending':'automatic',kind};
  const out:RPOperation={id:`${group}-out`,projected:true,transfer_group_id:group,account_id:source,category_id:null,movement_type:'transfer_out',
   label:kind==='use'?"Utilisation d'épargne":"Versement épargne proposé",amount,movement_date:date,status:'planned',source:'savings',savingsProposal:meta};
  applyJob({date,id:group,rows:[out,{...out,id:`${group}-in`,account_id:dest,movement_type:'transfer_in'}]},audit,kind);
  return amount;
 };
 let jobIndex=0;
 for(const month of monthKeys){
  const audit:RPMonthAudit={month,opening:Object.fromEntries(balances),credits:{},debits:{},budgetDebits:{},savingsUsed:{},savingsDeposited:{},closing:{},budgets:budgetStatements.filter(b=>b.month===month)};
  const unresolved=new Map<string,number>();
  const first=month===startMonth?input.todayIso:`${month}-01`;
  const decisions=[{date:first,slot:decisionSlot(first)},{date:`${month}-15`,slot:15 as const}].filter((d,i,rows)=>d.date>=first&&rows.findIndex(x=>x.slot===d.slot)===i);
  for(const decision of decisions){
   while(jobIndex<jobs.length&&jobs[jobIndex].date<decision.date)applyJob(jobs[jobIndex++],audit);
   for(const checking of checkingAccounts){
    const profile=profileByChecking.get(checking.id);if(!profile?.destinationAccountId)continue;
    const through=decision.slot===1?`${month}-14`:monthEnd(month),threshold=Math.max(0,profile.threshold);
    const minimum=windowMinimum(checking.id,decision.date,through),savings=profile.destinationAccountId;
    if(minimum<threshold-0.009){
     const required=round(threshold-minimum),available=mobilizableSavingsForAccount(balances.get(savings)??0,savings,input.savingsBudgets,SAVINGS_FLOOR);
     const applied=synthetic(month,decision.date,decision.slot,savings,checking.id,required,'use',audit);
     if(required-applied>0.009){unresolved.set(checking.id,round(required-applied));savingsWarnings.push({month,checkingAccountId:checking.id,savingsAccountId:savings,required,available:round(available),missing:round(required-applied)});}
    }else{
     const surplus=round(Math.max(0,windowMinimum(checking.id,decision.date,monthEnd(month))-threshold-(unresolved.get(checking.id)??0)));
     synthetic(month,decision.date,decision.slot,checking.id,savings,surplus,'deposit',audit);
    }
   }
  }
  while(jobIndex<jobs.length&&jobs[jobIndex].date<=monthEnd(month))applyJob(jobs[jobIndex++],audit);
  audit.closing=Object.fromEntries(balances);audits.push(audit);points.push(snapshot(monthEnd(month)));
 }
 const operationsByMonth=new Map<string,RPOperation[]>();
 for(const row of operations){const month=row.movement_date.slice(0,7),rows=operationsByMonth.get(month)??[];rows.push(row);operationsByMonth.set(month,rows);}
 return {points,trajectory,operations,operationsByMonth,audits,budgetStatements,savingsWarnings,issues};
}
