import {
  calculateBudgetRemaining,
  createCategoryRootResolver,
  resolveBudgetAccountId,
  type BudgetAccount,
} from "./budget-engine";

export type SavingsAccount = BudgetAccount;
export type SavingsCategory = {
  id: string;
  parent_id: string | null;
  monthly_budget: number;
  account_id?: string | null;
  movement_type?: string;
};
export type SavingsMovement = {
  id?: string;
  account_id: string;
  category_id: string | null;
  movement_type: string;
  amount: number;
  movement_date: string;
  status: string;
  recurrence_id?: string | null;
  transfer_group_id?: string | null;
};
export type SavingsRecurrence = {
  id: string;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  movement_type: "income" | "expense" | "transfer";
  amount: number;
  frequency: string;
  interval_count: number;
  start_date: string;
  end_date: string | null;
  is_active?: boolean;
};
export type SavingsOverride = { recurrence_id: string; occurrence_month: string; amount: number };
export type SavingsExclusion = { recurrence_id: string; occurrence_date: string };
export type SavingsPhotoPayment = {
  amount: number;
  expected_date: string | null;
  received_date: string | null;
  status: string;
  personal_account_id: string | null;
  accounting_status?: string;
};
export type SavingsUrssafState = {
  contribution_month: string;
  account_id: string | null;
  is_completed: boolean;
};
export type SavingsProposalDecision = {
  source_account_id: string;
  destination_account_id: string;
  source_month: string;
  amount: number;
  status: "pending" | "accepted" | "deleted";
  transfer_group_id?: string | null;
  calculation_base?: number | null;
};
export type SavingsPlanRow = {
  month: string;
  openingChecking: number;
  checking: number;
  savings: number;
  proposal: number;
  savingsUsed: number;
  balanceAfterSavingsUse: number;
  income: number;
  expense: number;
  debitExcludingBudgetRemaining: number;
  budgetRemaining: number;
  balanceBeforeSavings: number;
  requiredReserve: number;
};

type Input = {
  sourceAccountId: string;
  destinationAccountId: string;
  initialChecking: number;
  initialSavings: number;
  startMonth: string;
  accounts?: SavingsAccount[];
  categories: SavingsCategory[];
  movements: SavingsMovement[];
  recurrences: SavingsRecurrence[];
  overrides?: SavingsOverride[];
  exclusions?: SavingsExclusion[];
  photoPayments?: SavingsPhotoPayment[];
  photoDefaultAccountId?: string | null;
  urssafStates?: SavingsUrssafState[];
  urssafDefaultAccountId?: string | null;
  movementDefaultAccountId?: string | null;
  savingsProposals?: SavingsProposalDecision[];
  months?: number;
  minReserve?: number;
};

const shiftMonth = (month: string, delta: number) => {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return date.toISOString().slice(0, 7);
};
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addOccurrence = (date: Date, frequency: string, count: number) => {
  const next = new Date(date);
  if (frequency === "weekly") next.setDate(next.getDate() + 7 * count);
  else if (frequency === "quarterly") next.setMonth(next.getMonth() + 3 * count);
  else if (frequency === "yearly") next.setFullYear(next.getFullYear() + count);
  else next.setMonth(next.getMonth() + count);
  return next;
};

