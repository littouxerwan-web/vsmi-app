import { calculateBudgetRemaining, createCategoryRootResolver, isBudgetActiveForMonth, resolveBudgetAccountId, type BudgetAccount } from "./budget-engine";

export type SavingsAccount = BudgetAccount;
export type SavingsCategory = {
  id: string; parent_id: string | null; monthly_budget: number; account_id?: string | null;
  movement_type?: string; budget_period?: "monthly" | "specific_month"; budget_month?: string | null;
  is_primary_income?: boolean;
};
export type SavingsMovement = { id?: string; account_id: string; category_id: string | null; movement_type: string; amount: number; movement_date: string; status: string; recurrence_id?: string | null; transfer_group_id?: string | null };
export type SavingsRecurrence = { id: string; account_id: string; destination_account_id: string | null; category_id: string | null; movement_type: "income" | "expense" | "transfer"; amount: number; frequency: string; interval_count: number; start_date: string; end_date: string | null; is_active?: boolean };
export type SavingsOverride = { recurrence_id: string; occurrence_month: string; amount: number };
export type SavingsExclusion = { recurrence_id: string; occurrence_date: string };
export type SavingsPhotoPayment = { amount: number; expected_date: string | null; received_date: string | null; status: string; personal_account_id: string | null; accounting_status?: string };
export type SavingsUrssafState = { contribution_month: string; account_id: string | null; is_completed: boolean };
export type SavingsProposalDecision = { source_account_id: string; destination_account_id: string; source_month: string; amount: number; status: "pending" | "accepted" | "deleted"; transfer_group_id?: string | null; calculation_base?: number | null };
export type SavingsPlanRow = {
  month: string; openingChecking: number; checking: number; savings: number; proposal: number; savingsUsed: number;
  balanceAfterSavingsUse: number; income: number; expense: number; debitExcludingBudgetRemaining: number; budgetRemaining: number;
  balanceBeforeSavings: number; requiredReserve: number; proposalDate: string | null; savingsUseDate: string | null; cycleEndDate: string | null;
};

type Input = {
  sourceAccountId: string; destinationAccountId: string; initialChecking: number; initialSavings: number; startMonth: string;
  accounts?: SavingsAccount[]; categories: SavingsCategory[]; movements: SavingsMovement[]; recurrences: SavingsRecurrence[];
  overrides?: SavingsOverride[]; exclusions?: SavingsExclusion[]; photoPayments?: SavingsPhotoPayment[]; photoDefaultAccountId?: string | null;
  urssafStates?: SavingsUrssafState[]; urssafDefaultAccountId?: string | null; movementDefaultAccountId?: string | null;
  savingsProposals?: SavingsProposalDecision[]; months?: number; minReserve?: number;
};

type DayFlow = { income: number; expense: number; primaryIncome: number };
const iso = (date: Date) => date.toISOString().slice(0, 10);
const shiftMonth = (month: string, delta: number) => { const d = new Date(`${month}-01T12:00:00`); d.setMonth(d.getMonth() + delta); return iso(d).slice(0, 7); };
const addOccurrence = (date: Date, frequency: string, count: number) => { const d = new Date(date); if (frequency === "weekly") d.setDate(d.getDate() + 7 * count); else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3 * count); else if (frequency === "yearly") d.setFullYear(d.getFullYear() + count); else d.setMonth(d.getMonth() + count); return d; };
const monthEnd = (month: string) => { const d = new Date(`${month}-01T12:00:00`); d.setMonth(d.getMonth() + 1); d.setDate(0); return iso(d); };

