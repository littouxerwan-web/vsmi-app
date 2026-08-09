"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  ChevronDown,
  FolderPlus,
  Repeat2,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  assignMovementCategory,
  createCategoryAndAssignMovement,
  updateMovementAnalysisEssential,
} from "@/app/(app)/perso/actions";

type Movement = {
  id: string;
  account_id: string;
  category_id?: string | null;
  movement_type: string;
  label: string;
  amount: number;
  movement_date: string;
  status: string;
  transfer_group_id?: string | null;
  recurrence_id?: string | null;
  source?: string;
  source_type?: string | null;
  exclude_from_analysis?: boolean | null;
  is_essential_override?: boolean | null;
  savingsProposal?: { kind?: "use" | "deposit" } | null;
};
type Category = {
  id: string;
  name: string;
  movement_type?: string;
  parent_id?: string | null;
  is_essential?: boolean | null;
  exclude_from_analysis?: boolean | null;
};
type Recurrence = {
  id: string;
  is_essential?: boolean | null;
  exclude_from_analysis?: boolean | null;
};
type Account = { id: string; name: string; account_type: string };
type ProjectionPoint = {
  date: string;
  balances: Record<string, number>;
  checking: number;
  savings: number;
  total: number;
};
type Period = "month" | "1y" | "3y";
type AnalysisRow = Movement & { analysisKind: "realized" | "forecast"; essential: boolean };
type CategorySummary = {
  key: string;
  name: string;
  amount: number;
  realized: number;
  forecast: number;
  rows: AnalysisRow[];
};

