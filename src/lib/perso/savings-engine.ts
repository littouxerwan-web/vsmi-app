import { budgetFlowImpact, calculateBudgetRemaining, createCategoryRootResolver, isBudgetActiveForMonth, resolveBudgetAccountId, type BudgetAccount } from "./budget-engine";

export type SavingsAccount = BudgetAccount;
export type SavingsCategory = { id:string; parent_id:string|null; monthly_budget:number; account_id?:string|null; movement_type?:string; budget_period?:"monthly"|"specific_month"; budget_month?:string|null; budget_start_date?:string|null; budget_end_date?:string|null; is_primary_income?:boolean; is_essential?:boolean };
export type SavingsMovement = { id?:string; account_id:string; category_id:string|null; movement_type:string; label?:string; amount:number; movement_date:string; status:string; recurrence_id?:string|null; transfer_group_id?:string|null };
export type SavingsRecurrence = { id:string; account_id:string; destination_account_id:string|null; category_id:string|null; movement_type:"income"|"expense"|"transfer"; amount:number; frequency:string; interval_count:number; start_date:string; end_date:string|null; is_active?:boolean };
export type SavingsOverride={recurrence_id:string;occurrence_month:string;amount:number};
export type SavingsExclusion={recurrence_id:string;occurrence_date:string};
export type SavingsPhotoPayment={amount:number;expected_date:string|null;received_date:string|null;status:string;personal_account_id:string|null;accounting_status?:string};
export type SavingsUrssafState={contribution_month:string;account_id:string|null;is_completed:boolean};

export type SavingsBudgetAllocation={
 id:string; account_id:string; name:string; kind:"project"|"reserve"; allocation_mode:"amount"|"percent"; allocation_value:number; protection:"free"|"preserve"|"untouchable"; allow_recovery:boolean; critical_threshold?:number|null; target_amount?:number|null; target_date?:string|null; priority?:number|null;
};

export function savingsBudgetAmount(budget:SavingsBudgetAllocation,savingsBalance:number){
 const raw=budget.allocation_mode==="percent"?Math.max(0,savingsBalance)*Math.max(0,Number(budget.allocation_value))/100:Math.max(0,Number(budget.allocation_value));
 return Math.max(0,Math.round(raw*100)/100);
}

export function savingsAvailabilityForAccount(savingsBalance:number,accountId:string,budgets:SavingsBudgetAllocation[]|undefined,floor=30){
 const balance=Math.max(0,Number(savingsBalance)||0);
 const physical=Math.max(0,balance-floor);
 const rows=(budgets??[]).filter(b=>b.account_id===accountId);
 const amount=(b:SavingsBudgetAllocation)=>savingsBudgetAmount(b,balance);
 if(!rows.length)return {physical,mobilizable:physical,reserve:0,unallocated:physical,free:0,untouchable:0,totalUsable:physical};

 // Hiérarchie métier unique :
 // 1) Réserve = mobilisable immédiatement, quelle que soit une ancienne valeur de protection.
 // 2) Projet libre = utilisable uniquement après épuisement de la réserve mobilisable.
 // 3) Projet intouchable = jamais utilisable automatiquement.
 // L'épargne non affectée reste mobilisable immédiatement afin de ne pas immobiliser
 // artificiellement une partie du compte lorsqu'aucune enveloppe ne la couvre.
 const reserveNominal=rows.filter(b=>b.kind==="reserve").reduce((sum,b)=>sum+amount(b),0);
 const projectFreeNominal=rows.filter(b=>b.kind==="project"&&(b.protection==="free"||(b.protection==="preserve"&&b.allow_recovery))).reduce((sum,b)=>sum+amount(b),0);
 const projectUntouchableNominal=rows.filter(b=>b.kind==="project"&&(b.protection==="untouchable"||(b.protection==="preserve"&&!b.allow_recovery))).reduce((sum,b)=>sum+amount(b),0);

 // En cas de sur-affectation, on reste conservateur : l'intouchable est sanctuarisé
 // en premier, puis la réserve, puis les projets libres. L'écran Budgets Épargne
 // continue par ailleurs à signaler la sur-affectation à l'utilisateur.
 const untouchable=Math.min(physical,Math.max(0,projectUntouchableNominal));
 let remaining=Math.max(0,physical-untouchable);
 const reserve=Math.min(remaining,Math.max(0,reserveNominal));
 remaining=Math.max(0,remaining-reserve);
 const free=Math.min(remaining,Math.max(0,projectFreeNominal));
 const unallocated=Math.max(0,remaining-free);
 const mobilizable=Math.max(0,reserve+unallocated);
 const totalUsable=Math.max(0,mobilizable+free);
 return {physical,mobilizable,reserve,unallocated,free,untouchable,totalUsable};
}

