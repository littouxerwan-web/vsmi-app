import type { BudgetStatement } from "@/lib/perso/budget-engine";
const money = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
/** Presentation only: values are the engine's global monthly statement, never account-filtered. */
export function BudgetStatements({ rows }: { rows: BudgetStatement[] }) {
  if (!rows.length) return null;
  return <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(row =>
    <div key={`${row.id}:${row.month}`} className="perso-budget-card rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="font-semibold">{row.name} · {money(row.initial)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
        <dt>{row.movement_type === "income" ? "Encaissé" : "Réalisé"}</dt><dd className="text-right">{money(row.realized)}</dd>
        <dt>Engagé</dt><dd className="text-right">{money(row.committed)}</dd>
        <dt>Reliquat non engagé</dt><dd className="text-right">{money(row.uncommitted)}</dd>
        <dt>À projeter au total</dt><dd className="text-right font-semibold">{money(row.futureTotal)}</dd>
        {row.overrun > 0 ? <><dt>Dépassement</dt><dd className="text-right text-red-700">{money(row.overrun)}</dd></> : null}
      </dl><p className="mt-2 text-xs text-neutral-500">Enveloppe commune à tous les comptes PERSO.</p>
    </div>)}</div>;
}