const euro = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
const euro2 = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
const pct = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }).format(n);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (d = new Date()) => `${iso(d).slice(0, 7)}-01`;
const monthEnd = (start: string, months: number) => {
  const d = new Date(`${start}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  d.setDate(0);
  return iso(d);
};
const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return iso(d).slice(0, 7);
};
const monthLabel = (m: string) =>
  new Date(`${m}-01T12:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
const dateLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR");

export function AnalysisView({
  movements,
  projectedOperations,
  projectionPoints,
  categories,
  accounts,
  recurrences,
}: {
  movements: Movement[];
  projectedOperations: Movement[];
  projectionPoints: ProjectionPoint[];
  categories: Category[];
  accounts: Account[];
  recurrences: Recurrence[];
}) {
  const [period, setPeriod] = useState<Period>("month");
  const [accountId, setAccountId] = useState("all");
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [uncatOpen, setUncatOpen] = useState(false);

  const context = useMemo(() => {
    const start = monthStart();
    const months = period === "month" ? 1 : period === "1y" ? 12 : 36;
    const end = monthEnd(start, months);
    const startM = start.slice(0, 7);
    const catById = new Map(categories.map((c) => [c.id, c]));
    const recById = new Map(recurrences.map((r) => [r.id, r]));
    const root = (id?: string | null) => {
      let c = id ? catById.get(id) : undefined;
      const seen = new Set<string>();
      while (c?.parent_id && !seen.has(c.id)) {
        seen.add(c.id);
        c = catById.get(c.parent_id);
      }
      return c;
    };
    const movementExcluded = (m: Movement) =>
      Boolean(
        m.exclude_from_analysis ||
          (m.category_id && root(m.category_id)?.exclude_from_analysis) ||
          (m.recurrence_id && recById.get(m.recurrence_id)?.exclude_from_analysis),
      );
    const accountMatches = (m: Movement) => accountId === "all" || m.account_id === accountId;
    const valid = (m: Movement) =>
      m.movement_date >= start &&
      m.movement_date <= end &&
      accountMatches(m) &&
      !m.movement_type.startsWith("transfer") &&
      !movementExcluded(m);
    const essentialFor = (m: Movement, kind: "realized" | "forecast") => {
      if (kind === "realized" && m.is_essential_override !== null && m.is_essential_override !== undefined) {
        return Boolean(m.is_essential_override);
      }
      const recurrence = m.recurrence_id ? recById.get(m.recurrence_id) : undefined;
      const category = root(m.category_id);
      if (recurrence?.is_essential !== null && recurrence?.is_essential !== undefined) {
        return Boolean(recurrence.is_essential);
      }
      return Boolean(category?.is_essential);
    };

    const realized: AnalysisRow[] = movements
      .filter((m) => m.status === "completed" && valid(m))
      .map((m) => ({ ...m, analysisKind: "realized", essential: essentialFor(m, "realized") }));
    const forecast: AnalysisRow[] = projectedOperations
      .filter((m) => m.status !== "completed" && valid(m))
      .map((m) => ({ ...m, analysisKind: "forecast", essential: essentialFor(m, "forecast") }));
    const rows = [...realized, ...forecast];
    const expenses = rows.filter((m) => m.movement_type === "expense");
    const incomes = rows.filter((m) => m.movement_type === "income");
    const totalExp = expenses.reduce((s, m) => s + Number(m.amount), 0);
    const totalInc = incomes.reduce((s, m) => s + Number(m.amount), 0);
    const realizedExp = expenses
      .filter((m) => m.analysisKind === "realized")
      .reduce((s, m) => s + Number(m.amount), 0);
    const forecastExp = totalExp - realizedExp;
    const realizedInc = incomes
      .filter((m) => m.analysisKind === "realized")
      .reduce((s, m) => s + Number(m.amount), 0);
    const forecastInc = totalInc - realizedInc;

    const byCat = new Map<string, CategorySummary>();
    for (const m of expenses) {
      const c = root(m.category_id);
      const key = c?.id ?? "none";
      const prev = byCat.get(key) ?? {
        key,
        name: c?.name ?? "Sans catégorie",
        amount: 0,
        realized: 0,
        forecast: 0,
        rows: [],
      };
      prev.amount += Number(m.amount);
      prev[m.analysisKind] += Number(m.amount);
      prev.rows.push(m);
      byCat.set(key, prev);
    }
    const ranked = [...byCat.values()].sort((a, b) => b.amount - a.amount);
    const essentialRows = expenses.filter((m) => m.essential);
    const nonEssentialRows = expenses.filter((m) => !m.essential);
    const essential = essentialRows.reduce((s, m) => s + Number(m.amount), 0);
    const nonEssential = nonEssentialRows.reduce((s, m) => s + Number(m.amount), 0);
    const avg = totalExp / months;
    const avgIncome = totalInc / months;
    const top5 = ranked.slice(0, 5).reduce((s, x) => s + x.amount, 0);
    const biggest = expenses.slice().sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 7);
    const recurringForecast = forecast
      .filter((m) => Boolean(m.recurrence_id) && m.movement_type === "expense")
      .reduce((s, m) => s + Number(m.amount), 0);

    const monthRows = Array.from({ length: months }, (_, i) => {
      const month = shiftMonth(startM, i);
      const mStart = `${month}-01`;
      const mEnd = monthEnd(mStart, 1);
      const planned = projectedOperations.filter(
        (o) =>
          o.status !== "completed" &&
          o.movement_date >= mStart &&
          o.movement_date <= mEnd &&
          (accountId === "all"
            ? accounts.some((a) => a.account_type === "checking" && a.id === o.account_id)
            : o.account_id === accountId) &&
          !movementExcluded(o),
      );
      const expensesPlanned = planned
        .filter((o) => o.movement_type === "expense")
        .reduce((s, o) => s + Number(o.amount), 0);
      const creditsPlanned = planned
        .filter((o) => o.movement_type === "income")
        .reduce((s, o) => s + Number(o.amount), 0);
      const savingsUsed = planned
        .filter(
          (o) =>
            o.source === "savings" &&
            o.movement_type === "transfer_in" &&
            o.savingsProposal?.kind === "use",
        )
        .reduce((s, o) => s + Number(o.amount), 0);
      const savingsDeposited = planned
        .filter(
          (o) =>
            o.source === "savings" &&
            o.movement_type === "transfer_out" &&
            o.savingsProposal?.kind === "deposit",
        )
        .reduce((s, o) => s + Number(o.amount), 0);
      const essentialPlanned = planned
        .filter((o) => o.movement_type === "expense" && essentialFor(o, "forecast"))
        .reduce((s, o) => s + Number(o.amount), 0);
      const point = projectionPoints.find((p) => p.date.slice(0, 7) === month);
      const closing = point
        ? accountId === "all"
          ? Number(point.checking)
          : Number(point.balances?.[accountId] ?? 0)
        : 0;
      return {
        month,
        expensesPlanned,
        creditsPlanned,
        savingsUsed,
        savingsDeposited,
        closing,
        essentialRate: expensesPlanned ? essentialPlanned / expensesPlanned : 0,
      };
    });

    const uncategorized = movements.filter(
      (m) =>
        !m.category_id &&
        !m.movement_type.startsWith("transfer") &&
        m.movement_date >= start &&
        m.movement_date <= end &&
        accountMatches(m),
    );
    return {
      totalExp,
      totalInc,
      realizedExp,
      forecastExp,
      realizedInc,
      forecastInc,
      ranked,
      essential,
      nonEssential,
      essentialRows,
      nonEssentialRows,
      avg,
      avgIncome,
      top5,
      biggest,
      months,
      recurringMonthly: recurringForecast / months,
      monthRows,
      uncategorized,
    };
  }, [period, accountId, movements, projectedOperations, projectionPoints, categories, recurrences, accounts]);

  const top = context.ranked[0];
  const savingsPotential = context.nonEssential * 0.1;
  const coverage = context.totalExp ? context.totalInc / context.totalExp : 0;

  return (
    <div className="mt-5 space-y-5">
      <section className="border-y border-black/10 bg-white px-3 py-5 sm:px-5 lg:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-500">Analyse réalisé + prévisionnel</p>
            <h2 className="mt-2 text-2xl font-semibold">Où part ton argent ?</h2>
            <p className="mt-1 text-sm text-neutral-500">Les vues 1 an et 3 ans cumulent tous les mois. Les virements internes et éléments exclus de l’analyse sont ignorés.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([[
              "month",
              "Mois",
            ], ["1y", "1 an"], ["3y", "3 ans"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPeriod(id)}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${period === id ? "bg-black text-white" : "border border-black/10 bg-white"}`}
              >
                {label}
              </button>
            ))}
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="min-h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
            >
              <option value="all">Tous les comptes courants</option>
              {accounts
                .filter((a) => a.account_type === "checking")
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
            </select>
          </div>
        </div>
      </section>

      <div className="grid gap-3 px-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-4 lg:px-6">
        <Metric icon={WalletCards} label="Dépenses cumulées" value={euro(context.totalExp)} detail={`${euro(context.realizedExp)} réalisées · ${euro(context.forecastExp)} prévues`} />
        <Metric icon={TrendingUp} label="Revenus cumulés" value={euro(context.totalInc)} detail={`${euro(context.realizedInc)} reçus · ${euro(context.forecastInc)} prévus`} />
        <Metric icon={Scale} label="Solde de la période" value={euro(context.totalInc - context.totalExp)} detail={`Couverture ${pct(coverage)}`} />
        <Metric icon={BarChart3} label="Dépense moyenne / mois" value={euro(context.avg)} detail={`Revenus moyens ${euro(context.avgIncome)}`} />
      </div>

      <div className="px-3 sm:px-5 lg:px-6">
        <details
          open={monthlyOpen}
          onToggle={(e) => setMonthlyOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="rounded-2xl border border-black/10 bg-white shadow-sm"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div>
              <h3 className="font-semibold">Prévision mois par mois</h3>
              <p className="mt-1 text-xs text-neutral-500">Dépenses prévues, crédits, épargne et solde de clôture pour le compte et la période sélectionnés.</p>
            </div>
            <ChevronDown size={18} className={`transition ${monthlyOpen ? "rotate-180" : ""}`} />
          </summary>
          <div className="overflow-x-auto border-t border-black/10">
            <table className="min-w-[930px] w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Mois</th><th className="px-4 py-3">Dépenses prévues</th><th className="px-4 py-3">Crédits prévus</th><th className="px-4 py-3">Utilisation épargne</th><th className="px-4 py-3">Épargne prévue</th><th className="px-4 py-3">Fin de mois projetée</th><th className="px-4 py-3">Essentielles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {context.monthRows.map((r) => (
                  <tr key={r.month}>
                    <td className="px-4 py-3 font-medium capitalize">{monthLabel(r.month)}</td>
                    <td className="px-4 py-3 text-red-700">{euro2(r.expensesPlanned)}</td>
                    <td className="px-4 py-3 text-emerald-700">{euro2(r.creditsPlanned)}</td>
                    <td className="px-4 py-3 text-amber-700">{euro2(r.savingsUsed)}</td>
                    <td className="px-4 py-3 text-violet-700">{euro2(r.savingsDeposited)}</td>
                    <td className="px-4 py-3 font-semibold">{euro2(r.closing)}</td>
                    <td className="px-4 py-3">{pct(r.essentialRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="grid gap-5 px-3 sm:px-5 lg:grid-cols-2 lg:px-6">
        <Panel title="Postes les plus coûteux" subtitle="Clique sur un poste pour voir toutes les opérations qui composent son montant.">
          <div className="space-y-3">
            {context.ranked.slice(0, 10).map((x, i) => (
              <details key={x.key} className="rounded-xl border border-black/10 bg-neutral-50/60">
                <summary className="cursor-pointer list-none p-3">
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span><b>{i + 1}.</b> {x.name}</span>
                    <span className="text-right font-semibold">{euro(x.amount)} <span className="font-normal text-neutral-400">· {context.totalExp ? pct(x.amount / context.totalExp) : "0 %"}</span></span>
                  </div>
                  <div className="mb-1 text-[11px] text-neutral-400">{euro(x.realized)} réalisé · {euro(x.forecast)} prévu</div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-black" style={{ width: `${context.totalExp ? Math.max(2, (x.amount / context.totalExp) * 100) : 0}%` }} /></div>
                </summary>
                <div className="border-t border-black/10 px-3">
                  <OperationRows rows={x.rows} accounts={accounts} editableEssential />
                </div>
              </details>
            ))}
            {!context.ranked.length ? <Empty /> : null}
          </div>
        </Panel>

        <Panel title="Structure des dépenses" subtitle="Une seule règle : cochée = essentielle, non cochée = non essentielle.">
          <div className="space-y-3">
            <EssentialGroup label="Dépenses essentielles" amount={context.essential} total={context.totalExp} rows={context.essentialRows} accounts={accounts} />
            <EssentialGroup label="Dépenses non essentielles" amount={context.nonEssential} total={context.totalExp} rows={context.nonEssentialRows} accounts={accounts} />
            <Info icon={Repeat2} label="Charge récurrente future moyenne" value={`${euro(context.recurringMonthly)} / mois`} />
            <Info icon={ShieldCheck} label="Part essentielle" value={context.totalExp ? pct(context.essential / context.totalExp) : "0 %"} />
            <Info icon={CalendarRange} label="Concentration Top 5" value={context.totalExp ? pct(context.top5 / context.totalExp) : "0 %"} />
          </div>
        </Panel>

        <Panel title="Plus grosses dépenses" subtitle="Mouvements individuels réalisés ou prévus">
          <div className="divide-y divide-black/10">
            {context.biggest.map((m) => (
              <div key={`${m.id}-${m.analysisKind}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div><p className="font-medium">{m.label}</p><p className="text-xs text-neutral-500">{dateLabel(m.movement_date)} · {m.analysisKind === "realized" ? "Réalisé" : "Prévu"}</p></div>
                <b>{euro(Number(m.amount))}</b>
              </div>
            ))}
            {!context.biggest.length ? <Empty /> : null}
          </div>
        </Panel>

        <Panel title="Leviers" subtitle="Repères chiffrés, sans modifier tes données">
          <div className="space-y-3 text-sm">
            {top ? <Insight icon={TrendingDown} title={`${top.name} est ton premier poste`} text={`${euro(top.amount)} sur la période, soit ${context.totalExp ? pct(top.amount / context.totalExp) : "0 %"} de tes dépenses.`} /> : null}
            <Insight icon={Repeat2} title="Baisse de 10 % des dépenses non essentielles" text={`${euro(savingsPotential)} économisés sur la période, soit environ ${euro(savingsPotential / context.months)} par mois.`} />
            <Insight icon={Scale} title="Couverture des dépenses par les revenus" text={`${pct(coverage)} sur l’horizon sélectionné. ${coverage >= 1 ? "Les revenus couvrent les dépenses prévues." : "Les dépenses dépassent les revenus sur cette période."}`} />
            <Insight icon={BarChart3} title="Poids des cinq premiers postes" text={`${context.totalExp ? pct(context.top5 / context.totalExp) : "0 %"} de toutes les dépenses analysées.`} />
          </div>
        </Panel>
      </div>

      <div className="px-3 pb-4 sm:px-5 lg:px-6">
        <details open={uncatOpen} onToggle={(e) => setUncatOpen((e.currentTarget as HTMLDetailsElement).open)} className="rounded-2xl border border-black/10 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div><h3 className="font-semibold">Mouvements sans catégorie</h3><p className="mt-1 text-xs text-neutral-500">{context.uncategorized.length} mouvement(s) sur la période. Le rattachement recalcule automatiquement l’analyse.</p></div>
            <ChevronDown size={18} className={`transition ${uncatOpen ? "rotate-180" : ""}`} />
          </summary>
          <div className="divide-y divide-black/10 border-t border-black/10">
            {context.uncategorized.map((m) => {
              const compatible = categories.filter((c) => !c.parent_id && (!c.movement_type || c.movement_type === m.movement_type));
              return (
                <div key={m.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(180px,1fr)_130px_minmax(240px,1fr)_minmax(260px,1fr)] lg:items-center">
                  <div><p className="font-medium">{m.label}</p><p className="text-xs text-neutral-500">{dateLabel(m.movement_date)} · {accounts.find((a) => a.id === m.account_id)?.name ?? "Compte"}</p></div>
                  <p className={`font-semibold ${m.movement_type === "income" ? "text-emerald-700" : "text-red-700"}`}>{m.movement_type === "income" ? "+" : "−"}{euro2(Number(m.amount))}</p>
                  <form action={assignMovementCategory} className="flex gap-2">
                    <input type="hidden" name="movement_id" value={m.id} />
                    <select name="category_id" required className="min-h-10 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 text-sm">
                      <option value="">Choisir une catégorie</option>
                      {compatible.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button className="rounded-xl bg-black px-3 text-sm font-medium text-white">Affecter</button>
                  </form>
                  <form action={createCategoryAndAssignMovement} className="flex gap-2">
                    <input type="hidden" name="movement_id" value={m.id} />
                    <input name="category_name" required placeholder="Nouvelle catégorie" className="min-h-10 min-w-0 flex-1 rounded-xl border border-black/10 px-3 text-sm" />
                    <button className="inline-flex items-center gap-1 rounded-xl border border-black/15 bg-white px-3 text-sm font-medium"><FolderPlus size={15} />Créer</button>
                  </form>
                </div>
              );
            })}
            {!context.uncategorized.length ? <div className="p-5"><Empty text="Tous les mouvements de la période sont catégorisés." /></div> : null}
          </div>
        </details>
      </div>
    </div>
  );
}

function OperationRows({ rows, accounts, editableEssential = false }: { rows: AnalysisRow[]; accounts: Account[]; editableEssential?: boolean }) {
  if (!rows.length) return <div className="py-4"><Empty /></div>;
  return (
    <div className="divide-y divide-black/10">
      {rows.slice().sort((a, b) => a.movement_date.localeCompare(b.movement_date)).map((m) => (
        <div key={`${m.id}-${m.analysisKind}-${m.movement_date}`} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{m.label}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.analysisKind === "realized" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{m.analysisKind === "realized" ? "Réalisé" : "Prévu"}</span>
              {m.essential ? <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-white">Essentielle</span> : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">Non essentielle</span>}
            </div>
            <p className="mt-1 text-xs text-neutral-500">{dateLabel(m.movement_date)} · {accounts.find((a) => a.id === m.account_id)?.name ?? "Compte"} · {sourceLabel(m)}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
            <b className="text-sm">{euro2(Number(m.amount))}</b>
            {editableEssential && m.analysisKind === "realized" ? (
              <form action={updateMovementAnalysisEssential}>
                <input type="hidden" name="movement_id" value={m.id} />
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs">
                  <input name="is_essential" type="checkbox" defaultChecked={m.essential} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
                  Essentielle
                </label>
              </form>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function EssentialGroup({ label, amount, total, rows, accounts }: { label: string; amount: number; total: number; rows: AnalysisRow[]; accounts: Account[] }) {
  return (
    <details className="rounded-xl border border-black/10 bg-neutral-50/60">
      <summary className="cursor-pointer list-none p-3">
        <div className="flex justify-between gap-3 text-sm"><span>{label}</span><b>{euro(amount)} · {total ? pct(amount / total) : "0 %"}</b></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-black" style={{ width: `${total ? (amount / total) * 100 : 0}%` }} /></div>
        <p className="mt-2 text-[11px] text-neutral-400">Cliquer pour détailler et reclasser les mouvements réalisés.</p>
      </summary>
      <div className="border-t border-black/10 px-3"><OperationRows rows={rows} accounts={accounts} editableEssential /></div>
    </details>
  );
}

function sourceLabel(m: AnalysisRow) {
  if (m.source === "budget") return "Budget restant";
  if (m.source === "photo" || m.source_type === "photo") return "PHOTO / mariage";
  if (m.source === "children" || m.source_type === "children") return "ENFANTS";
  if (m.recurrence_id) return "Mouvement régulier";
  return m.analysisKind === "realized" ? "Mouvement réel" : "Mouvement prévu";
}
function Metric({ icon: Icon, label, value, detail }: { icon: any; label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-neutral-500"><Icon size={16} /><span className="text-xs font-medium">{label}</span></div><p className="mt-3 text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-neutral-400">{detail}</p></div>; }
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: any }) { return <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm"><h3 className="font-semibold">{title}</h3><p className="mb-5 mt-1 text-xs text-neutral-500">{subtitle}</p>{children}</section>; }
function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) { return <div className="flex items-center justify-between gap-3 border-t border-black/10 pt-3 text-sm"><span className="flex items-center gap-2 text-neutral-500"><Icon size={15} />{label}</span><b>{value}</b></div>; }
function Insight({ icon: Icon, title, text }: { icon: any; title: string; text: string }) { return <div className="rounded-xl bg-neutral-50 p-4"><div className="flex items-center gap-2 font-medium"><Icon size={16} />{title}</div><p className="mt-1.5 leading-5 text-neutral-600">{text}</p></div>; }
function Empty({ text = "Pas encore assez de données sur cette période." }: { text?: string }) { return <p className="text-sm text-neutral-500">{text}</p>; }