export function mobilizableSavingsForAccount(savingsBalance:number,accountId:string,budgets:SavingsBudgetAllocation[]|undefined,floor=30){
 return savingsAvailabilityForAccount(savingsBalance,accountId,budgets,floor).totalUsable;
}
export type SavingsProposalDecision={source_account_id:string;destination_account_id:string;source_month:string;amount:number;status:"pending"|"accepted"|"deleted";transfer_group_id?:string|null};
export type SavingsPlanRow={
 month:string; openingChecking:number; checking:number; savings:number; proposal:number; savingsUsed:number;
 balanceAfterSavingsUse:number; income:number; expense:number; debitExcludingBudgetRemaining:number; budgetRemaining:number;
 balanceBeforeSavings:number; requiredReserve:number; proposalDate:string|null; savingsUseDate:string|null; cycleEndDate:string|null;
 lowestBalance:number; lowestBalanceDate:string|null; nextPrimaryIncomeDate:string|null; overdraftDate:string|null;
};
type Input={sourceAccountId:string;destinationAccountId:string;initialChecking:number;initialSavings:number;startMonth:string;accounts?:SavingsAccount[];categories:SavingsCategory[];movements:SavingsMovement[];recurrences:SavingsRecurrence[];overrides?:SavingsOverride[];exclusions?:SavingsExclusion[];photoPayments?:SavingsPhotoPayment[];photoDefaultAccountId?:string|null;urssafStates?:SavingsUrssafState[];urssafDefaultAccountId?:string|null;movementDefaultAccountId?:string|null;savingsProposals?:SavingsProposalDecision[];months?:number;minReserve?:number;primaryIncomeCategoryId?:string|null;primaryIncomeSource?:"category"|"weddings";proposalTiming?:"same_day"|"next_day";savingsBudgets?:SavingsBudgetAllocation[]};
type DayFlow={income:number;expense:number;primaryIncome:number;budget:number};
type PairedTransfer={group:string;date:string;amount:number;status:string;automatic:boolean};
const iso=(d:Date)=>d.toISOString().slice(0,10);
const todayParis=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const shiftMonth=(m:string,n:number)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return iso(d).slice(0,7)};
const monthEnd=(m:string)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+1);d.setDate(0);return iso(d)};
const addOccurrence=(date:Date,f:string,n:number)=>{const d=new Date(date);if(f==="weekly")d.setDate(d.getDate()+7*n);else if(f==="quarterly")d.setMonth(d.getMonth()+3*n);else if(f==="yearly")d.setFullYear(d.getFullYear()+n);else d.setMonth(d.getMonth()+n);return d};
const addDays=(date:string,n:number)=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+n);return iso(d)};
const roundMoney=(value:number)=>Math.round(value*100)/100;
const SAVINGS_FLOOR=30;
const MAX_DEPOSITS_PER_MONTH=2;

