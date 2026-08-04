"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import {
  calculateSavingsPlan,
  type SavingsCategory,
  type SavingsExclusion,
  type SavingsMovement,
  type SavingsOverride,
  type SavingsPhotoPayment,
  type SavingsRecurrence,
  type SavingsUrssafState,
  type SavingsProposalDecision,
} from "@/lib/perso/savings-engine";

type Account = { id: string; name: string; account_type: "checking" | "savings" };
type Profile = {
  id: "profile-1" | "profile-2";
  label: string;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  threshold: number;
  primaryIncomeCategoryId?: string | null;
  primaryIncomeSource?: "category" | "weddings";
  proposalTiming?: "same_day" | "next_day";
};

type CalculatedProfile = Profile & { initialChecking: number; initialSavings: number };

type SavingsResult = {
  profile: CalculatedProfile;
  source: Account;
  destination: Account;
  rows: ReturnType<typeof calculateSavingsPlan>;
};

type Props = {
  accounts: Account[];
  categories: SavingsCategory[];
  movements: SavingsMovement[];
  recurrences: SavingsRecurrence[];
  overrides?: SavingsOverride[];
  exclusions?: SavingsExclusion[];
  photoPayments: SavingsPhotoPayment[];
  photoDefaultAccountId?: string | null;
  urssafStates?: SavingsUrssafState[];
  urssafDefaultAccountId?: string | null;
  movementDefaultAccountId?: string | null;
  profiles: Profile[];
  currentBalances: Record<string, number>;
  savingsProposals?: SavingsProposalDecision[];
  startMonth: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
const monthLabel = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(
    new Date(`${value}-01T12:00:00`),
  );
const shift = (month: string, delta: number) => {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return date.toISOString().slice(0, 7);
};

export function SavingsAnalysis(props: Props) {
  const configuredProfiles = props.profiles.filter(
    (profile) => profile.sourceAccountId && profile.destinationAccountId,
  );
  const [view, setView] = useState<string>("general");

  const results = useMemo(
    () =>
      configuredProfiles.map((profile) => {
        const source = props.accounts.find((account) => account.id === profile.sourceAccountId)!;
        const destination = props.accounts.find(
          (account) => account.id === profile.destinationAccountId,
        )!;
        const initialChecking = Number(props.currentBalances[source.id] ?? 0);
        const initialSavings = Number(props.currentBalances[destination.id] ?? 0);
        const rows = calculateSavingsPlan({
          sourceAccountId: source.id,
          destinationAccountId: destination.id,
          accounts: props.accounts,
          initialChecking,
          initialSavings,
          startMonth: props.startMonth,
          categories: props.categories,
          movements: props.movements,
          recurrences: props.recurrences,
          overrides: props.overrides,
          exclusions: props.exclusions,
          photoPayments: props.photoPayments,
          photoDefaultAccountId: props.photoDefaultAccountId,
          urssafStates: props.urssafStates,
          urssafDefaultAccountId: props.urssafDefaultAccountId,
          movementDefaultAccountId: props.movementDefaultAccountId,
          savingsProposals: props.savingsProposals,
          minReserve: profile.threshold,
          primaryIncomeCategoryId: profile.primaryIncomeCategoryId ?? null,
          primaryIncomeSource: profile.primaryIncomeSource ?? "category",
          proposalTiming: profile.proposalTiming ?? "same_day",
          months: 60,
        });
        return {
          profile: { ...profile, initialChecking, initialSavings },
          source,
          destination,
          rows,
        };
      }),
    [configuredProfiles, props],
  );

  if (!results.length) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-xl font-semibold">Analyse du potentiel d’épargne</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Configure au moins un profil d’épargne dans Paramètres.
        </p>
      </section>
    );
  }

  const selected = results.find((result) => result.profile.id === view);
  const uniqueDestinationInitialSavings = new Map<string, number>();
  for (const result of results) {
    if (!uniqueDestinationInitialSavings.has(result.destination.id)) {
      uniqueDestinationInitialSavings.set(result.destination.id, result.profile.initialSavings);
    }
  }
  const generalInitialSavings = [...uniqueDestinationInitialSavings.values()].reduce(
    (sum, value) => sum + value,
    0,
  );
  let cumulativeProposals = 0;
  const generalRows = results[0].rows.map((row, index) => {
    const proposal = results.reduce(
      (sum, result) => sum + (result.rows[index]?.proposal ?? 0),
      0,
    );
    cumulativeProposals += proposal;
    return { month: row.month, savings: generalInitialSavings + cumulativeProposals, proposal };
  });
  const displayedRows = selected?.rows ?? generalRows;
  const currentSavings = selected ? selected.profile.initialSavings : generalInitialSavings;
  const max = Math.max(1, ...displayedRows.map((row) => row.savings));
  const points = displayedRows
    .map(
      (row, index) =>
        `${(index / Math.max(1, displayedRows.length - 1)) * 100},${92 - (row.savings / max) * 82}`,
    )
    .join(" ");

  return (
    <div className="space-y-7">
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 className="text-xl font-semibold">Analyse du potentiel d’épargne</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Vue générale cumulée ou analyse indépendante de chacun des deux comptes.
              </p>
            </div>
          </div>
          <select
            value={view}
            onChange={(event) => setView(event.target.value)}
            className="rounded-xl border bg-white px-3 py-2 text-sm"
          >
            <option value="general">Vue générale</option>
            {results.map(({ profile, source }) => (
              <option key={profile.id} value={profile.id}>
                {profile.label} · {source.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-6">
        <h3 className="text-lg font-semibold">Évolution projetée sur 5 ans</h3>
        <div className="mt-4 overflow-hidden rounded-2xl bg-neutral-50 p-3">
          <svg viewBox="0 0 100 100" className="h-56 w-full" preserveAspectRatio="none">
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Épargne actuelle" value={money(Number(currentSavings ?? 0))} />
          <Metric
            label="Épargne dans 12 mois"
            value={money(Number(displayedRows[11]?.savings ?? currentSavings ?? 0))}
          />
          <Metric
            label="Épargne dans 5 ans"
            value={money(Number(displayedRows.at(-1)?.savings ?? currentSavings ?? 0))}
            dark
          />
        </div>
      </section>

      {selected ? (
        <ProposalList result={selected} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {results.map((result) => (
            <ProposalList key={result.profile.id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalList({ result }: { result: SavingsResult }) {
  const [diagnosticMonth, setDiagnosticMonth] = useState(result.rows[0]?.month ?? "");
  const diagnosticRow =
    result.rows.find((row) => row.month === diagnosticMonth) ?? result.rows[0];
  const proposedRows = result.rows.filter((row) => row.proposal > 0).slice(0, 24);

  return (
    <section className="rounded-3xl border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{result.profile.label} · Virements proposés</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Seuil conservé : {money(result.profile.threshold)} sur {result.source.name}
          </p>
        </div>
        <select
          value={diagnosticMonth}
          onChange={(event) => setDiagnosticMonth(event.target.value)}
          className="rounded-xl border bg-white px-3 py-2 text-sm"
        >
          {result.rows.map((row) => (
            <option key={row.month} value={row.month}>
              {monthLabel(row.month)}
            </option>
          ))}
        </select>
      </div>

      {diagnosticRow ? (
        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-sky-950">
                Détail du calcul · {monthLabel(diagnosticRow.month)}
              </p>
              <p className="mt-1 text-xs text-sky-800">
                Le mois suivant repart du solde conservé après la proposition de ce mois.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                diagnosticRow.proposal > 0
                  ? "bg-violet-100 text-violet-900"
                  : "bg-white text-neutral-600"
              }`}
            >
              Proposition : {money(diagnosticRow.proposal)}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DiagnosticMetric label="Solde de départ" value={diagnosticRow.openingChecking} />
            <DiagnosticMetric label="Crédits du mois" value={diagnosticRow.income} positive />
            <DiagnosticMetric
              label="Débits du mois"
              value={diagnosticRow.debitExcludingBudgetRemaining}
              negative
            />
            <DiagnosticMetric
              label="Budgets restant à consommer"
              value={diagnosticRow.budgetRemaining}
              negative
            />
            <DiagnosticMetric
              label="Solde avant épargne"
              value={diagnosticRow.balanceBeforeSavings}
            />
            <DiagnosticMetric label="Seuil conservé" value={diagnosticRow.requiredReserve} />
            <DiagnosticMetric
              label="Versement proposé"
              value={diagnosticRow.proposal}
              positive={diagnosticRow.proposal > 0}
            />
            <DiagnosticMetric label="Solde après proposition" value={diagnosticRow.checking} />
          </div>

          {diagnosticRow.proposal <= 0 ? (
            <p className="mt-4 rounded-xl bg-white p-3 text-sm text-neutral-700">
              Aucune proposition : le solde avant épargne ({money(diagnosticRow.balanceBeforeSavings)})
              ne dépasse pas le seuil configuré ({money(diagnosticRow.requiredReserve)}).
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {proposedRows.length ? (
          proposedRows.map((row) => (
            <div
              key={row.month}
              className="rounded-2xl border border-violet-200 bg-violet-50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-violet-950">Versement épargne proposé</p>
                  <p className="mt-1 text-xs text-violet-800">
                    1er {monthLabel(shift(row.month, 1))} · {result.source.name}{" "}
                    <ArrowRight className="inline" size={13} /> {result.destination.name}
                  </p>
                  <p className="mt-1 text-xs text-violet-700">
                    Solde avant épargne : {money(row.balanceBeforeSavings)} · Seuil :{" "}
                    {money(row.requiredReserve)}
                  </p>
                </div>
                <p className="text-lg font-semibold text-violet-900">{money(row.proposal)}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-neutral-500">
            Aucun versement proposé sur la période avec les flux actuellement enregistrés.
          </p>
        )}
      </div>
    </section>
  );
}

function DiagnosticMetric({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
}) {
  const displayedValue = negative ? -Math.abs(value) : value;
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-1 font-semibold ${
          positive ? "text-emerald-700" : negative ? "text-red-700" : "text-neutral-950"
        }`}
      >
        {money(displayedValue)}
      </p>
    </div>
  );
}

function Metric({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${dark ? "bg-black text-white" : "bg-neutral-100"}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
