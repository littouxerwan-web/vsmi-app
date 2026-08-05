import { calculateBudgetRemaining, createCategoryRootResolver, isBudgetActiveForMonth, resolveBudgetAccountId, type BudgetAccount } from "./budget-engine";

export type SavingsAccount = BudgetAccount;
export type SavingsCategory = { id:string; parent_id:string|null; monthly_budget:number; account_id?:string|null; movement_type?:string; budget_period?:"monthly"|"specific_month"; budget_month?:string|null; is_primary_income?:boolean; is_essential?:boolean };
export type SavingsMovement = { id?:string; account_id:string; category_id:string|null; movement_type:string; amount:number; movement_date:string; status:string; recurrence_id?:string|null; transfer_group_id?:string|null };
export type SavingsRecurrence = { id:string; account_id:string; destination_account_id:string|null; category_id:string|null; movement_type:"income"|"expense"|"transfer"; amount:number; frequency:string; interval_count:number; start_date:string; end_date:string|null; is_active?:boolean };
export type SavingsOverride={recurrence_id:string;occurrence_month:string;amount:number};
export type SavingsExclusion={recurrence_id:string;occurrence_date:string};
export type SavingsPhotoPayment={amount:number;expected_date:string|null;received_date:string|null;status:string;personal_account_id:string|null;accounting_status?:string};
export type SavingsUrssafState={contribution_month:string;account_id:string|null;is_completed:boolean};
export type SavingsProposalDecision={source_account_id:string;destination_account_id:string;source_month:string;amount:number;status:"pending"|"accepted"|"deleted";transfer_group_id?:string|null;calculation_base?:number|null};
export type SavingsPlanRow={
 month:string; openingChecking:number; checking:number; savings:number; proposal:number; savingsUsed:number;
 balanceAfterSavingsUse:number; income:number; expense:number; debitExcludingBudgetRemaining:number; budgetRemaining:number;
 balanceBeforeSavings:number; requiredReserve:number; proposalDate:string|null; savingsUseDate:string|null; cycleEndDate:string|null;
 lowestBalance:number; lowestBalanceDate:string|null; nextPrimaryIncomeDate:string|null; overdraftDate:string|null;
};
type Input={sourceAccountId:string;destinationAccountId:string;initialChecking:number;initialSavings:number;startMonth:string;accounts?:SavingsAccount[];categories:SavingsCategory[];movements:SavingsMovement[];recurrences:SavingsRecurrence[];overrides?:SavingsOverride[];exclusions?:SavingsExclusion[];photoPayments?:SavingsPhotoPayment[];photoDefaultAccountId?:string|null;urssafStates?:SavingsUrssafState[];urssafDefaultAccountId?:string|null;movementDefaultAccountId?:string|null;savingsProposals?:SavingsProposalDecision[];months?:number;minReserve?:number;primaryIncomeCategoryId?:string|null;primaryIncomeSource?:"category"|"weddings";proposalTiming?:"same_day"|"next_day"};
type DayFlow={income:number;expense:number;primaryIncome:number;budget:number};
const iso=(d:Date)=>d.toISOString().slice(0,10);
const shiftMonth=(m:string,n:number)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return iso(d).slice(0,7)};
const monthEnd=(m:string)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+1);d.setDate(0);return iso(d)};
const addOccurrence=(date:Date,f:string,n:number)=>{const d=new Date(date);if(f==="weekly")d.setDate(d.getDate()+7*n);else if(f==="quarterly")d.setMonth(d.getMonth()+3*n);else if(f==="yearly")d.setFullYear(d.getFullYear()+n);else d.setMonth(d.getMonth()+n);return d};
const addDays=(date:string,n:number)=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+n);return iso(d)};