export function calculateSavingsPlan(input: Input): SavingsPlanRow[] {
  const monthCount = input.months ?? 60;
  const minimumReserve = Math.max(0, Number(input.minReserve ?? 500));
  const endMonth = shiftMonth(input.startMonth, monthCount - 1);
  const endDate = monthEnd(endMonth);
  const startDate = `${input.startMonth}-01`;
  const resolveRoot = createCategoryRootResolver(input.categories);
  const primaryRoots = new Set(input.categories.filter(c => c.is_primary_income).map(c => resolveRoot(c.id) ?? c.id));
  const accounts = input.accounts ?? [{ id: input.sourceAccountId, account_type: "checking" as const, is_default: true }, { id: input.destinationAccountId, account_type: "savings" as const }];
  const budgetRoots = input.categories.filter(c => !c.parent_id && c.movement_type !== "income" && Number(c.monthly_budget) > 0 && resolveBudgetAccountId(c, input.movementDefaultAccountId, accounts) === input.sourceAccountId);
  const overrideMap = new Map((input.overrides ?? []).map(o => [`${o.recurrence_id}:${String(o.occurrence_month).slice(0, 7)}`, Number(o.amount)]));
  const exclusionSet = new Set((input.exclusions ?? []).map(e => `${e.recurrence_id}:${e.occurrence_date}`));
  const materialized = new Set(input.movements.filter(m => m.recurrence_id).map(m => `${m.recurrence_id}:${m.movement_date}`));
  const acceptedGroups = new Set((input.savingsProposals ?? []).filter(p => p.status === "accepted" && p.transfer_group_id).map(p => p.transfer_group_id as string));
  const depositDecision = new Map((input.savingsProposals ?? []).filter(p => p.source_account_id === input.sourceAccountId && p.destination_account_id === input.destinationAccountId).map(p => [String(p.source_month).slice(0, 7), p]));
  const useDecision = new Map((input.savingsProposals ?? []).filter(p => p.source_account_id === input.destinationAccountId && p.destination_account_id === input.sourceAccountId).map(p => [String(p.source_month).slice(0, 7), p]));
  const flows = new Map<string, DayFlow>();
  const spentByMonthRoot = new Map<string, number>();
  const getFlow = (date: string) => { const current = flows.get(date) ?? { income: 0, expense: 0, primaryIncome: 0 }; flows.set(date, current); return current; };
  const addIncome = (date: string, amount: number, primary = false) => { const f = getFlow(date); f.income += amount; if (primary) f.primaryIncome += amount; };
  const addExpense = (date: string, amount: number, categoryId?: string | null) => { const f = getFlow(date); f.expense += amount; const root = resolveRoot(categoryId ?? null); if (root) { const key = `${date.slice(0, 7)}:${root}`; spentByMonthRoot.set(key, (spentByMonthRoot.get(key) ?? 0) + amount); } };

  for (const m of input.movements) {
    if (m.movement_date < startDate || m.movement_date > endDate || m.account_id !== input.sourceAccountId) continue;
    if (m.transfer_group_id && acceptedGroups.has(m.transfer_group_id)) continue;
    if (m.status !== "planned") continue;
    const amount = Number(m.amount);
    if (["income", "transfer_in"].includes(m.movement_type)) addIncome(m.movement_date, amount, primaryRoots.has(resolveRoot(m.category_id) ?? ""));
    else addExpense(m.movement_date, amount, m.category_id);
  }

  for (const r of input.recurrences.filter(r => r.is_active !== false)) {
    let d = new Date(`${r.start_date}T12:00:00`); let guard = 0;
    while (iso(d) <= endDate && guard++ < 5000) {
      const date = iso(d); const month = date.slice(0, 7);
      if (date >= startDate && (!r.end_date || date <= r.end_date) && !exclusionSet.has(`${r.id}:${date}`) && !materialized.has(`${r.id}:${date}`)) {
        const amount = overrideMap.get(`${r.id}:${month}`) ?? Number(r.amount);
        if (r.movement_type === "income" && r.account_id === input.sourceAccountId) addIncome(date, amount, primaryRoots.has(resolveRoot(r.category_id) ?? ""));
        else if (r.movement_type === "expense" && r.account_id === input.sourceAccountId) addExpense(date, amount, r.category_id);
        else if (r.movement_type === "transfer") { if (r.account_id === input.sourceAccountId) addExpense(date, amount); if (r.destination_account_id === input.sourceAccountId) addIncome(date, amount); }
      }
      d = addOccurrence(d, r.frequency, Math.max(1, Number(r.interval_count || 1)));
    }
  }

  for (const p of input.photoPayments ?? []) {
    const date = p.status === "received" ? (p.received_date ?? p.expected_date) : p.expected_date;
    if (!date || date < startDate || date > endDate || p.status === "cancelled") continue;
    if ((p.personal_account_id ?? input.photoDefaultAccountId) === input.sourceAccountId && p.status === "expected") addIncome(date, Number(p.amount));
  }

  for (let i = 0; i < monthCount; i++) {
    const month = shiftMonth(input.startMonth, i); const last = monthEnd(month);
    const prev = shiftMonth(month, -1);
    const photoRevenue = (input.photoPayments ?? []).filter(p => p.status !== "cancelled" && ((p.accounting_status === "received" ? (p.received_date ?? p.expected_date) : p.expected_date) ?? "").startsWith(prev)).reduce((s, p) => s + Number(p.amount), 0);
    const state = (input.urssafStates ?? []).find(s => String(s.contribution_month).slice(0, 7) === month);
    if (photoRevenue > 0 && !state?.is_completed && (state?.account_id ?? input.urssafDefaultAccountId) === input.sourceAccountId) addExpense(last, Math.round(photoRevenue * 0.216 * 100) / 100);
    for (const b of budgetRoots) if (isBudgetActiveForMonth(b, month)) addExpense(last, calculateBudgetRemaining(Number(b.monthly_budget), spentByMonthRoot.get(`${month}:${b.id}`) ?? 0));
  }

  const dates: string[] = []; for (let d = new Date(`${startDate}T12:00:00`); iso(d) <= endDate; d.setDate(d.getDate() + 1)) dates.push(iso(d));
  const primaryDates = dates.filter(date => (flows.get(date)?.primaryIncome ?? 0) > 0);
  let checking = Number(input.initialChecking), savings = Number(input.initialSavings);
  const monthState = new Map<string, SavingsPlanRow>();
  const ensureRow = (month: string) => { let row = monthState.get(month); if (!row) { row = { month, openingChecking: checking, checking, savings, proposal: 0, savingsUsed: 0, balanceAfterSavingsUse: checking, income: 0, expense: 0, debitExcludingBudgetRemaining: 0, budgetRemaining: 0, balanceBeforeSavings: checking, requiredReserve: minimumReserve, proposalDate: null, savingsUseDate: null, cycleEndDate: null }; monthState.set(month, row); } return row; };

  for (const date of dates) {
    const month = date.slice(0, 7); const row = ensureRow(month); const flow = flows.get(date) ?? { income: 0, expense: 0, primaryIncome: 0 };
    checking += flow.income - flow.expense; row.income += flow.income; row.expense += flow.expense; row.debitExcludingBudgetRemaining += flow.expense;

    if (checking < 0 && savings > 0 && row.savingsUsed === 0) {
      const automatic = Math.min(-checking, savings); const decision = useDecision.get(month);
      const requested = decision?.status === "deleted" ? 0 : decision ? Math.max(0, Number(decision.amount)) : automatic;
      const used = Math.min(savings, requested); checking += used; savings -= used; row.savingsUsed = used; row.savingsUseDate = date;
    }
    row.balanceAfterSavingsUse = checking;

    if (flow.primaryIncome > 0 && row.proposal === 0) {
      const nextPrimary = primaryDates.find(d => d > date) ?? endDate;
      let projected = checking, minimum = checking;
      for (const futureDate of dates) { if (futureDate <= date || futureDate >= nextPrimary) continue; const future = flows.get(futureDate); if (future) projected += future.income - future.expense; minimum = Math.min(minimum, projected); }
      const automatic = Math.max(0, minimum - minimumReserve); const decision = depositDecision.get(month);
      const requested = decision?.status === "deleted" ? 0 : decision ? Math.max(0, Number(decision.amount)) : automatic;
      const proposal = Math.min(Math.max(0, checking), requested);
      if (proposal > 0) { checking -= proposal; savings += proposal; row.proposal = proposal; row.proposalDate = date; row.cycleEndDate = nextPrimary; }
    }
    row.balanceBeforeSavings = checking + row.proposal; row.checking = checking; row.savings = savings;
  }

  return Array.from({ length: monthCount }, (_, i) => monthState.get(shiftMonth(input.startMonth, i)) ?? ensureRow(shiftMonth(input.startMonth, i)));
}
