"use client";

import { MovementDeleteChoices } from "@/components/perso/movement-delete-actions";
import { useMemo, useState } from "react";
import { AlertTriangle, Baby, BarChart3, Camera, Check, Pencil, Search, ShoppingCart, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { acceptSavingsProposal, deleteItem, deleteSavingsProposal, excludeRecurrenceOccurrence, setRecurrenceOverride, toggleUrssafContribution, toggleWeddingPayment, updateMovement, updateSavingsProposalAmount } from "@/app/(app)/perso/actions";
import { calculateSavingsPlan, mobilizableSavingsForAccount, type SavingsBudgetAllocation, type SavingsProposalDecision } from "@/lib/perso/savings-engine";
import { isBudgetActiveForMonth } from "@/lib/perso/budget-engine";

type Account={id:string;name:string;account_type:"checking"|"savings";is_default?:boolean;color?:string|null};
type Category={id:string;name:string;parent_id:string|null;monthly_budget:number;movement_type?:string;account_id?:string|null;budget_period?:"monthly"|"specific_month";budget_month?:string|null;budget_start_date?:string|null;budget_end_date?:string|null;is_primary_income?:boolean};
type Snapshot={account_id:string;balance:number;snapshot_date:string};
type Movement={id:string;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;completed_date?:string|null;recurrence_id?:string|null;transfer_group_id?:string|null;source_type?:string|null;source_key?:string|null;virtual_source?:boolean};
type Override={recurrence_id:string;occurrence_month:string;amount:number};
type Exclusion={recurrence_id:string;occurrence_date:string};
type Recurrence={id:string;account_id:string;destination_account_id:string|null;category_id:string|null;movement_type:"income"|"expense"|"transfer";label:string;amount:number;frequency:"weekly"|"monthly"|"quarterly"|"yearly";interval_count:number;start_date:string;end_date:string|null;annual_change_percent:number};
type PhotoPayment={id:string;display_name:string;wedding_date:string|null;payment_type:"deposit"|"balance";amount:number;expected_date:string|null;received_date:string|null;status:"expected"|"received"|"cancelled";accounting_status?:"expected"|"received"|"cancelled";personal_account_id:string|null};
type SavingsProfile={id:"profile-1"|"profile-2";label:string;sourceAccountId:string|null;destinationAccountId:string|null;threshold:number;primaryIncomeCategoryId?:string|null;primaryIncomeSource?:"category"|"weddings";proposalTiming?:"same_day"|"next_day"};
type SavingsProposalMeta={sourceAccountId:string;destinationAccountId:string;sourceMonth:string;automaticAmount:number;status:"automatic"|"pending"|"accepted";kind:"deposit"|"use";previousTransferGroupId?:string|null};
type ProjectedOperation={id:string;projected:boolean;recurrence_id?:string|null;account_id:string;category_id:string|null;movement_type:string;label:string;amount:number;movement_date:string;status:string;source_type?:string|null;source_key?:string|null;virtual_source?:boolean;photo?:boolean;photoPayment?:PhotoPayment;savingsProposal?:SavingsProposalMeta};
type Point={date:string;balances:Record<string,number>;checking:number;savings:number;total:number};
type UrssafState={contribution_month:string;account_id:string|null;is_completed:boolean;completed_date:string|null};
const iso=(d:Date)=>d.toISOString().slice(0,10);
const parse=(v:string)=>new Date(`${v}T12:00:00`);
const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(v);
const SAVINGS_FLOOR=30;
const formatLongDate=(value:string)=>new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric"}).format(parse(value));
function add(date:Date,f:Recurrence["frequency"],count:number){const d=new Date(date);if(f==="weekly")d.setDate(d.getDate()+7*count);else if(f==="monthly")d.setMonth(d.getMonth()+count);else if(f==="quarterly")d.setMonth(d.getMonth()+3*count);else d.setFullYear(d.getFullYear()+count);return d;}
function months12(){const out:string[]=[];const d=new Date();d.setDate(1);d.setHours(12,0,0,0);for(let i=0;i<12;i++){out.push(iso(d).slice(0,7));d.setMonth(d.getMonth()+1);}return out;}
function monthLabel(v:string){return new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(new Date(`${v}-01T12:00:00`));}
function occurrencesInMonth(r:Recurrence,month:string){const start=parse(r.start_date);const end=new Date(`${month}-01T12:00:00`);end.setMonth(end.getMonth()+1);let d=start,guard=0;const out:string[]=[];while(d<end&&guard++<2000){const day=iso(d);if(day.startsWith(month)&&(!r.end_date||day<=r.end_date))out.push(day);d=add(d,r.frequency,r.interval_count);}return out;}
function photoDate(p:PhotoPayment){return p.expected_date??p.received_date;}
function photoLabel(p:PhotoPayment){const kind=p.payment_type==="deposit"?"Acompte":"Solde";const date=p.wedding_date?new Intl.DateTimeFormat("fr-FR").format(parse(p.wedding_date)):"date à définir";return `Mariage ${p.display_name} ${date} · ${kind}`;}

export function ProjectionView({accounts,categories,snapshots,movements,recurrences,overrides=[],exclusions=[],photoPayments=[],photoDefaultAccountId=null,movementDefaultAccountId=null,urssafDefaultAccountId=null,urssafStates=[],savingsProposals=[],savingsBudgets=[],profiles=[],currentBalances={}}:{accounts:Account[];categories:Category[];snapshots:Snapshot[];movements:Movement[];recurrences:Recurrence[];overrides?:Override[];exclusions?:Exclusion[];photoPayments?:PhotoPayment[];photoDefaultAccountId?:string|null;movementDefaultAccountId?:string|null;urssafDefaultAccountId?:string|null;urssafStates?:UrssafState[];savingsProposals?:SavingsProposalDecision[];savingsBudgets?:SavingsBudgetAllocation[];profiles?:SavingsProfile[];currentBalances?:Record<string,number>}){
 const today=new Date();today.setHours(12,0,0,0);const todayIso=iso(today);const shiftMonth=(value:string,delta:number)=>{const d=new Date(`${value}-01T12:00:00`);d.setMonth(d.getMonth()+delta);return iso(d).slice(0,7);};const photoAccountingMonth=(p:PhotoPayment)=>(p.accounting_status==="received"?(p.received_date??p.expected_date):p.expected_date)?.slice(0,7)??null;const photoCaForMonth=(value:string)=>photoPayments.filter(p=>p.status!=="cancelled"&&photoAccountingMonth(p)===value).reduce((s,p)=>s+Number(p.amount),0);const urssafForMonth=(value:string)=>Math.round(photoCaForMonth(shiftMonth(value,-1))*0.216*100)/100;const urssafStateFor=(value:string)=>urssafStates.find(s=>String(s.contribution_month).slice(0,7)===value);const [years,setYears]=useState(3);const [cursor,setCursor]=useState(0);const [showSummary,setShowSummary]=useState(false);const [accountId,setAccountId]=useState("all");const selectedAccountColor=accountId==="all"?null:accounts.find(account=>account.id===accountId)?.color??null;const [month,setMonth]=useState(months12()[0]);const [simulationEnabled,setSimulationEnabled]=useState(false);const [simulationType,setSimulationType]=useState<"cash"|"credit">("cash");const [simulationName,setSimulationName]=useState("Nouvel achat");const [simulationAccountId,setSimulationAccountId]=useState(accounts.find(a=>a.account_type==="checking")?.id??"");const [simulationSavingsAccountId,setSimulationSavingsAccountId]=useState(accounts.find(a=>a.account_type==="savings")?.id??"");const [simulationDate,setSimulationDate]=useState(todayIso);const [simulationAmount,setSimulationAmount]=useState(0);const [simulationDownPayment,setSimulationDownPayment]=useState(0);const [simulationMonthlyPayment,setSimulationMonthlyPayment]=useState(0);const [simulationMonths,setSimulationMonths]=useState(24);const [simulationFirstPaymentDate,setSimulationFirstPaymentDate]=useState(todayIso);const [operationQuery,setOperationQuery]=useState("");const [operationType,setOperationType]=useState("all");const [operationSort,setOperationSort]=useState("date-asc");
 const categoryById=useMemo(()=>new Map(categories.map(c=>[c.id,c])),[categories]);
 const rootFor=(id:string|null)=>{let c=id?categoryById.get(id):undefined;while(c?.parent_id)c=categoryById.get(c.parent_id);return c?.id??null;};
 const categoryDisplay=(id:string|null)=>{if(!id)return "Sans catégorie";const c=categoryById.get(id);if(!c)return "Sans catégorie";let root=c;while(root.parent_id){const parent=categoryById.get(root.parent_id);if(!parent)break;root=parent;}if(Number(root.monthly_budget||0)>0)return c.id===root.id?`Budget ${root.name}`:`Budget ${root.name} · ${c.name}`;return c.name;};
 const budgetRoots=categories.filter(c=>!c.parent_id&&Number(c.monthly_budget||0)>0);
 const savingsPlans=useMemo(()=>profiles.filter(p=>p.sourceAccountId&&p.destinationAccountId).map(profile=>({profile,rows:calculateSavingsPlan({sourceAccountId:profile.sourceAccountId!,destinationAccountId:profile.destinationAccountId!,initialChecking:Number(currentBalances[profile.sourceAccountId!]??0),initialSavings:Number(currentBalances[profile.destinationAccountId!]??0),startMonth:todayIso.slice(0,7),accounts,categories,movements,recurrences,overrides,exclusions,photoPayments,photoDefaultAccountId,urssafStates,urssafDefaultAccountId,movementDefaultAccountId,savingsProposals,savingsBudgets,months:60,minReserve:profile.threshold,primaryIncomeCategoryId:profile.primaryIncomeCategoryId,primaryIncomeSource:profile.primaryIncomeSource,proposalTiming:profile.proposalTiming})})),[profiles,currentBalances,accounts,categories,movements,recurrences,overrides,exclusions,photoPayments,photoDefaultAccountId,urssafStates,urssafDefaultAccountId,movementDefaultAccountId,savingsProposals,savingsBudgets,todayIso]);
 const virtualSavingsOps=useMemo<ProjectedOperation[]>(()=>{
  const ops:ProjectedOperation[]=[];
  const proposalRows=savingsProposals??[];
  const firstDeficitDate=(profile:SavingsProfile,row:(typeof savingsPlans)[number]["rows"][number])=>{
   const monthStart=new Date(`${row.month}-01T12:00:00`);
   const monthEnd=new Date(monthStart);monthEnd.setMonth(monthEnd.getMonth()+1);monthEnd.setDate(0);
   let day=new Date(monthStart);
   if(row.month===todayIso.slice(0,7)){day=new Date(today);day.setDate(day.getDate()+1);}
   let balance=Number(row.openingChecking);
   const spentByRoot=new Map<string,number>();
   while(day<=monthEnd){
    const date=iso(day);
    movements.filter(m=>m.status==="planned"&&m.account_id===profile.sourceAccountId&&m.movement_date===date).forEach(m=>{const amount=Number(m.amount);balance+=["income","transfer_in"].includes(m.movement_type)?amount:-amount;if(m.movement_type==="expense"){const root=rootFor(m.category_id);if(root)spentByRoot.set(root,(spentByRoot.get(root)??0)+amount);}});
    for(const r of recurrences){
     if(exclusions.some(e=>e.recurrence_id===r.id&&e.occurrence_date===date)||movements.some(m=>m.recurrence_id===r.id&&m.movement_date===date))continue;
     if(!occurrencesInMonth(r,row.month).includes(date))continue;
     const ov=overrides.find(o=>o.recurrence_id===r.id&&o.occurrence_month.slice(0,7)===row.month);const amount=Number(ov?.amount??r.amount);
     if(r.movement_type==="income"&&r.account_id===profile.sourceAccountId)balance+=amount;
     else if(r.movement_type==="expense"&&r.account_id===profile.sourceAccountId){balance-=amount;const root=rootFor(r.category_id);if(root)spentByRoot.set(root,(spentByRoot.get(root)??0)+amount);}
     else if(r.movement_type==="transfer"){if(r.account_id===profile.sourceAccountId)balance-=amount;if(r.destination_account_id===profile.sourceAccountId)balance+=amount;}
    }
    photoPayments.filter(p=>p.status==="expected"&&photoDate(p)===date&&(p.personal_account_id??photoDefaultAccountId)===profile.sourceAccountId).forEach(p=>balance+=Number(p.amount));
    const tomorrow=new Date(day);tomorrow.setDate(tomorrow.getDate()+1);
    if(tomorrow.getMonth()!==day.getMonth()){
     const state=urssafStateFor(row.month);const urssafAccount=state?.account_id??urssafDefaultAccountId;const urssafAmount=urssafForMonth(row.month);if(urssafAmount>0&&!state?.is_completed&&urssafAccount===profile.sourceAccountId)balance-=urssafAmount;
     for(const b of budgetRoots){if(!isBudgetActiveForMonth(b,row.month))continue;const target=b.account_id??movementDefaultAccountId??accounts.find(a=>a.account_type==="checking"&&a.is_default)?.id??accounts.find(a=>a.account_type==="checking")?.id??null;if(target!==profile.sourceAccountId)continue;const remaining=Math.max(0,Number(b.monthly_budget)-(spentByRoot.get(b.id)??0));balance-=remaining;}
    }
    if(balance<0)return date;
    day=tomorrow;
   }
   return `${row.month}-28`;
  };
  for(const {profile,rows} of savingsPlans){
   for(const row of rows){
    if(row.proposal>0){
     const stored=proposalRows.find(p=>p.source_account_id===profile.sourceAccountId&&p.destination_account_id===profile.destinationAccountId&&String(p.source_month).slice(0,7)===row.month);
     // row.proposal est la proposition actuellement recalculée par le moteur.
     // Une ancienne ligne marquée « deleted » ne doit pas empêcher cette nouvelle
     // proposition d'être intégrée à la courbe, sinon l'épargne projetée augmente
     // tandis que le compte source conserve artificiellement le même excédent.
     {
      const movementDate=row.proposalDate??`${row.month}-28`;
      // Si une première proposition du mois a déjà été acceptée, row.proposal>0
      // représente désormais le deuxième passage autorisé par le moteur.
      const meta:SavingsProposalMeta={sourceAccountId:profile.sourceAccountId!,destinationAccountId:profile.destinationAccountId!,sourceMonth:row.month,automaticAmount:Number(row.proposal),status:stored?.status==="pending"?"pending":"automatic",kind:"deposit",previousTransferGroupId:stored?.status==="accepted"?stored.transfer_group_id??null:null};
      const label=`Versement épargne proposé · ${profile.label}`;
      ops.push({id:`saving-${profile.id}-${row.month}-out`,projected:false,account_id:profile.sourceAccountId!,category_id:null,movement_type:"transfer_out",label,amount:Number(row.proposal),movement_date:movementDate,status:"planned",savingsProposal:meta},{id:`saving-${profile.id}-${row.month}-in`,projected:false,account_id:profile.destinationAccountId!,category_id:null,movement_type:"transfer_in",label,amount:Number(row.proposal),movement_date:movementDate,status:"planned",savingsProposal:meta});
     }
    }
    if(row.savingsUsed>0){
     const stored=proposalRows.find(p=>p.source_account_id===profile.destinationAccountId&&p.destination_account_id===profile.sourceAccountId&&String(p.source_month).slice(0,7)===row.month);
     if(stored?.status!=="accepted"){
      const movementDate=row.savingsUseDate??firstDeficitDate(profile,row);
      const meta:SavingsProposalMeta={sourceAccountId:profile.destinationAccountId!,destinationAccountId:profile.sourceAccountId!,sourceMonth:row.month,automaticAmount:Number(row.savingsUsed),status:stored?.status==="pending"?"pending":"automatic",kind:"use"};
      const label=`Utilisation d'épargne conseillée · ${profile.label}`;
      ops.push({id:`saving-use-${profile.id}-${row.month}-out`,projected:false,account_id:profile.destinationAccountId!,category_id:null,movement_type:"transfer_out",label,amount:Number(row.savingsUsed),movement_date:movementDate,status:"planned",savingsProposal:meta},{id:`saving-use-${profile.id}-${row.month}-in`,projected:false,account_id:profile.sourceAccountId!,category_id:null,movement_type:"transfer_in",label,amount:Number(row.savingsUsed),movement_date:movementDate,status:"planned",savingsProposal:meta});
     }
    }
   }
  }
  return ops;
 },[savingsPlans,savingsProposals]);
 const projectionData=useMemo(()=>{
  const horizon=new Date(today);horizon.setFullYear(horizon.getFullYear()+years);
  const balances=new Map<string,number>();
  for(const a of accounts)balances.set(a.id,Number(currentBalances[a.id]??0));

  const monthExpenseByRoot=new Map<string,number>();
  for(const m of movements.filter(m=>m.status==="completed"&&["expense","income"].includes(m.movement_type))){
   const root=rootFor(m.category_id);
   if(root){const key=`${m.movement_date.slice(0,7)}:${root}`;monthExpenseByRoot.set(key,(monthExpenseByRoot.get(key)??0)+(m.movement_type==="income"?-1:1)*Number(m.amount));}
  }

  const daily:Point[]=[];
  let current=new Date(today);
  while(current<=horizon){
   const date=iso(current),monthKey=date.slice(0,7);
   const addExpense=(categoryId:string|null,value:number)=>{const root=rootFor(categoryId);if(root)monthExpenseByRoot.set(`${monthKey}:${root}`,(monthExpenseByRoot.get(`${monthKey}:${root}`)??0)+value);};
   const applyMovement=(m:Movement)=>{
    balances.set(m.account_id,(balances.get(m.account_id)??0)+(["income","transfer_in"].includes(m.movement_type)?Number(m.amount):-Number(m.amount)));
    if(m.movement_type==="expense")addExpense(m.category_id,Number(m.amount));
    else if(m.movement_type==="income")addExpense(m.category_id,-Number(m.amount));
   };

   // Tout mouvement non coché déjà échu est dû aujourd'hui. Les mouvements futurs
   // gardent leur date réelle. Cela évite de laisser artificiellement de l'argent
   // sur un compte jusqu'à la fin du mois.
   movements.filter(m=>m.status==="planned"&&(m.movement_date===date||(date===todayIso&&m.movement_date<todayIso))).forEach(applyMovement);

   // Les virements d'épargne calculés par le moteur J-2 / grâce 5 jours sont la seule
   // protection de trésorerie injectée dans Projection. Aucun second filet quotidien
   // ne vient les contredire.
   virtualSavingsOps.filter(o=>o.movement_date===date).forEach(o=>balances.set(o.account_id,(balances.get(o.account_id)??0)+(["income","transfer_in"].includes(o.movement_type)?Number(o.amount):-Number(o.amount))));

   // Récurrences, y compris les échéances passées non cochées qui restent dues aujourd'hui.
   for(const r of recurrences){
    const datesToApply=date===todayIso?occurrencesInMonth(r,monthKey).filter(d=>d<=todayIso):[date];
    for(const occurrenceDate of datesToApply){
     if(exclusions.some(e=>e.recurrence_id===r.id&&e.occurrence_date===occurrenceDate)||movements.some(m=>m.recurrence_id===r.id&&m.movement_date===occurrenceDate))continue;
     let occurrence=parse(r.start_date),guard=0;while(occurrence<parse(occurrenceDate)&&guard++<2000)occurrence=add(occurrence,r.frequency,r.interval_count);
     if(iso(occurrence)!==occurrenceDate||(r.end_date&&occurrenceDate>r.end_date))continue;
     const ov=overrides.find(o=>o.recurrence_id===r.id&&o.occurrence_month.slice(0,7)===occurrenceDate.slice(0,7));
     const value=Number(ov?.amount??r.amount);
     if(r.movement_type==="income"){balances.set(r.account_id,(balances.get(r.account_id)??0)+value);addExpense(r.category_id,-value);}
     else if(r.movement_type==="expense"){balances.set(r.account_id,(balances.get(r.account_id)??0)-value);addExpense(r.category_id,value);}
     else if(r.destination_account_id){balances.set(r.account_id,(balances.get(r.account_id)??0)-value);balances.set(r.destination_account_id,(balances.get(r.destination_account_id)??0)+value);}
    }
   }

   // PHOTO attendu : même règle pour un encaissement en retard non pointé.
   photoPayments.filter(p=>p.status==="expected"&&(photoDate(p)===date||(date===todayIso&&(photoDate(p)??"")<todayIso))).forEach(p=>{const id=p.personal_account_id??photoDefaultAccountId;if(id)balances.set(id,(balances.get(id)??0)+Number(p.amount));});

   const tomorrow=new Date(current);tomorrow.setDate(tomorrow.getDate()+1);
   const isMonthEnd=tomorrow.getMonth()!==current.getMonth();
   if(isMonthEnd){
    const urssafAmount=urssafForMonth(monthKey);const state=urssafStateFor(monthKey);const urssafAccount=state?.account_id??urssafDefaultAccountId;
    if(urssafAmount>0&&!state?.is_completed&&urssafAccount)balances.set(urssafAccount,(balances.get(urssafAccount)??0)-urssafAmount);

    // Les budgets sont consolidés une seule fois à la fin du mois après déduction
    // de tous les débits ET crédits rattachés au budget.
    for(const b of budgetRoots){
     if(!isBudgetActiveForMonth(b,monthKey))continue;
     const spent=monthExpenseByRoot.get(`${monthKey}:${b.id}`)??0;
     const remaining=Math.max(0,Number(b.monthly_budget)-spent);
     const target=b.account_id??movementDefaultAccountId??accounts.find(a=>a.account_type==="checking"&&a.is_default)?.id??accounts.find(a=>a.account_type==="checking")?.id??null;
     if(target&&remaining>0)balances.set(target,(balances.get(target)??0)-remaining);
    }
   }

   const copy=Object.fromEntries(balances);
   const checking=accounts.filter(a=>a.account_type==="checking").reduce((sum,a)=>sum+(balances.get(a.id)??0),0);
   const savings=accounts.filter(a=>a.account_type==="savings").reduce((sum,a)=>sum+(balances.get(a.id)??0),0);
   daily.push({date,balances:copy,checking,savings,total:checking+savings});
   current=tomorrow;
  }

  // Projection = consolidation mensuelle : un seul point de fin de mois. Le calcul
  // journalier reste interne pour ne perdre aucun mouvement ni aucune date d'épargne.
  const byMonth=new Map<string,Point>();
  for(const point of daily)byMonth.set(point.date.slice(0,7),point);
  return {points:Array.from(byMonth.values()),floorProtectionOps:[] as ProjectedOperation[]};
 },[accounts,currentBalances,movements,recurrences,overrides,exclusions,photoPayments,photoDefaultAccountId,urssafDefaultAccountId,urssafStates,years,todayIso,budgetRoots,categoryById,movementDefaultAccountId,virtualSavingsOps]);
 const points=projectionData.points;
 const floorProtectionOps=projectionData.floorProtectionOps;
 const accountSummaries=useMemo(()=>accounts.map(account=>{
  const values=points.map(point=>({date:point.date,balance:Number(point.balances[account.id]??0)}));
  const checkingFloor=profiles.find(profile=>profile.sourceAccountId===account.id)?.threshold??0;
  const firstRisk=account.account_type==="checking"?values.find(item=>item.balance<checkingFloor-0.009):values.find(item=>item.balance<=SAVINGS_FLOOR);
  const minimum=values.reduce((best,item)=>item.balance<best.balance?item:best,values[0]??{date:todayIso,balance:Number(currentBalances[account.id]??0)});
  return {account,firstRisk:firstRisk??null,minimum};
 }),[accounts,points,todayIso,currentBalances,profiles]);
 const visibleSummaries=accountSummaries.filter(item=>accountId==="all"||item.account.id===accountId);
 const savingsExhaustionAlerts=accounts.filter(a=>a.account_type==="savings").flatMap(account=>{const first=points.find(point=>mobilizableSavingsForAccount(Number(point.balances[account.id]??0),account.id,savingsBudgets,SAVINGS_FLOOR)<=0.01);return first?[{account,date:first.date,total:Number(first.balances[account.id]??0)}]:[];});
 const savingsBudgetAlerts=accounts.filter(a=>a.account_type==="savings").flatMap(account=>{const rows=savingsBudgets.filter(b=>b.account_id===account.id&&b.allow_recovery&&b.protection!=="untouchable"&&Number(b.critical_threshold??0)>0);if(!rows.length)return [];const threshold=Math.max(...rows.map(b=>Number(b.critical_threshold??0)));const first=points.find(point=>{const available=mobilizableSavingsForAccount(Number(point.balances[account.id]??0),account.id,savingsBudgets,SAVINGS_FLOOR);return available>0.01&&available<=threshold;});return first?[{account,threshold,date:first.date,available:mobilizableSavingsForAccount(Number(first.balances[account.id]??0),account.id,savingsBudgets,SAVINGS_FLOOR)}]:[];});
 const monthOps=useMemo<ProjectedOperation[]>(()=>{const real:ProjectedOperation[]=movements.filter(m=>m.movement_date.startsWith(month)).map(m=>{const accepted=(savingsProposals??[]).find(p=>p.status==="accepted"&&p.transfer_group_id&&p.transfer_group_id===m.transfer_group_id);return {...m,projected:Boolean(m.virtual_source),savingsProposal:accepted?{sourceAccountId:accepted.source_account_id,destinationAccountId:accepted.destination_account_id,sourceMonth:String(accepted.source_month).slice(0,7),automaticAmount:Number(accepted.amount),status:"accepted" as const}:undefined} as ProjectedOperation;});const existing=new Set(movements.filter(m=>m.recurrence_id&&m.movement_date.startsWith(month)).map(m=>`${m.recurrence_id}:${m.movement_date}`));const generated:ProjectedOperation[]=[];for(const r of recurrences)for(const date of occurrencesInMonth(r,month)){if(existing.has(`${r.id}:${date}`)||exclusions.some(e=>e.recurrence_id===r.id&&e.occurrence_date===date))continue;const ov=overrides.find(o=>o.recurrence_id===r.id&&o.occurrence_month.slice(0,7)===month);generated.push({id:`rec-${r.id}-${date}`,projected:true,recurrence_id:r.id,account_id:r.account_id,category_id:r.category_id,movement_type:r.movement_type,label:r.label,amount:Number(ov?.amount??r.amount),movement_date:date,status:"planned"});}
  const photos:ProjectedOperation[]=photoPayments.filter(p=>p.status!=="cancelled"&&(photoDate(p)??"").startsWith(month)).map(p=>({id:`photo-${p.id}`,projected:false,account_id:p.personal_account_id??photoDefaultAccountId??"",category_id:null,movement_type:"income",label:photoLabel(p),amount:Number(p.amount),movement_date:photoDate(p)!,status:p.status==="received"?"completed":"planned",photo:true,photoPayment:p}));const urssafAmount=urssafForMonth(month);const urssafState=urssafStateFor(month);const monthEnd=(()=>{const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()+1);d.setDate(0);return iso(d);})();const urssaf:ProjectedOperation[]=urssafAmount>0?[{id:`urssaf-${month}`,projected:false,account_id:urssafState?.account_id??urssafDefaultAccountId??"",category_id:null,movement_type:"expense",label:`URSSAF · 21,6 % du CA photo de ${monthLabel(shiftMonth(month,-1))}`,amount:urssafAmount,movement_date:monthEnd,status:urssafState?.is_completed?"completed":"planned"}]:[];const proposedSavings=virtualSavingsOps.filter(o=>o.movement_date.startsWith(month)&&(accountId!=="all"||o.movement_type!=="transfer_in"));const floorProtection=floorProtectionOps.filter(o=>o.movement_date.startsWith(month)&&(accountId!=="all"||o.movement_type!=="transfer_in"));return [...real,...generated,...photos,...urssaf,...proposedSavings,...floorProtection].filter(o=>accountId==="all"||o.account_id===accountId).sort((a,b)=>a.movement_date.localeCompare(b.movement_date));},[month,movements,recurrences,overrides,exclusions,accountId,photoPayments,photoDefaultAccountId,urssafDefaultAccountId,urssafStates,virtualSavingsOps,floorProtectionOps,savingsProposals]);
 const budgetTarget=(b:Category)=>b.account_id??movementDefaultAccountId??accounts.find(a=>a.account_type==="checking"&&a.is_default)?.id??accounts.find(a=>a.account_type==="checking")?.id??null;
 const filteredMonthOps=useMemo(()=>{const q=operationQuery.trim().toLocaleLowerCase("fr");const isCredit=(o:ProjectedOperation)=>["income","transfer_in"].includes(o.movement_type);const isTransfer=(o:ProjectedOperation)=>["transfer","transfer_out","transfer_in"].includes(o.movement_type);return monthOps.filter(o=>(accountId==="all"||o.account_id===accountId)&&(!q||`${o.label} ${accounts.find(a=>a.id===o.account_id)?.name??""}`.toLocaleLowerCase("fr").includes(q))&&(operationType==="all"||(operationType==="credit"&&isCredit(o))||(operationType==="debit"&&!isCredit(o))||(operationType==="transfer"&&isTransfer(o))||(operationType==="photo"&&o.photo)||(operationType==="savings"&&Boolean(o.savingsProposal)))).sort((a,b)=>operationSort==="date-desc"?b.movement_date.localeCompare(a.movement_date):operationSort==="amount-desc"?Number(b.amount)-Number(a.amount):operationSort==="amount-asc"?Number(a.amount)-Number(b.amount):operationSort==="label"?a.label.localeCompare(b.label,"fr"):a.movement_date.localeCompare(b.movement_date));},[monthOps,operationQuery,operationType,operationSort,accountId,accounts]);
 const prioritySavingsOps=Array.from(
  monthOps
   .filter(o=>Boolean(o.savingsProposal))
   .reduce((map,o)=>{
    const proposal=o.savingsProposal!;
    const key=`${proposal.kind}:${proposal.sourceAccountId}:${proposal.destinationAccountId}:${proposal.sourceMonth}:${proposal.previousTransferGroupId??"current"}`;
    const existing=map.get(key);
    // Préférer la sortie si elle est visible, sinon conserver l’entrée. Ainsi le
    // bloc reste alimenté même quand le filtre de compte ne montre que le compte
    // destinataire du virement d’épargne.
    if(!existing||o.movement_type==="transfer_out")map.set(key,o);
    return map;
   },new Map<string,ProjectedOperation>())
   .values(),
 );
 const monthBudgets=budgetRoots.filter(b=>isBudgetActiveForMonth(b,month)&&(accountId==="all"||budgetTarget(b)===accountId)).map(b=>{const spent=monthOps.filter(o=>["expense","income"].includes(o.movement_type)&&rootFor(o.category_id)===b.id).reduce((sum,o)=>sum+(o.movement_type==="income"?-1:1)*Number(o.amount),0);return {...b,spent,remaining:Math.max(0,Number(b.monthly_budget)-spent)};});
 const safe=Math.min(cursor,Math.max(0,points.length-1));const selected=points[safe]??{date:todayIso,balances:{},checking:0,savings:0,total:0};const selectedValue=accountId==="all"?selected.checking:Number(selected.balances[accountId]??0);
 const chartValues=points.map(p=>accountId==="all"?p.checking:Number(p.balances[accountId]??0));
 const checkingAccounts=accounts.filter(a=>a.account_type==="checking");
 const savingsTotalValues=points.map(p=>p.savings);
 const savingsMobilizableValues=points.map(p=>accounts.filter(a=>a.account_type==="savings").reduce((sum,a)=>sum+mobilizableSavingsForAccount(Number(p.balances[a.id]??0),a.id,savingsBudgets,SAVINGS_FLOOR),0));
 const selectedMobilizableSavings=savingsMobilizableValues[safe]??0;
 const simulationProfile=profiles.find(profile=>profile.sourceAccountId===simulationAccountId)??null;
 const simulationSavingsAccount=accounts.find(account=>account.id===simulationSavingsAccountId&&account.account_type==="savings")??null;
 const simulationThreshold=Math.max(0,Number(simulationProfile?.threshold??0));
 const simulationOperationsForDate=(candidateDate:string)=>{
  const rows:{date:string;amount:number}[]=[];
  if(simulationType==="cash"){
   if(simulationAmount>0)rows.push({date:candidateDate,amount:Number(simulationAmount)});
   return rows;
  }
  if(simulationDownPayment>0)rows.push({date:candidateDate,amount:Number(simulationDownPayment)});
  if(simulationMonthlyPayment>0&&simulationMonths>0){
   const originalPurchase=parse(simulationDate);
   const originalFirst=parse(simulationFirstPaymentDate);
   const deltaDays=Math.round((originalFirst.getTime()-originalPurchase.getTime())/86400000);
   let d=parse(candidateDate);d.setDate(d.getDate()+deltaDays);
   for(let i=0;i<simulationMonths;i++){
    rows.push({date:iso(d),amount:Number(simulationMonthlyPayment)});
    d=new Date(d);d.setMonth(d.getMonth()+1);
   }
  }
  return rows;
 };
 const simulationOperations=useMemo(()=>simulationEnabled&&simulationAccountId?simulationOperationsForDate(simulationDate):[],[simulationEnabled,simulationType,simulationAccountId,simulationDate,simulationAmount,simulationDownPayment,simulationMonthlyPayment,simulationMonths,simulationFirstPaymentDate]);
 const simulationAnalysis=useMemo(()=>{
  const sourceId=simulationAccountId||null;
  const savingsId=simulationSavingsAccountId||null;
  const threshold=simulationThreshold;
  const pointByDate=new Map(points.map(point=>[point.date,point]));
  const monthEnd=(monthKey:string)=>{const d=new Date(`${monthKey}-01T12:00:00`);d.setMonth(d.getMonth()+1);d.setDate(0);return iso(d);};
  const evaluate=(candidateDate:string)=>{
   if(!sourceId)return {date:candidateDate,needed:0,available:0,savingsAfter:0,firstRisk:null as string|null,operations:[] as {date:string;amount:number}[]};
   const ops=simulationOperationsForDate(candidateDate).filter(op=>op.amount>0);
   const monthKey=candidateDate.slice(0,7);
   const last=monthEnd(monthKey);
   const window=points.filter(point=>point.date>=candidateDate&&point.date<=last);
   if(window.length===0)return {date:candidateDate,needed:0,available:0,savingsAfter:savingsId?Number(currentBalances[savingsId]??0):0,firstRisk:null,operations:ops};
   let cumulativePurchase=0;
   let needed=0;
   let firstRisk:string|null=null;
   for(const point of window){
    cumulativePurchase+=ops.filter(op=>op.date===point.date).reduce((sum,op)=>sum+Number(op.amount),0);
    const baseline=Number(point.balances[sourceId]??0);
    const simulatedWithoutExtraSavings=baseline-cumulativePurchase;
    const baselineGap=Math.max(0,threshold-baseline);
    const simulatedGap=Math.max(0,threshold-simulatedWithoutExtraSavings);
    const incrementalGap=Math.max(0,simulatedGap-baselineGap);
    if(incrementalGap>needed)needed=incrementalGap;
    if(firstRisk===null&&incrementalGap>0.009)firstRisk=point.date;
   }
   const purchaseTotalInMonth=ops.filter(op=>op.date>=candidateDate&&op.date<=last).reduce((sum,op)=>sum+Number(op.amount),0);
   needed=Math.min(Math.max(0,needed),Math.max(0,purchaseTotalInMonth));
   const firstPoint=pointByDate.get(candidateDate)??window[0];
   const baselineAtPurchase=Number(firstPoint?.balances[sourceId]??0);
   const available=Math.max(0,baselineAtPurchase-threshold);
   const savingsBaseline=savingsId?Number(firstPoint?.balances[savingsId]??currentBalances[savingsId]??0):0;
   const mobilisable=savingsId?mobilizableSavingsForAccount(savingsBaseline,savingsId,savingsBudgets,SAVINGS_FLOOR):0;
   const funded=savingsId?Math.min(needed,mobilisable):0;
   return {date:candidateDate,needed:Math.round(funded*100)/100,available:Math.round(available*100)/100,savingsAfter:Math.round((savingsBaseline-funded)*100)/100,firstRisk,operations:ops};
  };
  const selected=evaluate(simulationDate);
  const candidatesForMonths=(startMonth:string,count:number,includeStart:boolean)=>{
   const out:{date:string;needed:number;available:number;savingsAfter:number;firstRisk:string|null;operations:{date:string;amount:number}[]}[]=[];
   for(let offset=includeStart?0:1;offset<(includeStart?count:count+1);offset++){
    const monthKey=shiftMonth(startMonth,offset);
    const first=`${monthKey}-01`;const last=monthEnd(monthKey);
    for(const point of points){
     if(point.date<first||point.date>last)continue;
     if(point.date<todayIso)continue;
     out.push(evaluate(point.date));
    }
   }
   return out;
  };
  const best=(rows:ReturnType<typeof candidatesForMonths>)=>rows.reduce((winner,row)=>!winner||row.needed<winner.needed-0.009||(Math.abs(row.needed-winner.needed)<0.009&&row.date<winner.date)?row:winner,null as (typeof rows)[number]|null);
  const selectedMonth=simulationDate.slice(0,7);
  const bestMonth=best(candidatesForMonths(selectedMonth,1,true));
  const best3=best(candidatesForMonths(selectedMonth,3,false));
  const best12=best(candidatesForMonths(selectedMonth,12,true));
  return {selected,bestMonth,best3,best12,evaluate};
 },[points,simulationAccountId,simulationSavingsAccountId,simulationThreshold,simulationType,simulationDate,simulationAmount,simulationDownPayment,simulationMonthlyPayment,simulationMonths,simulationFirstPaymentDate,currentBalances,todayIso]);
 const simulationSeries=useMemo(()=>{
  const sourceId=simulationAccountId||null;
  const savingsId=simulationSavingsAccountId||null;
  const transferAmount=simulationEnabled?simulationAnalysis.selected.needed:0;
  const transferDate=simulationDate;
  const purchaseOps=simulationEnabled?simulationAnalysis.selected.operations:[];
  const details=points.map(()=>({savingsBalance:savingsId?Number(currentBalances[savingsId]??0):0,thresholdGap:0}));
  if(!simulationEnabled||!sourceId||purchaseOps.length===0)return {points,details,savingsTransferAmount:0,savingsBalanceAfterTransfer:savingsId?Number(currentBalances[savingsId]??0):0};
  const simulated=points.map((point,index)=>{
   const balances={...point.balances};
   const cumulativePurchase=purchaseOps.filter(op=>op.date<=point.date).reduce((sum,op)=>sum+Number(op.amount),0);
   const transferApplied=point.date>=transferDate?transferAmount:0;
   balances[sourceId]=Number(balances[sourceId]??0)-cumulativePurchase+transferApplied;
   if(savingsId)balances[savingsId]=Number(balances[savingsId]??0)-transferApplied;
   const checking=accounts.filter(a=>a.account_type==="checking").reduce((sum,a)=>sum+Number(balances[a.id]??0),0);
   const savings=accounts.filter(a=>a.account_type==="savings").reduce((sum,a)=>sum+Number(balances[a.id]??0),0);
   const baselineSource=Number(point.balances[sourceId]??0);
   const simulatedSource=Number(balances[sourceId]??0);
   const baselineGap=Math.max(0,simulationThreshold-baselineSource);
   const thresholdGap=Math.max(0,Math.max(0,simulationThreshold-simulatedSource)-baselineGap);
   details[index]={savingsBalance:savingsId?Number(balances[savingsId]??0):0,thresholdGap};
   return {...point,balances,checking,savings,total:checking+savings};
  });
  return {points:simulated,details,savingsTransferAmount:transferAmount,savingsBalanceAfterTransfer:simulationAnalysis.selected.savingsAfter};
 },[points,simulationEnabled,simulationAnalysis,simulationAccountId,simulationSavingsAccountId,simulationDate,accounts,currentBalances,simulationThreshold]);
 const simulatedPoints=simulationSeries.points;const shownPoints=simulationEnabled?simulatedPoints:points;const shownSelected=shownPoints[safe]??selected;const shownSelectedValue=accountId==="all"?shownSelected.checking:Number(shownSelected.balances[accountId]??0);const shownChartValues=shownPoints.map(point=>accountId==="all"?point.checking:Number(point.balances[accountId]??0));
 const checkingSeries=accountId==="all"
  ?checkingAccounts.map((account,index)=>({id:account.id,label:account.name,color:account.color??CHECKING_PALETTE[index%CHECKING_PALETTE.length],values:shownPoints.map(point=>Number(point.balances[account.id]??0))}))
  :[{id:accountId,label:accounts.find(a=>a.id===accountId)?.name??"Compte sélectionné",color:selectedAccountColor??CHECKING_PALETTE[0],values:shownChartValues}];
 const selectedSimulationDetail=simulationSeries.details[safe]??{savingsBalance:0,thresholdGap:0};const simulationImpactAtSelected=shownSelectedValue-selectedValue;const simulationEnd=shownPoints.at(-1)??shownSelected;const baselineEnd=points.at(-1)??selected;const simulationEndValue=accountId==="all"?simulationEnd.checking:Number(simulationEnd.balances[accountId]??0);const baselineEndValue=accountId==="all"?baselineEnd.checking:Number(baselineEnd.balances[accountId]??0);const simulationFirstRiskIndex=simulationEnabled?simulationSeries.details.findIndex(detail=>detail.thresholdGap>0):-1;const simulationFirstRisk=simulationFirstRiskIndex>=0?shownPoints[simulationFirstRiskIndex]:null;
 return <div className="space-y-7"><section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><h2 className="text-xl font-semibold">Projection mensuelle</h2><p className="mt-1 text-sm text-neutral-500">Mouvements, crédits photo, virements d’épargne, budgets restants et protections de seuil sont intégrés dans une seule trajectoire. Aucun solde d’épargne n’est remonté artificiellement.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setShowSummary(true)} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium"><BarChart3 size={16}/>Résumé</button>{[1,3,5].map(y=><button key={y} onClick={()=>{setYears(y);setCursor(0)}} className={`rounded-xl px-4 py-2 text-sm ${years===y?"bg-black text-white":"bg-neutral-100"}`}>{y} an{y>1?"s":""}</button>)}</div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><label><span className="text-sm font-medium">Compte analysé</span><select value={accountId} onChange={e=>setAccountId(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border px-3"><option value="all">Tous les comptes courants</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label><span className="text-sm font-medium">Mois consulté</span><select value={selected.date.slice(0,7)} onChange={e=>{const i=points.findIndex(p=>p.date.slice(0,7)===e.target.value);setCursor(i<0?0:i)}} className="mt-2 min-h-12 w-full rounded-xl border bg-white px-3">{points.map((point,index)=><option key={`${point.date}-${index}`} value={point.date.slice(0,7)}>{monthLabel(point.date.slice(0,7))}</option>)}</select></label></div><details className="mt-5 rounded-2xl border border-black/10 bg-neutral-50"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4"><span className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white"><ShoppingCart size={18}/></span><span><span className="block font-semibold">Simuler un achat</span><span className="block text-xs text-neutral-500">Comparer l’impact sans modifier les données réelles.</span></span></span><span className="text-xl">+</span></summary><div className="border-t border-black/10 p-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label><span className="text-sm font-medium">Nom</span><input value={simulationName} onChange={e=>setSimulationName(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3"/></label><label><span className="text-sm font-medium">Mode</span><select value={simulationType} onChange={e=>setSimulationType(e.target.value as "cash"|"credit")} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3"><option value="cash">Paiement comptant</option><option value="credit">Achat à crédit</option></select></label><label><span className="text-sm font-medium">Compte débité</span><select value={simulationAccountId} onChange={e=>setSimulationAccountId(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3">{accounts.filter(account=>account.account_type==="checking").map(account=><option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label><span className="text-sm font-medium">Épargne à mobiliser si nécessaire</span><select value={simulationSavingsAccountId} onChange={e=>setSimulationSavingsAccountId(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3"><option value="">Ne pas utiliser d’épargne</option>{accounts.filter(account=>account.account_type==="savings").map(account=><option key={account.id} value={account.id}>{account.name} · {money(Number(currentBalances[account.id]??0))}</option>)}</select></label><label><span className="text-sm font-medium">Date d’achat</span><input type="date" value={simulationDate} onChange={e=>setSimulationDate(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3"/></label>{simulationType==="cash"?<label><span className="text-sm font-medium">Montant</span><input type="number" min="0" step="0.01" value={simulationAmount||""} onChange={e=>setSimulationAmount(Number(e.target.value))} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3"/></label>:<><label><span className="text-sm font-medium">Apport</span><input type="number" min="0" step="0.01" value={simulationDownPayment||""} onChange={e=>setSimulationDownPayment(Number(e.target.value))} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3"/></label><label><span className="text-sm font-medium">Mensualité</span><input type="number" min="0" step="0.01" value={simulationMonthlyPayment||""} onChange={e=>setSimulationMonthlyPayment(Number(e.target.value))} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3"/></label><label><span className="text-sm font-medium">Nombre de mensualités</span><input type="number" min="1" value={simulationMonths} onChange={e=>setSimulationMonths(Math.max(1,Number(e.target.value)))} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3"/></label><label><span className="text-sm font-medium">Première mensualité</span><input type="date" value={simulationFirstPaymentDate} onChange={e=>setSimulationFirstPaymentDate(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border bg-white px-3"/></label></>} </div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={()=>setSimulationEnabled(true)} className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white">Appliquer la simulation</button><button type="button" onClick={()=>setSimulationEnabled(false)} className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-medium">Désactiver</button></div>{simulationEnabled?<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Impact à la date consultée" value={`${simulationImpactAtSelected>0?"+":""}${money(simulationImpactAtSelected)}`} tone={simulationImpactAtSelected<0?"danger":"success"}/><Metric label="Montant d’épargne à utiliser" value={money(simulationSeries.savingsTransferAmount)} tone={simulationSeries.savingsTransferAmount>0?"warning":"success"}/><Metric label={`Solde ${simulationSavingsAccount?.name??"épargne"} après simulation`} value={simulationSavingsAccount?money(simulationSeries.savingsBalanceAfterTransfer):"Aucun compte sélectionné"} tone={simulationSavingsAccount&&selectedSimulationDetail.savingsBalance<=SAVINGS_FLOOR?"danger":"neutral"}/><Metric label={`Impact à ${years} an${years>1?"s":""}`} value={`${simulationEndValue-baselineEndValue>0?"+":""}${money(simulationEndValue-baselineEndValue)}`} tone={simulationEndValue-baselineEndValue<0?"danger":"success"}/><Metric label="Premier seuil non couvert" value={simulationFirstRisk?formatLongDate(simulationFirstRisk.date):"Aucun"} tone={simulationFirstRisk?"danger":"success"}/><Metric label="Meilleure date dans le mois sélectionné" value={simulationAnalysis.bestMonth?`${formatLongDate(simulationAnalysis.bestMonth.date)} · ${money(simulationAnalysis.bestMonth.needed)} d’épargne`:"Aucune date disponible"} tone="success"/><Metric label="Meilleure date dans les 3 mois suivants" value={simulationAnalysis.best3?`${formatLongDate(simulationAnalysis.best3.date)} · ${money(simulationAnalysis.best3.needed)} d’épargne`:"Aucune date disponible"} tone="success"/><Metric label="Meilleure date sur les 12 mois à venir" value={simulationAnalysis.best12?`${formatLongDate(simulationAnalysis.best12.date)} · ${money(simulationAnalysis.best12.needed)} d’épargne`:"Aucune date disponible"} tone="success"/></div>:null}</div></details><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label={simulationEnabled?"Solde avec simulation":"Solde projeté"} value={money(shownSelectedValue)}/><Metric label="Épargne totale projetée" value={money(shownSelected.savings)}/><Metric label="Épargne mobilisable" value={money(selectedMobilizableSavings)} tone={selectedMobilizableSavings<=0.01?"danger":"success"}/><Metric label="Patrimoine liquide" value={money(shownSelected.total)} dark/></div><ProjectionChart checkingSeries={checkingSeries} baselineValues={simulationEnabled?chartValues:undefined} savingsTotalValues={savingsTotalValues} savingsMobilizableValues={savingsMobilizableValues} cursor={safe}/><input type="range" min="0" max={Math.max(0,points.length-1)} value={safe} onChange={e=>setCursor(Number(e.target.value))} className="mt-4 w-full accent-black"/>{showSummary?<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6" onClick={()=>setShowSummary(false)}><div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold">Résumé des risques de projection</h3><p className="mt-1 text-sm text-neutral-500">Horizon analysé : {years} an{years>1?"s":""}. Le plancher des comptes épargne est fixé à {money(SAVINGS_FLOOR)}.</p></div><button type="button" onClick={()=>setShowSummary(false)} className="grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-100" aria-label="Fermer"><X size={18}/></button></div><div className="mt-5 divide-y divide-black/10 border-y border-black/10">{visibleSummaries.map(({account,firstRisk,minimum})=><div key={account.id} className="py-4"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="size-3 rounded-full" style={{backgroundColor:account.color??"#a3a3a3"}}/><div><p className="font-semibold">{account.name}</p><p className="text-xs text-neutral-500">{account.account_type==="checking"?"Compte courant":"Compte épargne"}</p></div></div><p className="text-sm font-semibold">Minimum : {money(minimum.balance)}</p></div>{firstRisk?<div className={`mt-3 flex items-start gap-2 text-sm ${account.account_type==="checking"?"text-red-700":"text-amber-700"}`}><AlertTriangle size={16} className="mt-0.5 shrink-0"/><p>{account.account_type==="checking"?<>Limite basse non couverte à partir du <strong>{formatLongDate(firstRisk.date)}</strong>, avec un solde projeté de {money(firstRisk.balance)}.</>:<>Capacité minimale potentiellement atteinte le <strong>{formatLongDate(firstRisk.date)}</strong>. Le compte est maintenu à {money(SAVINGS_FLOOR)}.</>}</p></div>:<p className="mt-3 text-sm text-emerald-700">{account.account_type==="checking"?"Aucune limite basse non couverte sur la période.":`Le plancher de ${money(SAVINGS_FLOOR)} n’est pas atteint sur la période.`}</p>}</div>)}</div>{savingsExhaustionAlerts.length?<div className="mt-5 grid gap-3">{savingsExhaustionAlerts.map(alert=><div key={`saving-exhausted-${alert.account.id}`} className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><p><strong>Épargne mobilisable épuisée · {alert.account.name}</strong><br/>Dans la période sélectionnée, l’épargne encore autorisée pour soutenir la trésorerie arrive à son terme le <strong>{formatLongDate(alert.date)}</strong>. Le solde total projeté du compte à cette date est de {money(alert.total)}, mais la partie mobilisable est de 0 €.</p></div></div>)}</div>:null}{savingsBudgetAlerts.length?<div className="mt-5 grid gap-3">{savingsBudgetAlerts.map(alert=><div key={`saving-budget-${alert.account.id}`} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><p><strong>Budget Épargne critique · {alert.account.name}</strong><br/>La capacité mobilisable pour les utilisations d’épargne conseillées atteint {money(alert.available)} le <strong>{formatLongDate(alert.date)}</strong> (seuil {money(alert.threshold)}).</p></div></div>)}</div>:null}</div></div>:null}</section>
 <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-xl font-semibold">Mouvements à venir sur 12 mois</h2><p className="mt-1 text-sm text-neutral-500">Les budgets affichent ce qui reste à débiter après les mouvements déjà enregistrés.</p></div><select value={month} onChange={e=>setMonth(e.target.value)} className="rounded-xl border px-3 py-2">{months12().map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select></div>{prioritySavingsOps.length>0?<div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="flex items-center gap-2"><Sparkles size={17} className="text-violet-700"/><h3 className="font-semibold text-violet-950">Propositions d’épargne du mois</h3></div><div className="mt-3 grid gap-3">{prioritySavingsOps.map(o=><div key={`priority-${o.id}`} className={`rounded-xl border bg-white p-4 ${o.savingsProposal?.kind==="use"?"border-amber-300":"border-violet-300"}`}><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><p className="font-medium">{o.label}</p><p className="text-xs text-neutral-500">Prévue le {new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(parse(o.movement_date))} · {accounts.find(a=>a.id===o.account_id)?.name??"Compte à définir"}</p></div><p className={`text-lg font-semibold ${o.savingsProposal?.kind==="use"?"text-amber-700":"text-violet-700"}`}>{money(Number(o.amount))}</p></div><div className="mt-3 flex flex-wrap gap-2"><form action={acceptSavingsProposal}><input type="hidden" name="source_account_id" value={o.savingsProposal!.sourceAccountId}/><input type="hidden" name="destination_account_id" value={o.savingsProposal!.destinationAccountId}/><input type="hidden" name="source_month" value={o.savingsProposal!.sourceMonth}/>{o.savingsProposal!.previousTransferGroupId?<input type="hidden" name="previous_transfer_group_id" value={o.savingsProposal!.previousTransferGroupId}/>:null}<input type="hidden" name="amount" value={o.amount}/><input type="hidden" name="return_view" value="projection"/><button disabled={o.savingsProposal!.status==="accepted"} className="flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs font-medium text-white disabled:bg-emerald-700"><Check size={14}/>{o.savingsProposal!.status==="accepted"?"Accepté":"Valider"}</button></form><details><summary className="flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-medium"><Pencil size={14}/>Modifier</summary><form action={updateSavingsProposalAmount} className="mt-2 flex gap-2"><input type="hidden" name="source_account_id" value={o.savingsProposal!.sourceAccountId}/><input type="hidden" name="destination_account_id" value={o.savingsProposal!.destinationAccountId}/><input type="hidden" name="source_month" value={o.savingsProposal!.sourceMonth}/>{o.savingsProposal!.previousTransferGroupId?<input type="hidden" name="previous_transfer_group_id" value={o.savingsProposal!.previousTransferGroupId}/>:null}<input type="hidden" name="return_view" value="projection"/><input name="amount" type="number" step="0.01" min="0.01" defaultValue={o.amount} className="w-32 rounded-xl border px-3 py-2"/><button className="rounded-xl bg-black px-3 py-2 text-xs text-white">Enregistrer</button></form></details><form action={deleteSavingsProposal}><input type="hidden" name="source_account_id" value={o.savingsProposal!.sourceAccountId}/><input type="hidden" name="destination_account_id" value={o.savingsProposal!.destinationAccountId}/><input type="hidden" name="source_month" value={o.savingsProposal!.sourceMonth}/>{o.savingsProposal!.previousTransferGroupId?<input type="hidden" name="previous_transfer_group_id" value={o.savingsProposal!.previousTransferGroupId}/>:null}<input type="hidden" name="return_view" value="projection"/><button className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700"><Trash2 size={14}/>Supprimer</button></form></div></div>)}</div></div>:<div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Aucune proposition d’épargne ou d’utilisation d’épargne pour ce mois.</div>}<div className="mt-5 grid gap-2 rounded-2xl border border-black/10 bg-neutral-50 p-3 md:grid-cols-[minmax(220px,1fr)_repeat(2,minmax(150px,auto))]"><label className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/><input value={operationQuery} onChange={e=>setOperationQuery(e.target.value)} placeholder="Rechercher dans ce mois…" className="h-10 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-sm"/></label><select value={operationType} onChange={e=>setOperationType(e.target.value)} className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"><option value="all">Tous les types</option><option value="credit">Crédits</option><option value="debit">Débits</option><option value="transfer">Virements</option><option value="photo">Mariages</option><option value="savings">Propositions d’épargne</option></select><label className="relative"><SlidersHorizontal size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/><select value={operationSort} onChange={e=>setOperationSort(e.target.value)} className="h-10 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-sm"><option value="date-asc">Date croissante</option><option value="date-desc">Date décroissante</option><option value="amount-desc">Montant décroissant</option><option value="amount-asc">Montant croissant</option><option value="label">Libellé A–Z</option></select></label></div>
 {monthBudgets.length>0?<div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{monthBudgets.map(b=><div key={b.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex justify-between"><p className="font-medium">Budget {b.name}</p><p className="font-semibold">{money(b.remaining)}</p></div><p className="mt-1 text-xs text-neutral-600">{money(Number(b.monthly_budget))} prévu · {money(b.spent)} déjà enregistré · {accounts.find(a=>a.id===budgetTarget(b))?.name??"Compte non défini"}</p></div>)}</div>:null}
 <div className="mt-5 space-y-3">{filteredMonthOps.length===0?<p className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">Aucun mouvement ne correspond aux filtres.</p>:filteredMonthOps.map(o=>{const childrenMovement=o.source_type==="children";return <div key={o.id} className={`rounded-2xl border p-4 ${childrenMovement?"border-amber-300 bg-amber-50":o.label.startsWith("Versement épargne proposé")?"border-violet-300 bg-violet-50":o.label.startsWith("Utilisation d'épargne conseillée")?"border-amber-300 bg-amber-50":""}`}><div className="flex justify-between gap-4"><div><p className="flex items-center gap-2 font-medium">{childrenMovement?<Baby size={15} className="text-amber-700"/>:o.photo?<Camera size={15} className="text-emerald-700"/>:null}{o.label}</p><p className="text-xs text-neutral-500">{new Intl.DateTimeFormat("fr-FR").format(parse(o.movement_date))} · {accounts.find(a=>a.id===o.account_id)?.name??"Compte à définir"} · {categoryDisplay(o.category_id)} · {o.status==="completed"?"déjà intégré au disponible":"prévision"}</p></div><p className={`font-semibold ${["income","transfer_in"].includes(o.movement_type)?"text-emerald-700":["transfer","transfer_out"].includes(o.movement_type)?"text-violet-700":"text-red-700"}`}>{["income","transfer_in"].includes(o.movement_type)?"+":"−"}{money(Number(o.amount))}</p></div>{childrenMovement?<p className="mt-3 text-xs font-medium text-amber-800">ENFANTS · mouvement synchronisé automatiquement. Les mouvements déjà pointés restent figés.</p>:o.savingsProposal?<div className="mt-3 flex flex-wrap items-start gap-3">{o.movement_type==="transfer_out"?<><form action={acceptSavingsProposal}><input type="hidden" name="source_account_id" value={o.savingsProposal.sourceAccountId}/><input type="hidden" name="destination_account_id" value={o.savingsProposal.destinationAccountId}/><input type="hidden" name="source_month" value={o.savingsProposal.sourceMonth}/>{o.savingsProposal.previousTransferGroupId?<input type="hidden" name="previous_transfer_group_id" value={o.savingsProposal.previousTransferGroupId}/>:null}<input type="hidden" name="amount" value={o.amount}/><input type="hidden" name="return_view" value="projection"/><button disabled={o.savingsProposal.status==="accepted"} className="flex items-center gap-2 rounded-xl bg-black px-3 py-2 text-xs font-medium text-white disabled:cursor-default disabled:bg-emerald-700"><Check size={14}/>{o.savingsProposal.status==="accepted"?"Accepté":"Accepter"}</button></form><details><summary className="flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-medium"><Pencil size={14}/>Modifier</summary><form action={updateSavingsProposalAmount} className="mt-2 flex gap-2"><input type="hidden" name="source_account_id" value={o.savingsProposal.sourceAccountId}/><input type="hidden" name="destination_account_id" value={o.savingsProposal.destinationAccountId}/><input type="hidden" name="source_month" value={o.savingsProposal.sourceMonth}/>{o.savingsProposal.previousTransferGroupId?<input type="hidden" name="previous_transfer_group_id" value={o.savingsProposal.previousTransferGroupId}/>:null}<input type="hidden" name="return_view" value="projection"/><input name="amount" type="number" step="0.01" min="0.01" defaultValue={o.amount} className="w-32 rounded-xl border px-3 py-2"/><button className="rounded-xl bg-black px-3 py-2 text-xs text-white">Enregistrer</button></form></details><form action={deleteSavingsProposal}><input type="hidden" name="source_account_id" value={o.savingsProposal.sourceAccountId}/><input type="hidden" name="destination_account_id" value={o.savingsProposal.destinationAccountId}/><input type="hidden" name="source_month" value={o.savingsProposal.sourceMonth}/>{o.savingsProposal.previousTransferGroupId?<input type="hidden" name="previous_transfer_group_id" value={o.savingsProposal.previousTransferGroupId}/>:null}<input type="hidden" name="return_view" value="projection"/><button className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700"><Trash2 size={14}/>Supprimer</button></form></>:<p className="flex items-center gap-2 text-xs font-medium text-violet-800"><Sparkles size={14}/>{o.savingsProposal.kind==="use"?"Crédit lié à l’utilisation d’épargne conseillée":"Crédit lié au versement proposé du compte source"}</p>}</div>:o.photo&&o.photoPayment?<form action={toggleWeddingPayment.bind(null,o.photoPayment.id,o.photoPayment.status!=="received",o.account_id||photoDefaultAccountId)} className="mt-3"><button className="text-xs font-medium text-emerald-700">{o.photoPayment.status==="received"?"Retirer du disponible, garder en prévision":"Intégrer au disponible aujourd’hui"}</button></form>:o.id.startsWith("urssaf-")?<form action={toggleUrssafContribution.bind(null,month,o.status!=="completed",o.account_id||urssafDefaultAccountId)} className="mt-3"><button className="text-xs font-medium text-sky-700">{o.status==="completed"?"Retirer du disponible, garder en prévision":"Intégrer au disponible aujourd’hui"}</button></form>:o.projected?<details className="mt-3"><summary className="flex cursor-pointer items-center gap-2 text-xs font-medium"><Pencil size={14}/>Modifier / Gérer l’échéance</summary><form action={setRecurrenceOverride} className="mt-2 flex gap-2"><input type="hidden" name="recurrence_id" value={o.recurrence_id??""}/><input type="hidden" name="occurrence_month" value={month}/><input name="amount" type="number" step="0.01" min="0.01" defaultValue={o.amount} className="rounded-xl border px-3 py-2"/><button className="rounded-xl bg-black px-3 text-sm text-white">Enregistrer</button></form><div className="mt-3"><MovementDeleteChoices movementId={null} recurrenceId={o.recurrence_id??null} occurrenceDate={o.movement_date} projected/></div></details>:<details className="mt-3"><summary className="flex cursor-pointer items-center gap-2 text-xs font-medium"><Pencil size={14}/>Modifier / Supprimer</summary><form action={updateMovement} className="mt-3 grid gap-2 sm:grid-cols-2"><input type="hidden" name="id" value={o.id}/><input name="label" defaultValue={o.label} className="rounded-xl border px-3 py-2"/><input name="amount" type="number" step="0.01" min="0.01" defaultValue={o.amount} className="rounded-xl border px-3 py-2"/><input name="movement_date" type="date" defaultValue={o.movement_date} className="rounded-xl border px-3 py-2"/><select name="account_id" defaultValue={o.account_id} className="rounded-xl border px-3 py-2">{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><input type="hidden" name="category_id" value={o.category_id??""}/><button className="rounded-xl bg-black px-3 py-2 text-sm text-white">Enregistrer</button></form><div className="mt-3"><MovementDeleteChoices movementId={o.id} recurrenceId={o.recurrence_id??null} occurrenceDate={o.movement_date} projected={false}/></div></details>}</div>})}</div></section></div>;
}
function ProjectionChart({checkingSeries,baselineValues,savingsTotalValues,savingsMobilizableValues,cursor}:{checkingSeries:{id:string;label:string;color:string;values:number[]}[];baselineValues?:number[];savingsTotalValues:number[];savingsMobilizableValues:number[];cursor:number}){
 const firstSeries=checkingSeries[0]?.values??[];
 if(firstSeries.length<2)return null;
 const maxBuckets=180;
 const bucketSize=Math.max(1,Math.ceil(firstSeries.length/maxBuckets));
 const sampledIndexes=(series:number[])=>{const selectedIndexes=new Set<number>([0,series.length-1]);for(let start=0;start<series.length;start+=bucketSize){const end=Math.min(series.length,start+bucketSize);let minIndex=start,maxIndex=start;for(let index=start+1;index<end;index++){if(series[index]<series[minIndex])minIndex=index;if(series[index]>series[maxIndex])maxIndex=index;}selectedIndexes.add(minIndex);selectedIndexes.add(maxIndex);}return [...selectedIndexes].sort((a,b)=>a-b).map(index=>({index,value:series[index]}));};
 const allValues=[...checkingSeries.flatMap(series=>series.values),...savingsTotalValues,...savingsMobilizableValues,...(baselineValues??[]),0];
 const rawMin=Math.min(...allValues),rawMax=Math.max(...allValues);let axisMin=Math.floor(rawMin/1000)*1000,axisMax=Math.ceil(rawMax/1000)*1000;if(axisMin===axisMax){axisMin-=1000;axisMax+=1000;}const range=Math.max(1000,axisMax-axisMin);
 const yFor=(value:number)=>90-((value-axisMin)/range)*80;
 const linePoints=(series:number[])=>sampledIndexes(series).map(point=>`${(point.index/Math.max(1,series.length-1))*100},${yFor(point.value)}`).join(" ");
 const baselinePts=baselineValues?.length?linePoints(baselineValues):null,totalSavingsPts=linePoints(savingsTotalValues),mobilizablePts=linePoints(savingsMobilizableValues);
 const cursorX=(cursor/Math.max(1,firstSeries.length-1))*100;const gridValues:number[]=[];for(let value=axisMin;value<=axisMax;value+=1000)gridValues.push(value);
 return <div className="mt-6 overflow-hidden rounded-2xl bg-neutral-50 p-3">
  <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
   {checkingSeries.map(series=><ProjectionLegendItem key={series.id} color={series.color} label={series.label} description="Solde projeté du compte courant"/>)}
   <ProjectionLegendItem color="#0284c7" label="Épargne totale" description="Somme projetée des comptes d’épargne"/>
   <ProjectionLegendItem color="#16a34a" label="Épargne mobilisable" description="Part d’épargne réellement disponible pour la trésorerie" dashed/>
  </div>
  <svg viewBox="0 0 100 100" className="h-52 w-full" preserveAspectRatio="none" role="img" aria-label="Évolution séparée des comptes courants, de l’épargne totale et de l’épargne mobilisable">
   {axisMax>0?<rect x="0" y="10" width="100" height={Math.max(0,yFor(0)-10)} fill="#16a34a" opacity=".035"/>:null}{axisMin<0?<rect x="0" y={yFor(0)} width="100" height={Math.max(0,90-yFor(0))} fill="#dc2626" opacity=".055"/>:null}
   {gridValues.map(value=><line key={value} x1="0" y1={yFor(value)} x2="100" y2={yFor(value)} stroke={value===0?"#dc2626":"currentColor"} strokeWidth={value===0?"1.8":"1"} opacity={value===0?".9":".14"} strokeDasharray={value===0?undefined:"2 2"} vectorEffect="non-scaling-stroke"/>)}
   {baselinePts?<polyline points={baselinePts} fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".18" strokeDasharray="3 2" vectorEffect="non-scaling-stroke"/>:null}
   <polyline points={totalSavingsPts} fill="none" stroke="#0284c7" strokeWidth="1.7" opacity=".9" vectorEffect="non-scaling-stroke"/>
   <polyline points={mobilizablePts} fill="none" stroke="#16a34a" strokeWidth="1.8" strokeDasharray="4 2" vectorEffect="non-scaling-stroke"/>
   {checkingSeries.map(series=><polyline key={series.id} points={linePoints(series.values)} fill="none" stroke={series.color} strokeWidth="1.9" vectorEffect="non-scaling-stroke"/>)}
   <line x1={cursorX} y1="5" x2={cursorX} y2="95" stroke="currentColor" opacity=".35" strokeDasharray="2 2" vectorEffect="non-scaling-stroke"/>
  </svg>
  <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500"><span>{money(axisMin)}</span><span className="font-medium text-red-600">Ligne rouge : 0 €</span><span>{money(axisMax)}</span></div>
 </div>
}
const CHECKING_PALETTE=["#111827","#7c3aed","#ea580c","#0891b2","#be123c","#4f46e5"];
function ProjectionLegendItem({color,label,description,dashed=false}:{color:string;label:string;description:string;dashed?:boolean}){
 return <div className="flex min-w-0 items-start gap-3 rounded-xl border border-black/10 bg-white/80 px-3 py-2.5">
  <svg width="46" height="14" viewBox="0 0 46 14" className="mt-0.5 shrink-0" aria-hidden="true">
   <line x1="2" y1="7" x2="44" y2="7" stroke={color} strokeWidth="3" strokeDasharray={dashed?"8 5":undefined} strokeLinecap="round"/>
  </svg>
  <div className="min-w-0">
   <p className="text-xs font-semibold leading-tight" style={{color}}>{label}</p>
   <p className="mt-1 text-[10px] leading-snug text-neutral-500">{description}</p>
  </div>
 </div>;
}
function Metric({label,value,dark,tone}:{label:string;value:string;dark?:boolean;tone?:"danger"|"success"|"warning"|"neutral"}){return <div className={`rounded-2xl p-4 ${dark?"bg-black text-white":tone==="danger"?"bg-red-50 text-red-800":tone==="success"?"bg-emerald-50 text-emerald-800":tone==="warning"?"bg-amber-50 text-amber-800":"bg-neutral-100"}`}><p className="text-xs opacity-70">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>}
