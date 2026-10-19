import { saveMonthlyBudgetAmount } from "@/app/(app)/perso/actions";
import type { BudgetStatement } from "@/lib/perso/budget-engine";
const money = (value: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
/** Presentation only: values are the engine's global monthly statement, never account-filtered. */
export function BudgetStatements({ rows, editable = false }: { rows: BudgetStatement[]; editable?: boolean }) {
  if (!rows.length) return null;
  return <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(row =>
    <div key={`${row.id}:${row.month}`} className="perso-budget-card rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="premium-budget-heading"><p className="font-semibold">{row.name}</p><span>{money(row.initial)}</span></div>
      <div className="premium-budget-balance"><strong>{money(row.uncommitted)}</strong><span>non engagé</span></div>
      <div className={`premium-budget-track ${row.overrun>0?"is-overrun":""}`} role="img" aria-label={`Réalisé ${money(row.realized)}, engagé ${money(row.committed)}, non engagé ${money(row.uncommitted)}`}><span style={{width:`${100*row.realized/Math.max(row.initial,row.realized+row.committed,1)}%`}}/><span style={{width:`${100*row.committed/Math.max(row.initial,row.realized+row.committed,1)}%`}}/></div>
      <p className="mt-1 text-xs text-neutral-700">Compte rattaché : <strong>{row.account_name ?? (row.account_id ? "Compte indisponible" : "Aucun compte configuré")}</strong></p>
      {row.has_override ? <p className="mt-1 text-xs font-medium text-amber-800">Montant ajusté pour ce mois · habituellement {money(row.base_amount)}</p> : null}
      <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
        <dt>{row.movement_type === "income" ? "Encaissé" : "Réalisé"}</dt><dd className="text-right">{money(row.realized)}</dd>
        <dt>Engagé</dt><dd className="text-right">{money(row.committed)}</dd>
        <dt>Reliquat non engagé</dt><dd className="text-right">{money(row.uncommitted)}</dd>
        <dt>À projeter au total</dt><dd className="text-right font-semibold">{money(row.futureTotal)}</dd>
        {row.overrun > 0 ? <><dt>Dépassement</dt><dd className="text-right text-red-700">{money(row.overrun)}</dd></> : null}
      </dl><p className="mt-2 text-xs text-neutral-500">Enveloppe commune à tous les comptes PERSO.</p>
      {editable ? <details key={`${row.month}:${row.initial}:${row.has_override}`} className="mt-3 border-t border-amber-200 pt-3">
        <summary className="cursor-pointer text-sm font-medium">Modifier le montant de ce mois</summary>
        <form action={saveMonthlyBudgetAmount} className="mt-3 space-y-2">
          <input type="hidden" name="category_id" value={row.id}/>
          <input type="hidden" name="budget_month" value={row.month}/>
          <label className="block text-xs">Enveloppe de {new Intl.DateTimeFormat("fr-FR", {month:"long",year:"numeric",timeZone:"Europe/Paris"}).format(new Date(`${row.month}-01T12:00:00Z`))}
            <input name="amount" type="number" min="0" step="0.01" required defaultValue={row.initial} className="mt-1 min-h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-sm"/>
          </label>
          <p className="text-xs text-neutral-600">Les autres mois conservent leur montant. Les opérations déjà réalisées ou prévues restent inchangées.</p>
          <button className="min-h-10 rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white">Enregistrer pour ce mois</button>
        </form>
        {row.has_override ? <form action={saveMonthlyBudgetAmount} className="mt-2">
          <input type="hidden" name="category_id" value={row.id}/>
          <input type="hidden" name="budget_month" value={row.month}/>
          <input type="hidden" name="operation" value="reset"/>
          <button className="min-h-10 text-xs font-medium underline">Revenir au montant habituel ({money(row.base_amount)})</button>
        </form> : null}
      </details> : null}
    </div>)}</div>;
}
