export type BudgetCategory = {
  id: string;
  parent_id: string | null;
  monthly_budget: number;
  account_id?: string | null;
  movement_type?: string;
  budget_period?: "monthly" | "specific_month";
  budget_month?: string | null;
};

export type BudgetAccount = {
  id: string;
  account_type: "checking" | "savings";
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
  category: Pick<BudgetCategory, "budget_period" | "budget_month">,
  month: string,
): boolean {
  if ((category.budget_period ?? "monthly") === "monthly") return true;
  return Boolean(category.budget_month && String(category.budget_month).slice(0, 7) === month.slice(0, 7));
}

export function calculateBudgetRemaining(
  monthlyBudget: number,
  spentAmount: number,
): number {
  return Math.max(0, Number(monthlyBudget || 0) - Number(spentAmount || 0));
}
