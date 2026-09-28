import { accountingDate } from "./calendar";

export type BudgetCategory = {
  id: string;
  parent_id: string | null;
  monthly_budget: number;
  account_id?: string | null;
  movement_type?: string;
  budget_period?: "monthly" | "specific_month";
  budget_month?: string | null;
  budget_start_date?: string | null;
  budget_end_date?: string | null;
};

export type BudgetAccount = {
  id: string;
  account_type: "checking" | "savings" | "crypto";
  is_default?: boolean;
};

export function createCategoryRootResolver(categories: BudgetCategory[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));

  return (categoryId: string | null | undefined): string | null => {
    let category = categoryId ? byId.get(categoryId) : undefined;
    const visited = new Set<string>();

    while (category?.parent_id && !visited.has(category.id)) {
      visited.add(category.id);
      category = byId.get(category.parent_id);
    }

    return category?.id ?? null;
  };
}

export function resolveBudgetAccountId(
  category: { account_id?: string | null },
  movementDefaultAccountId: string | null | undefined,
  accounts: BudgetAccount[] = [],
): string | null {
  return (
    category.account_id ??
    movementDefaultAccountId ??
    accounts.find((account) => account.account_type === "checking" && account.is_default)?.id ??
    accounts.find((account) => account.account_type === "checking")?.id ??
    null
  );
}

export function isBudgetActiveForMonth(
  category: Pick<BudgetCategory, "budget_period" | "budget_month" | "budget_start_date" | "budget_end_date">,
  month: string,
): boolean {
  const monthKey = month.slice(0, 7);
  if ((category.budget_period ?? "monthly") === "specific_month") {
    return Boolean(category.budget_month && String(category.budget_month).slice(0, 7) === monthKey);
  }

  const startMonth = category.budget_start_date ? String(category.budget_start_date).slice(0, 7) : null;
  const endMonth = category.budget_end_date ? String(category.budget_end_date).slice(0, 7) : null;
  if (startMonth && monthKey < startMonth) return false;
  if (endMonth && monthKey > endMonth) return false;
  return true;
}


export type BudgetFlow = { movement_type: string; amount: number };

export function budgetFlowImpact(flow: BudgetFlow): number {
  const amount = Number(flow.amount || 0);
  if (["expense", "transfer_out"].includes(flow.movement_type)) return amount;
  if (["income", "transfer_in"].includes(flow.movement_type)) return -amount;
  return 0;
}

export function calculateBudgetUsage(
  monthlyBudget: number,
  flows: BudgetFlow[],
  budgetMovementType: "expense" | "income" | string = "expense",
): { netUsed: number; spent: number; remaining: number } {
  const direction = budgetMovementType === "income" ? -1 : 1;
  const netUsed = flows.reduce((sum, flow) => sum + budgetFlowImpact(flow) * direction, 0);
  const spent = Math.max(0, netUsed);
  return {
    netUsed,
    spent,
    remaining: calculateBudgetRemaining(monthlyBudget, spent),
  };
}
export function calculateBudgetRemaining(
  monthlyBudget: number,
  spentAmount: number,
): number {
  return Math.max(0, Number(monthlyBudget || 0) - Number(spentAmount || 0));
}

export type BudgetStatement = {
  id: string; name: string; month: string; account_id: string | null;
  movement_type: string; initial: number; realized: number; committed: number;
  uncommitted: number; overrun: number; futureTotal: number;
};
type BudgetMovement = BudgetFlow & {
  category_id: string | null; status: string; movement_date: string;
  completed_date?: string | null; completed_at?: string | null;
};

/** One global envelope across all PERSO accounts. Transfers never consume it. */
export function buildBudgetStatements(input: {
  months: string[]; today: string; categories: (BudgetCategory & { name?: string })[];
  accounts: BudgetAccount[]; movementDefaultAccountId: string | null;
  movements: BudgetMovement[]; futureOperations: BudgetMovement[];
}): BudgetStatement[] {
  const root = createCategoryRootResolver(input.categories);
  const realized = new Map<string, BudgetFlow[]>(), committed = new Map<string, BudgetFlow[]>();
  const register = (map: Map<string, BudgetFlow[]>, row: BudgetMovement, day: string) => {
    if (!["expense", "income"].includes(row.movement_type)) return;
    const id = root(row.category_id); if (!id) return;
    const key = `${day.slice(0, 7)}:${id}`;
    const rows = map.get(key) ?? []; rows.push(row); map.set(key, rows);
  };
  for (const row of input.movements) {
    if (row.status === "completed" && accountingDate(row) <= input.today) register(realized, row, accountingDate(row));
  }
  for (const row of input.futureOperations) {
    if (row.status === "planned") register(committed, row, row.movement_date);
  }
  return input.months.flatMap(month => input.categories
    .filter(category => !category.parent_id && Number(category.monthly_budget) > 0 && isBudgetActiveForMonth(category, month))
    .map(category => {
      const key = `${month}:${category.id}`, type = category.movement_type ?? "expense";
      const initial = cents(category.monthly_budget);
      const paid = cents(calculateBudgetUsage(initial, realized.get(key) ?? [], type).spent);
      const planned = cents(calculateBudgetUsage(initial, committed.get(key) ?? [], type).spent);
      const uncommitted = cents(Math.max(0, initial - paid - planned));
      return { id: category.id, name: category.name ?? "Budget", month,
        account_id: resolveBudgetAccountId(category, input.movementDefaultAccountId, input.accounts), movement_type: type,
        initial, realized: paid, committed: planned, uncommitted,
        overrun: cents(Math.max(0, paid + planned - initial)), futureTotal: cents(planned + uncommitted) };
    }));
}
const cents = (amount: number) => Math.round(Number(amount) * 100) / 100;