export function calculateSavingsPlan(input:Input):SavingsPlanRow[]{
 const count=input.months??60,reserve=Math.max(0,Number(input.minReserve??500));
 const realToday=todayParis();
 const requestedStart=`${input.startMonth}-01`;
 const simulationStart=input.startMonth===realToday.slice(0,7)&&realToday>requestedStart?realToday:requestedStart;
 const endDate=monthEnd(shiftMonth(input.startMonth,count));
 const root=createCategoryRootResolver(input.categories);
 const selected=input.primaryIncomeCategoryId?(root(input.primaryIncomeCategoryId)??input.primaryIncomeCategoryId):null;
 const primaryRoots=new Set(selected?[selected]:input.categories.filter(c=>c.is_primary_income).map(c=>root(c.id)??c.id));
 const accounts=input.accounts??[{id:input.sourceAccountId,account_type:"checking" as const,is_default:true},{id:input.destinationAccountId,account_type:"savings" as const}];
 const budgetRoots=input.categories.filter(c=>!c.parent_id&&Number(c.monthly_budget)>0&&resolveBudgetAccountId(c,input.movementDefaultAccountId,accounts)===input.sourceAccountId);
 const overrides=new Map((input.overrides??[]).map(o=>[`${o.recurrence_id}:${String(o.occurrence_month).slice(0,7)}`,Number(o.amount)]));
 const excluded=new Set((input.exclusions??[]).map(e=>`${e.recurrence_id}:${e.occurrence_date}`));
 const materialized=new Set(input.movements.filter(m=>m.recurrence_id).map(m=>`${m.recurrence_id}:${m.movement_date}`));
 const depositDecisions=new Map((input.savingsProposals??[]).filter(p=>p.source_account_id===input.sourceAccountId&&p.destination_account_id===input.destinationAccountId).map(p=>[String(p.source_month).slice(0,7),p]));
 const useDecisions=new Map((input.savingsProposals??[]).filter(p=>p.source_account_id===input.destinationAccountId&&p.destination_account_id===input.sourceAccountId).map(p=>[String(p.source_month).slice(0,7),p]));

 // Reconstruit les vrais virements entre le compte courant analysé et son compte
 // d'épargne. Les virements planifiés doivent faire baisser le courant ET monter
 // l'épargne dans la projection ; les traiter comme un simple débit faussait le couple.
 const grouped=new Map<string,SavingsMovement[]>();
 for(const m of input.movements){if(m.status!=="cancelled"&&m.transfer_group_id){const rows=grouped.get(m.transfer_group_id)??[];rows.push(m);grouped.set(m.transfer_group_id,rows)}}
 const deposits:PairedTransfer[]=[],uses:PairedTransfer[]=[];
 for(const [group,rows] of grouped){
  const depositOut=rows.find(m=>m.account_id===input.sourceAccountId&&m.movement_type==="transfer_out");
  const depositIn=rows.find(m=>m.account_id===input.destinationAccountId&&m.movement_type==="transfer_in");
  if(depositOut&&depositIn){deposits.push({group,date:depositOut.movement_date,amount:Number(depositOut.amount),status:depositOut.status,automatic:String(depositOut.label??"").startsWith("Versement épargne proposé")});continue}
  const useOut=rows.find(m=>m.account_id===input.destinationAccountId&&m.movement_type==="transfer_out");
  const useIn=rows.find(m=>m.account_id===input.sourceAccountId&&m.movement_type==="transfer_in");
  if(useOut&&useIn)uses.push({group,date:useOut.movement_date,amount:Number(useOut.amount),status:useOut.status,automatic:(()=>{const label=String(useOut.label??"");const legacy="Utilisation épargne "+"proposée";return label.startsWith("Utilisation d'épargne conseillée")||label.startsWith(legacy)})()});
 }
 const pairedGroups=new Set([...deposits,...uses].map(t=>t.group));

 const flows=new Map<string,DayFlow>(),spent=new Map<string,number>();
 const budgetTypeByRoot=new Map(budgetRoots.map(b=>[b.id,b.movement_type??"expense"]));
 const flow=(date:string)=>{const f=flows.get(date)??{income:0,expense:0,primaryIncome:0,budget:0};flows.set(date,f);return f};
 const income=(date:string,amount:number,primary=false)=>{const f=flow(date);f.income+=amount;if(primary)f.primaryIncome+=amount};
 const registerSpent=(date:string,movementType:string,amount:number,categoryId?:string|null)=>{const r=root(categoryId??null);if(r){const k=`${date.slice(0,7)}:${r}`;const direction=budgetTypeByRoot.get(r)==="income"?-1:1;spent.set(k,(spent.get(k)??0)+budgetFlowImpact({movement_type:movementType,amount})*direction)}};
 const expense=(date:string,amount:number,categoryId?:string|null,budget=false)=>{const f=flow(date);f.expense+=amount;if(budget)f.budget+=amount;else registerSpent(date,"expense",amount,categoryId)};

 // Les opérations pointées sont déjà incluses dans initialChecking. Les non pointées
 // restent dues même si leur date est passée. Les virements du couple courant/épargne
 // sont traités séparément pour faire évoluer les deux soldes simultanément.
 for(const m of input.movements){
  if(m.movement_date>endDate||m.account_id!==input.sourceAccountId||m.status==="cancelled")continue;
  if(m.movement_date>=requestedStart&&["expense","income"].includes(m.movement_type)&&["planned","completed"].includes(m.status))registerSpent(m.movement_date,m.movement_type,Number(m.amount),m.category_id);
  if(m.status!=="planned"|| (m.transfer_group_id&&pairedGroups.has(m.transfer_group_id)))continue;
  const effectiveDate=m.movement_date<simulationStart?simulationStart:m.movement_date;
  if(effectiveDate>endDate)continue;
  const a=Number(m.amount);
  if(["income","transfer_in"].includes(m.movement_type))income(effectiveDate,a,primaryRoots.has(root(m.category_id)??""));
  else if(m.movement_type==="expense"||m.movement_type==="transfer_out"){const f=flow(effectiveDate);f.expense+=a}
 }

 for(const r of input.recurrences.filter(r=>r.is_active!==false)){
  let d=new Date(`${r.start_date}T12:00:00`),guard=0;
  while(iso(d)<=endDate&&guard++<5000){
   const date=iso(d),month=date.slice(0,7);
   if(date>=simulationStart&&(!r.end_date||date<=r.end_date)&&!excluded.has(`${r.id}:${date}`)&&!materialized.has(`${r.id}:${date}`)){
    const a=overrides.get(`${r.id}:${month}`)??Number(r.amount);
    if(r.movement_type==="income"&&r.account_id===input.sourceAccountId){income(date,a,primaryRoots.has(root(r.category_id)??""));registerSpent(date,"income",a,r.category_id)}
    else if(r.movement_type==="expense"&&r.account_id===input.sourceAccountId)expense(date,a,r.category_id);
    else if(r.movement_type==="transfer"){
     if(r.account_id===input.sourceAccountId){const f=flow(date);f.expense+=a}
     if(r.destination_account_id===input.sourceAccountId)income(date,a);
    }
   }
   d=addOccurrence(d,r.frequency,Math.max(1,Number(r.interval_count||1)));
  }
 }

 for(const p of input.photoPayments??[]){
  const date=p.status==="received"?(p.received_date??p.expected_date):p.expected_date;
  if(!date||date<simulationStart||date>endDate||p.status==="cancelled")continue;
  if((p.personal_account_id??input.photoDefaultAccountId)===input.sourceAccountId&&p.status==="expected")income(date,Number(p.amount),input.primaryIncomeSource==="weddings");
 }

 for(let i=0;i<=count;i++){
  const month=shiftMonth(input.startMonth,i),last=monthEnd(month),prev=shiftMonth(month,-1);
  if(last<simulationStart)continue;
  const photoRevenue=(input.photoPayments??[]).filter(p=>p.status!=="cancelled"&&((p.accounting_status==="received"?(p.received_date??p.expected_date):p.expected_date)??"").startsWith(prev)).reduce((s,p)=>s+Number(p.amount),0);
  const state=(input.urssafStates??[]).find(s=>String(s.contribution_month).slice(0,7)===month);
  if(photoRevenue>0&&!state?.is_completed&&(state?.account_id??input.urssafDefaultAccountId)===input.sourceAccountId&&last>=simulationStart)expense(last,roundMoney(photoRevenue*.216));
  for(const b of budgetRoots)if(isBudgetActiveForMonth(b,month)){
   const remaining=calculateBudgetRemaining(Number(b.monthly_budget),spent.get(`${month}:${b.id}`)??0);
   if(remaining>0&&last>=simulationStart){if(b.movement_type==="income")income(last,remaining);else expense(last,remaining,b.id,true);}
  }
 }

 const dates:string[]=[];
 for(let d=new Date(`${simulationStart}T12:00:00`);iso(d)<=endDate;d.setDate(d.getDate()+1))dates.push(iso(d));
 const primaryDates=dates.filter(d=>(flows.get(d)?.primaryIncome??0)>0);
 let checking=Number(input.initialChecking),savings=Number(input.initialSavings);
 const rows:SavingsPlanRow[]=[];
 const scheduledDeposits=new Map<string,number>(),scheduledUses=new Map<string,number>();
 const addScheduled=(map:Map<string,number>,date:string,amount:number)=>map.set(date,roundMoney((map.get(date)??0)+amount));

 // Un virement accepté mais encore non pointé reste une opération future. S'il est
 // en retard, il est reporté à aujourd'hui, exactement comme les autres débits non cochés.
 for(const t of deposits.filter(t=>t.status==="planned")){const date=t.date<simulationStart?simulationStart:t.date;if(date<=endDate)addScheduled(scheduledDeposits,date,t.amount)}
 for(const t of uses.filter(t=>t.status==="planned")){const date=t.date<simulationStart?simulationStart:t.date;if(date<=endDate)addScheduled(scheduledUses,date,t.amount)}

 const balanceSeries=(from:string,to:string,opening:number)=>{
  const out:{date:string;balance:number}[]=[];let balance=opening;
  for(const date of dates.filter(d=>d>=from&&d<=to)){
   balance+=scheduledUses.get(date)??0;
   const f=flows.get(date);if(f)balance+=f.income-f.expense;
   balance-=scheduledDeposits.get(date)??0;
   out.push({date,balance:roundMoney(balance)});
  }
  return out;
 };

 for(let i=0;i<count;i++){
  const month=shiftMonth(input.startMonth,i),first=`${month}-01`,last=monthEnd(month);
  if(last<simulationStart)continue;
  const rowStart=first<simulationStart?simulationStart:first;
  const opening=checking;
  let monthIncome=0,monthExpense=0,monthBudget=0;
  const depositDecision=depositDecisions.get(month),useDecision=useDecisions.get(month);

  // Compte uniquement les virements automatiques réellement matérialisés. Le moteur
  // peut ainsi proposer un deuxième passage dans le mois, mais jamais un troisième.
  const monthAutomaticDeposits=deposits.filter(t=>t.automatic&&((t.date<simulationStart&&t.status==="planned"?simulationStart:t.date).slice(0,7)===month));
  const existingDepositCount=new Set(monthAutomaticDeposits.map(t=>t.group)).size;
  const lastExistingDepositDate=monthAutomaticDeposits.map(t=>t.date<simulationStart&&t.status==="planned"?simulationStart:t.date).sort().at(-1)??null;

  // Cas de secours : une décision acceptée sans mouvements associés ne doit jamais
  // être appliquée deux fois ni permettre une nouvelle proposition avant réparation.
  const acceptedDepositMissing=depositDecision?.status==="accepted"&&depositDecision.transfer_group_id&&!deposits.some(t=>t.group===depositDecision.transfer_group_id);
  if(acceptedDepositMissing){const fallback=lastExistingDepositDate??rowStart;addScheduled(scheduledDeposits,fallback,Number(depositDecision.amount))}

  const baseline=balanceSeries(rowStart,endDate,checking);
  const baselineEndOfMonth=baseline.find(item=>item.date===last)?.balance??checking;
  let proposalDate:string|null=null;
  let automaticProposal=0;
  let cycleEndDate:string|null=rowStart;

  const canProposeDeposit=existingDepositCount<MAX_DEPOSITS_PER_MONTH&&!acceptedDepositMissing&&depositDecision?.status!=="deleted";
  if(canProposeDeposit){
   // Après un premier virement, réserve le deuxième créneau au prochain revenu
   // principal du mois lorsqu'il existe. On évite ainsi de faire deux petits virements
   // consécutifs puis de laisser un gros salaire dormir sur le compte jusqu'au mois suivant.
   const nextPrimaryAfterExisting=lastExistingDepositDate?primaryDates.find(d=>d>lastExistingDepositDate&&d<=last)??null:null;
   const candidateStart=nextPrimaryAfterExisting??(lastExistingDepositDate?addDays(lastExistingDepositDate,1):rowStart);
   const firstExcess=baseline.find(item=>item.date>=candidateStart&&item.date<=last&&item.balance>reserve+0.009)??null;
   if(firstExcess){
    proposalDate=addDays(firstExcess.date,input.proposalTiming==="next_day"?1:0);
    if(proposalDate<=last){
     const fortyFiveDayEnd=addDays(proposalDate,44);
     cycleEndDate=fortyFiveDayEnd<=endDate?fortyFiveDayEnd:endDate;
     const window=baseline.filter(item=>item.date>=proposalDate!&&item.date<=cycleEndDate!);
     const minimumOverWindow=window.reduce((minimum,item)=>Math.min(minimum,item.balance),firstExcess.balance);
     automaticProposal=Math.max(0,roundMoney(minimumOverWindow-reserve));
    } else proposalDate=null;
   }
  }

  // Une modification manuelle en attente remplace le montant automatique. Une ligne
  // acceptée déjà matérialisée représente le virement précédent et n'empêche donc pas
  // le second calcul ; c'est le nombre réel de virements du mois qui fait foi.
  let proposal=automaticProposal;
  if(depositDecision?.status==="pending")proposal=Math.max(0,Number(depositDecision.amount));
  if(existingDepositCount>=MAX_DEPOSITS_PER_MONTH||depositDecision?.status==="deleted"||acceptedDepositMissing)proposal=0;
  if(proposal>0&&proposalDate)addScheduled(scheduledDeposits,proposalDate,proposal);

  // Après intégration du versement proposé, calcule le besoin de reprise d'épargne.
  // Deux règles distinctes évitent de mélanger un léger déficit de seuil aujourd'hui
  // avec un point bas beaucoup plus lointain :
  // 1) si le compte est déjà sous son seuil, on attend jusqu'à 5 jours s'il remonte
  //    naturellement au-dessus du seuil sans jamais passer sous 0 € ;
  // 2) pour un besoin futur, la reprise est datée exactement 2 jours avant le
  //    premier franchissement réel du seuil.
  const riskEnd=proposalDate?Math.min(Date.parse(`${addDays(proposalDate,44)}T12:00:00`),Date.parse(`${endDate}T12:00:00`)):Date.parse(`${monthEnd(shiftMonth(month,1))}T12:00:00`);
  const riskEndDate=iso(new Date(riskEnd));
  const afterDeposit=balanceSeries(rowStart,riskEndDate,checking);
  const lowestPoint=afterDeposit.reduce((best,item)=>item.balance<best.balance?item:best,afterDeposit[0]??{date:rowStart,balance:checking});
  const firstBelowFloor=afterDeposit.find(item=>item.balance<reserve-0.009)??null;
  const firstNegative=afterDeposit.find(item=>item.balance<-0.009)??null;

  let automaticUseAmount=0;
  let automaticUseDate:string|null=null;

  if(checking<reserve-0.009){
   // Le solde réel est déjà sous le seuil. On regarde uniquement les 5 jours à venir.
   // Pas de reprise si le compte repasse au-dessus du seuil dans cette fenêtre et
   // qu'aucun découvert ne survient avant cette remontée.
   const graceEnd=addDays(rowStart,5)<=riskEndDate?addDays(rowStart,5):riskEndDate;
   const graceSeries=afterDeposit.filter(item=>item.date>=rowStart&&item.date<=graceEnd);
   const recoveryPoint=graceSeries.find(item=>item.balance>=reserve-0.009)??null;
   const beforeRecovery=recoveryPoint?graceSeries.filter(item=>item.date<=recoveryPoint.date):graceSeries;
   const minimumBeforeRecovery=beforeRecovery.reduce((minimum,item)=>Math.min(minimum,item.balance),checking);
   const safeNaturalRecovery=Boolean(recoveryPoint)&&minimumBeforeRecovery>=-0.009;

   if(!safeNaturalRecovery){
    // Par défaut on remonte simplement au seuil aujourd'hui. Si des mouvements
    // non cochés des prochains jours feraient malgré cela passer sous 0 €, on ajoute
    // seulement le complément nécessaire pour éviter ce découvert.
    const toFloor=Math.max(0,roundMoney(reserve-checking));
    const overdraftProtection=Math.max(0,roundMoney(-minimumBeforeRecovery));
    automaticUseAmount=Math.max(toFloor,overdraftProtection);
    automaticUseDate=rowStart;
   }
  } else if(firstBelowFloor){
   // Besoin futur : date = J-2 du premier franchissement du seuil.
   automaticUseDate=addDays(firstBelowFloor.date,-2);
   if(automaticUseDate<rowStart)automaticUseDate=rowStart;

   // Le montant protège le compte jusqu'à sa prochaine remontée naturelle au seuil
   // (ou, au plus tard, la fin de la fenêtre de risque). On n'utilise donc pas un
   // point bas antérieur ou sans rapport avec ce besoin précis.
   const fromNeed=afterDeposit.filter(item=>item.date>=firstBelowFloor.date);
   const recoveryAfterNeed=fromNeed.find(item=>item.date>firstBelowFloor.date&&item.balance>=reserve-0.009)??null;
   const protectionWindow=recoveryAfterNeed?fromNeed.filter(item=>item.date<=recoveryAfterNeed.date):fromNeed;
   const minimumForNeed=protectionWindow.reduce((minimum,item)=>Math.min(minimum,item.balance),firstBelowFloor.balance);
   automaticUseAmount=Math.max(0,roundMoney(reserve-minimumForNeed));
  }

  let savingsUseDate:string|null=null;
  let usable=0;
  const availableSavings=mobilizableSavingsForAccount(savings,input.destinationAccountId,input.savingsBudgets,SAVINGS_FLOOR);
  const acceptedUseMissing=useDecision?.status==="accepted"&&useDecision.transfer_group_id&&!uses.some(t=>t.group===useDecision.transfer_group_id);
  if(acceptedUseMissing){
   savingsUseDate=automaticUseDate??rowStart;
   usable=Math.min(Number(useDecision.amount),availableSavings);
   if(usable>0)addScheduled(scheduledUses,savingsUseDate,usable);
  } else if(useDecision?.status==="pending"&&automaticUseAmount>0){
   savingsUseDate=automaticUseDate??rowStart;
   usable=Math.min(Number(useDecision.amount),availableSavings);
   if(usable>0)addScheduled(scheduledUses,savingsUseDate,usable);
  } else if(useDecision?.status!=="deleted"&&automaticUseAmount>0){
   savingsUseDate=automaticUseDate??rowStart;
   usable=Math.min(automaticUseAmount,availableSavings);
   if(usable>0)addScheduled(scheduledUses,savingsUseDate,usable);
  }

  // Exécute chronologiquement les flux et tous les virements planifiés/proposés du mois.
  for(const date of dates.filter(d=>d>=rowStart&&d<=last)){
   const use=scheduledUses.get(date)??0;
   if(use>0){const actualUse=Math.min(use,mobilizableSavingsForAccount(savings,input.destinationAccountId,input.savingsBudgets,SAVINGS_FLOOR));checking+=actualUse;savings-=actualUse}
   const f=flows.get(date);if(f){checking+=f.income-f.expense;monthIncome+=f.income;monthExpense+=f.expense;monthBudget+=f.budget}
   const deposit=scheduledDeposits.get(date)??0;
   if(deposit>0){const actualDeposit=Math.min(deposit,Math.max(0,checking-reserve));checking-=actualDeposit;savings+=actualDeposit}
   checking=roundMoney(checking);savings=roundMoney(savings);
  }

  const nextPrimary=primaryDates.find(d=>d>(proposalDate??rowStart))??null;
  rows.push({
   month,openingChecking:opening,checking,savings,proposal,savingsUsed:usable,
   balanceAfterSavingsUse:checking,income:monthIncome,expense:monthExpense,
   debitExcludingBudgetRemaining:monthExpense-monthBudget,budgetRemaining:monthBudget,
   balanceBeforeSavings:roundMoney(baselineEndOfMonth),requiredReserve:reserve,proposalDate,
   savingsUseDate,cycleEndDate,lowestBalance:roundMoney(lowestPoint.balance),lowestBalanceDate:lowestPoint.date,
   nextPrimaryIncomeDate:nextPrimary,overdraftDate:firstNegative?.date??null
  });
 }
 return rows;
}