export function calculateSavingsPlan(input: Input): SavingsPlanRow[] {
  const monthCount = input.months ?? 60;
  const resolveRoot = createCategoryRootResolver(input.categories);
  const accounts = input.accounts ?? [
    { id: input.sourceAccountId, account_type: "checking" as const, is_default: true },
    { id: input.destinationAccountId, account_type: "savings" as const },
  ];
  const budgetRoots = input.categories.filter((category) => {
    if (category.parent_id || category.movement_type === "income" || Number(category.monthly_budget) <= 0) return false;
    return resolveBudgetAccountId(category, input.movementDefaultAccountId, accounts) === input.sourceAccountId;
  });
  const overrideMap = new Map(
    (input.overrides ?? []).map((override) => [
      `${override.recurrence_id}:${String(override.occurrence_month).slice(0, 7)}`,
      Number(override.amount),
    ]),
  );
  const exclusionSet = new Set(
    (input.exclusions ?? []).map((exclusion) => `${exclusion.recurrence_id}:${exclusion.occurrence_date}`),
  );
  const materialized = new Set(
    input.movements
      .filter((movement) => movement.recurrence_id)
      .map((movement) => `${movement.recurrence_id}:${movement.movement_date}`),
  );
  const relevantProposals = (input.savingsProposals ?? []).filter(
    (proposal) =>
      proposal.source_account_id === input.sourceAccountId &&
      proposal.destination_account_id === input.destinationAccountId,
  );
  const relevantSavingsUseProposals = (input.savingsProposals ?? []).filter(
    (proposal) =>
      proposal.source_account_id === input.destinationAccountId &&
      proposal.destination_account_id === input.sourceAccountId,
  );
  const acceptedTransferGroups = new Set(
    [...relevantProposals, ...relevantSavingsUseProposals]
      .filter((proposal) => proposal.status === "accepted" && proposal.transfer_group_id)
      .map((proposal) => proposal.transfer_group_id as string),
  );
  const proposalByMonth = new Map(
    relevantProposals.map((proposal) => [String(proposal.source_month).slice(0, 7), proposal]),
  );
  const savingsUseProposalByMonth = new Map(
    relevantSavingsUseProposals.map((proposal) => [String(proposal.source_month).slice(0, 7), proposal]),
  );
  const photoForMonth = (month: string) =>
    (input.photoPayments ?? [])
      .filter(
        (payment) =>
          payment.status === "expected" &&
          (payment.expected_date ?? "").startsWith(month) &&
          (payment.personal_account_id ?? input.photoDefaultAccountId) ===
            input.sourceAccountId,
      )
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const photoRevenueForMonth = (month: string) =>
    (input.photoPayments ?? [])
      .filter((payment) => {
        const status = payment.accounting_status ?? payment.status;
        if (status === "cancelled") return false;
        const date = status === "received" ? payment.received_date ?? payment.expected_date : payment.expected_date;
        return date?.startsWith(month);
      })
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const urssafByMonth = new Map(
    (input.urssafStates ?? []).map((state) => [String(state.contribution_month).slice(0, 7), state]),
  );

  const flows: {
    month: string;
    income: number;
    expense: number;
    debitExcludingBudgetRemaining: number;
    budgetRemaining: number;
    net: number;
  }[] = [];

  for (let index = 0; index < monthCount; index += 1) {
    const month = shiftMonth(input.startMonth, index);
    let income = 0;
    let expense = 0;
    const spentByBudget = new Map<string, number>();

    for (const movement of input.movements) {
      if (movement.transfer_group_id && acceptedTransferGroups.has(movement.transfer_group_id)) continue;
      if (!movement.movement_date.startsWith(month) || movement.account_id !== input.sourceAccountId) continue;
      const amount = Number(movement.amount);
      if (movement.status === "planned") {
        if (["income", "transfer_in"].includes(movement.movement_type)) income += amount;
        else expense += amount;
      }
      if (movement.movement_type === "expense") {
        const rootId = resolveRoot(movement.category_id);
        if (rootId) spentByBudget.set(rootId, (spentByBudget.get(rootId) ?? 0) + amount);
      }
    }

    for (const recurrence of input.recurrences.filter((item) => item.is_active !== false)) {
      let occurrence = new Date(`${recurrence.start_date}T12:00:00`);
      const monthEnd = new Date(`${month}-01T12:00:00`);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);
      let guard = 0;

      while (occurrence <= monthEnd && guard < 3000) {
        guard += 1;
        const date = isoDate(occurrence);
        const isIncluded =
          date.startsWith(month) &&
          (!recurrence.end_date || date <= recurrence.end_date) &&
          !exclusionSet.has(`${recurrence.id}:${date}`) &&
          !materialized.has(`${recurrence.id}:${date}`);

        if (isIncluded) {
          const amount = overrideMap.get(`${recurrence.id}:${month}`) ?? Number(recurrence.amount);
          if (recurrence.movement_type === "income" && recurrence.account_id === input.sourceAccountId) {
            income += amount;
          } else if (recurrence.movement_type === "expense" && recurrence.account_id === input.sourceAccountId) {
            expense += amount;
            const rootId = resolveRoot(recurrence.category_id);
            if (rootId) spentByBudget.set(rootId, (spentByBudget.get(rootId) ?? 0) + amount);
          } else if (recurrence.movement_type === "transfer") {
            if (recurrence.account_id === input.sourceAccountId) expense += amount;
            if (recurrence.destination_account_id === input.sourceAccountId) income += amount;
          }
        }

        occurrence = addOccurrence(
          occurrence,
          recurrence.frequency,
          Math.max(1, Number(recurrence.interval_count || 1)),
        );
      }
    }

    income += photoForMonth(month);

    const urssafAmount = Math.round(photoRevenueForMonth(shiftMonth(month, -1)) * 0.216 * 100) / 100;
    const urssafState = urssafByMonth.get(month);
    const urssafAccountId = urssafState?.account_id ?? input.urssafDefaultAccountId;
    if (urssafAmount > 0 && !urssafState?.is_completed && urssafAccountId === input.sourceAccountId) {
      expense += urssafAmount;
    }

    const debitExcludingBudgetRemaining = expense;
    let budgetRemaining = 0;
    for (const budget of budgetRoots) {
      budgetRemaining += calculateBudgetRemaining(
        Number(budget.monthly_budget),
        spentByBudget.get(budget.id) ?? 0,
      );
    }
    expense += budgetRemaining;

    flows.push({
      month,
      income,
      expense,
      debitExcludingBudgetRemaining,
      budgetRemaining,
      net: income - expense,
    });
  }

  const minimumReserve = Math.max(0, Number(input.minReserve ?? 500));

  let checking = Number(input.initialChecking);
  let savings = Number(input.initialSavings);
  const rows: SavingsPlanRow[] = [];

  /*
   * Projection glissante : chaque mois repart du solde réellement conservé
   * à la fin du mois précédent. Après application de tous les flux du mois
   * (mouvements, récurrences, photo, URSSAF et budgets restants), tout excédent
   * au-dessus du seuil est proposé au virement vers l'épargne. La simulation
   * considère ce virement comme réalisé au 1er du mois suivant, de sorte que
   * le mois suivant démarre bien avec le solde conservé sur le compte courant.
   */
  for (let index = 0; index < monthCount; index += 1) {
    const flow = flows[index];
    const openingChecking = checking;
    const balanceBeforeSavings = openingChecking + flow.net;
    checking = balanceBeforeSavings;

    // Si le compte courant devient négatif, proposer une utilisation de l'épargne
    // disponible afin de compenser tout ou partie du découvert.
    const automaticSavingsUse = Math.min(Math.max(0, -checking), Math.max(0, savings));
    const savingsUseDecision = savingsUseProposalByMonth.get(flow.month);
    const requestedSavingsUse = savingsUseDecision?.status === "deleted"
      ? 0
      : savingsUseDecision && ["pending", "accepted"].includes(savingsUseDecision.status)
        ? Math.max(0, Number(savingsUseDecision.amount))
        : automaticSavingsUse;
    const savingsUsed = Math.min(Math.max(0, savings), requestedSavingsUse);
    if (savingsUsed > 0) {
      checking += savingsUsed;
      savings -= savingsUsed;
    }
    const balanceAfterSavingsUse = checking;

    const automaticProposal = Math.max(0, balanceAfterSavingsUse - minimumReserve);
    const decision = proposalByMonth.get(flow.month);
    const requestedProposal = decision?.status === "deleted"
      ? 0
      : decision && ["pending", "accepted"].includes(decision.status)
        ? Math.max(0, Number(decision.amount))
        : automaticProposal;
    const proposal = Math.min(Math.max(0, balanceAfterSavingsUse), requestedProposal);
    if (proposal > 0) {
      checking -= proposal;
      savings += proposal;
    }

    rows.push({
      month: flow.month,
      openingChecking,
      checking,
      savings,
      proposal,
      savingsUsed,
      balanceAfterSavingsUse,
      income: flow.income,
      expense: flow.expense,
      debitExcludingBudgetRemaining: flow.debitExcludingBudgetRemaining,
      budgetRemaining: flow.budgetRemaining,
      balanceBeforeSavings,
      requiredReserve: minimumReserve,
    });
  }

  return rows;
}