export function calculateSavingsPlan(input:Input):SavingsPlanRow[]{
 const count=input.months??60,reserve=Math.max(0,Number(input.minReserve??500));
 const startDate=`${input.startMonth}-01`, endDate=monthEnd(shiftMonth(input.startMonth,count)); // one extra month to find next salary
 const root=createCategoryRootResolver(input.categories);
 const selected=input.primaryIncomeCategoryId?(root(input.primaryIncomeCategoryId)??input.primaryIncomeCategoryId):null;
 const primaryRoots=new Set(selected?[selected]:input.categories.filter(c=>c.is_primary_income).map(c=>root(c.id)??c.id));
 const accounts=input.accounts??[{id:input.sourceAccountId,account_type:"checking" as const,is_default:true},{id:input.destinationAccountId,account_type:"savings" as const}];
 const budgetRoots=input.categories.filter(c=>!c.parent_id&&c.movement_type!=="income"&&Number(c.monthly_budget)>0&&resolveBudgetAccountId(c,input.movementDefaultAccountId,accounts)===input.sourceAccountId);
 const overrides=new Map((input.overrides??[]).map(o=>[`${o.recurrence_id}:${String(o.occurrence_month).slice(0,7)}`,Number(o.amount)]));
 const excluded=new Set((input.exclusions??[]).map(e=>`${e.recurrence_id}:${e.occurrence_date}`));
 const materialized=new Set(input.movements.filter(m=>m.recurrence_id).map(m=>`${m.recurrence_id}:${m.movement_date}`));
 const acceptedGroups=new Set((input.savingsProposals??[]).filter(p=>p.status==="accepted"&&p.transfer_group_id).map(p=>p.transfer_group_id as string));
 const depositDecisions=new Map((input.savingsProposals??[]).filter(p=>p.source_account_id===input.sourceAccountId&&p.destination_account_id===input.destinationAccountId).map(p=>[String(p.source_month).slice(0,7),p]));
 const useDecisions=new Map((input.savingsProposals??[]).filter(p=>p.source_account_id===input.destinationAccountId&&p.destination_account_id===input.sourceAccountId).map(p=>[String(p.source_month).slice(0,7),p]));
 const flows=new Map<string,DayFlow>(), spent=new Map<string,number>();
 const flow=(date:string)=>{const f=flows.get(date)??{income:0,expense:0,primaryIncome:0,budget:0};flows.set(date,f);return f};
 const income=(date:string,amount:number,primary=false)=>{const f=flow(date);f.income+=amount;if(primary)f.primaryIncome+=amount};
 const expense=(date:string,amount:number,categoryId?:string|null,budget=false)=>{const f=flow(date);f.expense+=amount;if(budget)f.budget+=amount;const r=root(categoryId??null);if(r&&!budget){const k=`${date.slice(0,7)}:${r}`;spent.set(k,(spent.get(k)??0)+amount)}};
 for(const m of input.movements){if(m.movement_date<startDate||m.movement_date>endDate||m.account_id!==input.sourceAccountId||m.status!=="planned")continue;if(m.transfer_group_id&&acceptedGroups.has(m.transfer_group_id))continue;const a=Number(m.amount);if(["income","transfer_in"].includes(m.movement_type))income(m.movement_date,a,primaryRoots.has(root(m.category_id)??""));else expense(m.movement_date,a,m.category_id)}
 for(const r of input.recurrences.filter(r=>r.is_active!==false)){let d=new Date(`${r.start_date}T12:00:00`),guard=0;while(iso(d)<=endDate&&guard++<5000){const date=iso(d),month=date.slice(0,7);if(date>=startDate&&(!r.end_date||date<=r.end_date)&&!excluded.has(`${r.id}:${date}`)&&!materialized.has(`${r.id}:${date}`)){const a=overrides.get(`${r.id}:${month}`)??Number(r.amount);if(r.movement_type==="income"&&r.account_id===input.sourceAccountId)income(date,a,primaryRoots.has(root(r.category_id)??""));else if(r.movement_type==="expense"&&r.account_id===input.sourceAccountId)expense(date,a,r.category_id);else if(r.movement_type==="transfer"){if(r.account_id===input.sourceAccountId)expense(date,a);if(r.destination_account_id===input.sourceAccountId)income(date,a)}}d=addOccurrence(d,r.frequency,Math.max(1,Number(r.interval_count||1)))}}
 for(const p of input.photoPayments??[]){const date=p.status==="received"?(p.received_date??p.expected_date):p.expected_date;if(!date||date<startDate||date>endDate||p.status==="cancelled")continue;if((p.personal_account_id??input.photoDefaultAccountId)===input.sourceAccountId&&p.status==="expected")income(date,Number(p.amount),input.primaryIncomeSource==="weddings")}
 for(let i=0;i<=count;i++){const month=shiftMonth(input.startMonth,i),last=monthEnd(month),prev=shiftMonth(month,-1);const photoRevenue=(input.photoPayments??[]).filter(p=>p.status!=="cancelled"&&((p.accounting_status==="received"?(p.received_date??p.expected_date):p.expected_date)??"").startsWith(prev)).reduce((s,p)=>s+Number(p.amount),0);const state=(input.urssafStates??[]).find(s=>String(s.contribution_month).slice(0,7)===month);if(photoRevenue>0&&!state?.is_completed&&(state?.account_id??input.urssafDefaultAccountId)===input.sourceAccountId)expense(last,Math.round(photoRevenue*.216*100)/100);for(const b of budgetRoots)if(isBudgetActiveForMonth(b,month)){const remaining=calculateBudgetRemaining(Number(b.monthly_budget),spent.get(`${month}:${b.id}`)??0);if(remaining>0)expense(last,remaining,b.id,true)}}
 const dates:string[]=[];for(let d=new Date(`${startDate}T12:00:00`);iso(d)<=endDate;d.setDate(d.getDate()+1))dates.push(iso(d));
 const primaryDates=dates.filter(d=>(flows.get(d)?.primaryIncome??0)>0);
 let checking=Number(input.initialChecking),savings=Number(input.initialSavings);const rows:SavingsPlanRow[]=[];
 for(let i=0;i<count;i++){
  const month=shiftMonth(input.startMonth,i),first=`${month}-01`,last=monthEnd(month),opening=checking;let monthIncome=0,monthExpense=0,monthBudget=0;
  for(const date of dates.filter(d=>d>=first&&d<=last)){const f=flows.get(date);if(f){checking+=f.income-f.expense;monthIncome+=f.income;monthExpense+=f.expense;monthBudget+=f.budget}}
  const trigger=primaryDates.find(d=>d>=first&&d<=last)??null;
  const proposalDate=trigger?addDays(trigger,input.proposalTiming==="next_day"?1:0):last;
  const nextPrimary=primaryDates.find(d=>d>proposalDate)??null;const cycleEnd=nextPrimary?addDays(nextPrimary,-1):monthEnd(shiftMonth(month,1));
  let simulated=checking,lowest=checking,lowestDate=proposalDate,overdraftDate:string|null=checking<0?proposalDate:null;
  for(const date of dates.filter(d=>d>last&&d<=cycleEnd)){const f=flows.get(date);if(f)simulated+=f.income-f.expense;if(simulated<lowest){lowest=simulated;lowestDate=date}if(overdraftDate===null&&simulated<0)overdraftDate=date}
  const depositDecision=depositDecisions.get(month),useDecision=useDecisions.get(month);
  const automaticProposal=Math.max(0,Math.round((lowest-reserve)*100)/100);const needed=Math.max(0,Math.round((reserve-lowest)*100)/100);
  const acceptedDeposit=depositDecision?.status==="accepted"?Number(depositDecision.amount):0;const acceptedUse=useDecision?.status==="accepted"?Number(useDecision.amount):0;
  const proposal=acceptedDeposit>0?0:automaticProposal;const usable=acceptedUse>0?0:Math.min(needed,savings);
  checking-=acceptedDeposit; savings+=acceptedDeposit; checking+=acceptedUse; savings-=acceptedUse;
  checking-=proposal; savings+=proposal;
  const balanceBeforeSavings=checking+proposal;
  rows.push({month,openingChecking:opening,checking,savings,proposal,savingsUsed:usable,balanceAfterSavingsUse:checking+usable,income:monthIncome,expense:monthExpense,debitExcludingBudgetRemaining:monthExpense-monthBudget,budgetRemaining:monthBudget,balanceBeforeSavings,requiredReserve:reserve,proposalDate, savingsUseDate:needed>0?(overdraftDate?addDays(overdraftDate,-1):lowestDate):null,cycleEndDate:cycleEnd,lowestBalance:lowest,lowestBalanceDate:lowestDate,nextPrimaryIncomeDate:nextPrimary,overdraftDate});
 }
 return rows;
}
