"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Minus,
  PiggyBank,
  SlidersHorizontal,
  RotateCcw,
  Save,
} from "lucide-react";
import { applyCategoryBudgetSimulation, updateCategory } from "@/app/(app)/perso/actions";

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  monthly_budget: number;
  movement_type?: string;
  budget_period?: string;
  budget_month?: string | null;
  account_id?: string | null;
  is_essential?: boolean;
};

type Movement = {
  category_id: string | null;
  movement_type: string;
  amount: number;
  movement_date: string;
  status: string;
};

type Recurrence = {
  category_id: string | null;
  movement_type: string;
  amount: number;
  frequency?: string;
  interval_count?: number;
  is_active?: boolean;
};

type MonthValue = { month: string; amount: number };

type AnalysisRow = Category & {
  currentSpent: number;
  currentPlanned: number;
  average12: number;
  previousAverage3: number;
  recentAverage3: number;
  advisedBudget: number;
  potentialSaving: number;
  trend: "up" | "down" | "stable";
  history: MonthValue[];
  children: Category[];
};

const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(
    new Date(`${month}-01T12:00:00`),
  );

function monthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function shiftMonth(month: string, delta: number) {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return monthKey(date);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function monthlyRecurrenceAmount(recurrence: Recurrence) {
  const amount = Number(recurrence.amount || 0);
  const interval = Math.max(1, Number(recurrence.interval_count || 1));
  if (recurrence.frequency === "weekly") return (amount * 52) / 12 / interval;
  if (recurrence.frequency === "quarterly") return amount / (3 * interval);
  if (recurrence.frequency === "yearly") return amount / (12 * interval);
  return amount / interval;
}

export function CategoryBudgetAnalysis({
  categories,
  movements,
  recurrences,
  currentLowestBalance = null,
  currentSavingsProposal = 0,
  currentSavingsRecovery = 0,
}: {
  categories: Category[];
  movements: Movement[];
  recurrences: Recurrence[];
  currentLowestBalance?: number | null;
  currentSavingsProposal?: number;
  currentSavingsRecovery?: number;
}) {
  const [savingRate, setSavingRate] = useState(20);
  const [simulatedBudgets, setSimulatedBudgets] = useState<Record<string, number>>({});
  const [showOnlyOptional, setShowOnlyOptional] = useState(false);
  const currentMonth = monthKey(new Date());
  const historyMonths = useMemo(
    () => Array.from({ length: 12 }, (_, index) => shiftMonth(currentMonth, index - 11)),
    [currentMonth],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const rootOf = (categoryId: string | null) => {
    let category = categoryId ? categoryById.get(categoryId) : undefined;
    let guard = 0;
    while (category?.parent_id && guard++ < 30) {
      category = categoryById.get(category.parent_id);
    }
    return category?.id ?? null;
  };

  const rows = useMemo<AnalysisRow[]>(() => {
    const roots = categories.filter(
      (category) => !category.parent_id && category.movement_type === "expense",
    );

    return roots
      .map((category) => {
        const history = historyMonths.map((month) => ({
          month,
          amount: movements
            .filter(
              (movement) =>
                movement.movement_type === "expense" &&
                movement.status === "completed" &&
                movement.movement_date.startsWith(month) &&
                rootOf(movement.category_id) === category.id,
            )
            .reduce((sum, movement) => sum + Number(movement.amount || 0), 0),
        }));

        const currentSpent = movements
          .filter(
            (movement) =>
              movement.movement_type === "expense" &&
              movement.status === "completed" &&
              movement.movement_date.startsWith(currentMonth) &&
              rootOf(movement.category_id) === category.id,
          )
          .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);

        const currentPlanned = movements
          .filter(
            (movement) =>
              movement.movement_type === "expense" &&
              movement.status === "planned" &&
              movement.movement_date.startsWith(currentMonth) &&
              rootOf(movement.category_id) === category.id,
          )
          .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);

        const historicalValues = history
          .filter((item) => item.month !== currentMonth)
          .map((item) => item.amount);
        const average12 = average(historicalValues);
        const previousAverage3 = average(historicalValues.slice(-6, -3));
        const recentAverage3 = average(historicalValues.slice(-3));
        const variationBase = Math.max(previousAverage3, 1);
        const variation = (recentAverage3 - previousAverage3) / variationBase;
        const trend: AnalysisRow["trend"] =
          variation > 0.1 ? "up" : variation < -0.1 ? "down" : "stable";

        const recurringMonthly = recurrences
          .filter(
            (recurrence) =>
              recurrence.is_active !== false &&
              recurrence.movement_type === "expense" &&
              rootOf(recurrence.category_id) === category.id,
          )
          .reduce((sum, recurrence) => sum + monthlyRecurrenceAmount(recurrence), 0);

        const observedReference = Math.max(average12, recurringMonthly);
        const advisedBudget =
          observedReference > 0 ? Math.ceil((observedReference * 1.1) / 5) * 5 : 0;
        const configuredBudget = Number(category.monthly_budget || 0);
        const reducibleBase = configuredBudget > 0 ? configuredBudget : observedReference;
        const potentialSaving =
          category.is_essential === false
            ? Math.max(0, reducibleBase * (savingRate / 100))
            : 0;

        return {
          ...category,
          currentSpent,
          currentPlanned,
          average12,
          previousAverage3,
          recentAverage3,
          advisedBudget,
          potentialSaving,
          trend,
          history,
          children: categories.filter((child) => child.parent_id === category.id),
        };
      })
      .sort((left, right) => {
        if (left.is_essential !== right.is_essential) return left.is_essential === false ? -1 : 1;
        return right.potentialSaving - left.potentialSaving || left.name.localeCompare(right.name, "fr");
      });
  }, [categories, currentMonth, historyMonths, movements, recurrences, savingRate]);

  const simulatedRows = rows.map((row) => {
    const currentBudget = Number(row.monthly_budget || 0);
    const defaultTarget = row.is_essential === false
      ? Math.max(0, Math.round((currentBudget * (1 - savingRate / 100)) * 100) / 100)
      : currentBudget;
    const simulatedBudget = simulatedBudgets[row.id] ?? defaultTarget;
    return {
      ...row,
      simulatedBudget,
      simulatedSaving: row.is_essential === false ? Math.max(0, currentBudget - simulatedBudget) : 0,
    };
  });
  const visibleRows = showOnlyOptional ? simulatedRows.filter((row) => row.is_essential === false) : simulatedRows;
  const totalBudget = rows.reduce((sum, row) => sum + Number(row.monthly_budget || 0), 0);
  const currentSpent = rows.reduce((sum, row) => sum + row.currentSpent, 0);
  const essentialBudget = rows
    .filter((row) => row.is_essential !== false)
    .reduce((sum, row) => sum + Number(row.monthly_budget || 0), 0);
  const optionalBudget = totalBudget - essentialBudget;
  const monthlySaving = simulatedRows.reduce((sum, row) => sum + row.simulatedSaving, 0);
  const changes = simulatedRows
    .filter((row) => row.is_essential === false && Math.abs(row.simulatedBudget - Number(row.monthly_budget || 0)) >= 0.01)
    .map((row) => ({ id: row.id, name: row.name, from: Number(row.monthly_budget || 0), to: row.simulatedBudget }));
  const projectedLowestBalance = currentLowestBalance == null ? null : currentLowestBalance + monthlySaving;
  const projectedSavingsProposal = Math.max(0, currentSavingsProposal + monthlySaving);
  const projectedSavingsRecovery = Math.max(0, currentSavingsRecovery - monthlySaving);
  const consumptionRate = totalBudget > 0 ? Math.round((currentSpent / totalBudget) * 100) : 0;

  return (
    <section id="analyse-categories-budgets" className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-500">Synthèse et simulation</p>
        <h2 className="mt-2 text-xl font-semibold">Catégories et budgets</h2>
        <p className="mt-1 text-sm text-neutral-500">Analyse les 12 derniers mois et distingue les dépenses essentielles des dépenses facultatives.</p>
      </div>
      <div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Budget mensuel total" value={money(totalBudget)} />
          <Metric
            label="Consommé ce mois"
            value={money(currentSpent)}
            detail={`${consumptionRate}% du budget`}
          />
          <Metric
            label="Budget facultatif"
            value={money(optionalBudget)}
            detail={`${money(essentialBudget)} essentiel`}
          />
          <Metric
            label="Économie annuelle simulée"
            value={money(monthlySaving * 12)}
            detail={`${money(monthlySaving)}/mois`}
            dark
          />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block rounded-2xl bg-neutral-50 p-4">
            <span className="flex items-center justify-between gap-3 text-sm font-medium">
              <span className="flex items-center gap-2">
                <SlidersHorizontal size={16} />
                Réduction simulée sur les catégories facultatives
              </span>
              <strong>{savingRate}%</strong>
            </span>
            <input
              className="mt-3 w-full"
              type="range"
              min="5"
              max="50"
              step="5"
              value={savingRate}
              onChange={(event) => { setSavingRate(Number(event.target.value)); setSimulatedBudgets({}); }}
            />
          </label>
          <label className="flex min-h-16 items-center gap-3 rounded-2xl border border-black/10 px-4 text-sm font-medium">
            <input
              type="checkbox"
              checked={showOnlyOptional}
              onChange={(event) => setShowOnlyOptional(event.target.checked)}
            />
            Afficher uniquement les facultatives
          </label>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <Metric label="Économie mensuelle simulée" value={money(monthlySaving)} detail={`${money(monthlySaving * 12)}/an`} dark />
          <Metric label="Point bas estimé après simulation" value={projectedLowestBalance == null ? "—" : money(projectedLowestBalance)} detail={currentLowestBalance == null ? "Point bas non disponible" : `Actuel : ${money(currentLowestBalance)}`} />
          <Metric label={projectedSavingsRecovery > 0 ? "Épargne à reprendre estimée" : "Épargne disponible estimée"} value={money(projectedSavingsRecovery > 0 ? projectedSavingsRecovery : projectedSavingsProposal)} detail="Estimation sur le prochain cycle" />
        </div>

        <form action={applyCategoryBudgetSimulation} className="mt-5 rounded-2xl border border-black/10 bg-neutral-50 p-4" onSubmit={(event) => {
          if (!changes.length || !window.confirm(`Appliquer ${changes.length} modification(s) de budget ?`)) event.preventDefault();
        }}>
          <input type="hidden" name="changes" value={JSON.stringify(changes.map(({id,to}) => ({id, monthly_budget: to})))} />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-semibold">Application de la simulation</p>
              <p className="mt-1 text-sm text-neutral-500">{changes.length ? `${changes.length} budget(s) seront modifiés. Les budgets essentiels restent inchangés.` : "Aucune différence avec les budgets actuels."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSimulatedBudgets(Object.fromEntries(rows.map((row) => [row.id, Number(row.monthly_budget || 0)])))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium"><RotateCcw size={16}/>Annuler la simulation</button>
              <button disabled={!changes.length} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-black px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"><Save size={16}/>Appliquer aux budgets</button>
            </div>
          </div>
          {changes.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{changes.map((change) => <div key={change.id} className="rounded-xl bg-white px-3 py-2 text-sm"><span className="font-medium">{change.name}</span><span className="ml-2 text-neutral-500">{money(change.from)} → {money(change.to)}</span></div>)}</div> : null}
        </form>

        <div className="mt-5 overflow-hidden rounded-2xl border border-black/10">
          <div className="hidden grid-cols-[minmax(180px,1.3fr)_repeat(5,minmax(105px,.7fr))_150px] gap-3 bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-500 xl:grid">
            <span>Catégorie</span>
            <span>Budget</span>
            <span>Ce mois</span>
            <span>Moyenne 12 mois</span>
            <span>Conseillé</span>
            <span>Tendance</span>
            <span>Classification</span>
          </div>

          <div className="divide-y divide-black/10">
            {visibleRows.map((row) => (
              <CategoryRow key={row.id} row={row} simulatedBudget={row.simulatedBudget} onSimulatedBudgetChange={(value) => setSimulatedBudgets((current) => ({ ...current, [row.id]: value }))} />
            ))}
            {!visibleRows.length ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">
                Aucune catégorie ne correspond au filtre.
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-xs leading-5 text-neutral-500">
          La moyenne repose sur les dépenses pointées des 12 derniers mois. Le budget conseillé ajoute une
          marge de 10 % à la consommation observée et ne modifie aucun réglage automatiquement.
        </p>
      </div>
    </section>
  );
}

function CategoryRow({ row, simulatedBudget, onSimulatedBudgetChange }: { row: AnalysisRow; simulatedBudget: number; onSimulatedBudgetChange: (value: number) => void }) {
  const [open, setOpen] = useState(false);
  const budget = Number(row.monthly_budget || 0);
  const projected = row.currentSpent + row.currentPlanned;
  const remaining = Math.max(0, budget - projected);
  const overBudget = budget > 0 && projected > budget;

  return (
    <div className="px-4 py-4">
      <div className="grid items-center gap-3 xl:grid-cols-[minmax(180px,1.3fr)_repeat(5,minmax(105px,.7fr))_150px]">
        <button type="button" onClick={() => setOpen((value) => !value)} className="text-left">
          <span className="flex items-center gap-2 font-medium">
            <ChevronDown size={15} className={`transition ${open ? "rotate-180" : ""}`} />
            {row.name}
          </span>
          <span className="mt-1 block text-xs text-neutral-500">
            {row.children.length ? `${row.children.length} sous-catégorie(s)` : "Sans sous-catégorie"}
          </span>
        </button>

        <Value label="Budget" value={money(budget)} />
        <Value
          label="Ce mois"
          value={money(projected)}
          detail={`${money(row.currentSpent)} pointé · ${money(row.currentPlanned)} prévu`}
          danger={overBudget}
        />
        <Value label="Moyenne 12 mois" value={money(row.average12)} />
        <Value
          label="Budget conseillé"
          value={row.advisedBudget > 0 ? money(row.advisedBudget) : "—"}
          detail={budget > 0 ? `${money(remaining)} encore disponible` : undefined}
        />
        <Trend trend={row.trend} />

        <form action={updateCategory} className="flex flex-wrap items-center gap-2 xl:justify-end">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="name" value={row.name} />
          <input type="hidden" name="movement_type" value={row.movement_type ?? "expense"} />
          <input type="hidden" name="monthly_budget" value={row.monthly_budget ?? 0} />
          <input type="hidden" name="budget_period" value={row.budget_period ?? "monthly"} />
          <input type="hidden" name="budget_month" value={row.budget_month?.slice(0, 7) ?? ""} />
          <input type="hidden" name="account_id" value={row.account_id ?? ""} />
          <label
            className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${
              row.is_essential === false
                ? "bg-amber-50 text-amber-900"
                : "bg-emerald-50 text-emerald-900"
            }`}
          >
            <input name="is_essential" type="checkbox" defaultChecked={row.is_essential !== false} />
            {row.is_essential === false ? <Circle size={14} /> : <CheckCircle2 size={14} />}
            {row.is_essential === false ? "Facultative" : "Essentielle"}
          </label>
          <button className="rounded-xl bg-black px-3 py-2 text-xs font-medium text-white">Enregistrer</button>
        </form>
      </div>

      {row.is_essential === false ? (
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <span className="flex items-center gap-2"><PiggyBank size={16} />Nouveau budget simulé</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input aria-label={`Budget simulé ${row.name}`} type="range" min="0" max={Math.max(1, budget)} step="5" value={Math.min(simulatedBudget, Math.max(1, budget))} onChange={(event) => onSimulatedBudgetChange(Number(event.target.value))} className="w-full sm:w-48" />
              <div className="flex items-center gap-2"><input type="number" min="0" step="0.01" value={simulatedBudget} onChange={(event) => onSimulatedBudgetChange(Math.max(0, Number(event.target.value) || 0))} className="h-10 w-28 rounded-lg border border-emerald-900/15 bg-white px-3 text-right font-semibold"/><span>/mois</span></div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>Économie : <strong>{money(Math.max(0, budget - simulatedBudget))}/mois</strong> · <strong>{money(Math.max(0, budget - simulatedBudget) * 12)}/an</strong></span>
            <span className="flex items-center gap-1 font-medium">Simulation avant application <ArrowRight size={14}/></span>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="mt-4 grid gap-4 rounded-2xl bg-neutral-50 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Historique des dépenses pointées
            </p>
            <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-12">
              {row.history.map((item) => {
                const max = Math.max(...row.history.map((historyItem) => historyItem.amount), 1);
                const height = Math.max(5, Math.round((item.amount / max) * 64));
                return (
                  <div key={item.month} className="flex min-w-0 flex-col items-center justify-end gap-2">
                    <span className="text-[10px] font-medium text-neutral-500">{money(item.amount)}</span>
                    <span
                      className="w-full max-w-6 rounded-t bg-black/75"
                      style={{ height: `${height}px` }}
                      title={`${monthLabel(item.month)} : ${money(item.amount)}`}
                    />
                    <span className="truncate text-[9px] text-neutral-500">{monthLabel(item.month).split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl bg-white p-4 text-sm">
            <p className="font-semibold">Lecture de la catégorie</p>
            <dl className="mt-3 space-y-2 text-neutral-600">
              <Line label="Moyenne des 3 derniers mois" value={money(row.recentAverage3)} />
              <Line label="Moyenne des 3 mois précédents" value={money(row.previousAverage3)} />
              <Line label="Budget actuel" value={money(budget)} />
              <Line label="Budget conseillé" value={row.advisedBudget ? money(row.advisedBudget) : "—"} />
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Trend({ trend }: { trend: AnalysisRow["trend"] }) {
  if (trend === "up") {
    return (
      <span className="flex items-center gap-2 text-sm font-medium text-red-700">
        <ArrowUpRight size={16} /> Hausse
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="flex items-center gap-2 text-sm font-medium text-emerald-700">
        <ArrowDownRight size={16} /> Baisse
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm font-medium text-neutral-600">
      <Minus size={16} /> Stable
    </span>
  );
}

function Value({
  label,
  value,
  detail,
  danger,
}: {
  label: string;
  value: string;
  detail?: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-neutral-500 xl:hidden">{label}</p>
      <p className={`text-sm font-semibold ${danger ? "text-red-700" : "text-neutral-950"}`}>{value}</p>
      {detail ? <p className="mt-1 text-[10px] leading-4 text-neutral-500">{detail}</p> : null}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  dark,
}: {
  label: string;
  value: string;
  detail?: string;
  dark?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 ${dark ? "bg-black text-white" : "bg-neutral-100"}`}>
      <p className="text-xs opacity-65">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs opacity-60">{detail}</p> : null}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-semibold text-neutral-950">{value}</dd>
    </div>
  );
}
