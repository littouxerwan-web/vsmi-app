"use client";

import { useMemo, useState } from "react";

type Account = { id: string; name: string; account_type: "checking" | "savings" };
type Snapshot = { account_id: string; balance: number; snapshot_date: string };
type Movement = { account_id: string; movement_type: string; amount: number; movement_date: string; status: string };
type Recurrence = { account_id: string; destination_account_id: string | null; movement_type: "income" | "expense" | "transfer"; amount: number; frequency: "weekly" | "monthly" | "quarterly" | "yearly"; interval_count: number; start_date: string; end_date: string | null; annual_change_percent: number };
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function parse(v: string) { return new Date(`${v}T12:00:00`); }
function money(v: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v); }
function add(date: Date, frequency: Recurrence["frequency"], count: number) { const d = new Date(date); if (frequency === "weekly") d.setDate(d.getDate() + 7 * count); else if (frequency === "monthly") d.setMonth(d.getMonth() + count); else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3 * count); else d.setFullYear(d.getFullYear() + count); return d; }

export function ProjectionView({ accounts, snapshots, movements, recurrences }: { accounts: Account[]; snapshots: Snapshot[]; movements: Movement[]; recurrences: Recurrence[] }) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const [years, setYears] = useState(3);
  const [cursor, setCursor] = useState(0);
  const [accountId, setAccountId] = useState("all");
  const points = useMemo(() => {
    const horizon = new Date(today); horizon.setFullYear(horizon.getFullYear() + years);
    const balances = new Map<string, number>();
    const referenceDates = new Map<string, string>();
    for (const account of accounts) {
      const reference = snapshots.filter(s => s.account_id === account.id && s.snapshot_date <= iso(today)).sort((a,b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
      balances.set(account.id, Number(reference?.balance ?? 0)); referenceDates.set(account.id, reference?.snapshot_date ?? iso(today));
      movements.filter(m => m.account_id === account.id && m.status !== "cancelled" && m.movement_date > (reference?.snapshot_date ?? iso(today)) && m.movement_date <= iso(today)).forEach(m => balances.set(account.id, (balances.get(account.id) ?? 0) + (["income","transfer_in"].includes(m.movement_type) ? Number(m.amount) : -Number(m.amount))));
    }
    const result: { date: string; balances: Record<string, number>; checking: number; savings: number; total: number }[] = [];
    let current = new Date(today); current.setHours(12,0,0,0);
    while (current <= horizon) {
      const date = iso(current);
      movements.filter(m => m.status !== "cancelled" && m.movement_date === date && m.movement_date > iso(today) && m.movement_date > (referenceDates.get(m.account_id) ?? iso(today))).forEach(m => balances.set(m.account_id, (balances.get(m.account_id) ?? 0) + (["income","transfer_in"].includes(m.movement_type) ? Number(m.amount) : -Number(m.amount))));
      for (const r of recurrences) {
        let occurrence = parse(r.start_date); let guard = 0;
        while (occurrence < current && guard++ < 2000) occurrence = add(occurrence, r.frequency, r.interval_count);
        if (date > iso(today) && iso(occurrence) === date && (!r.end_date || date <= r.end_date)) {
          const elapsedYears = Math.max(0, occurrence.getFullYear() - parse(r.start_date).getFullYear());
          const value = Number(r.amount) * Math.pow(1 + Number(r.annual_change_percent || 0) / 100, elapsedYears);
          if (r.movement_type === "income") balances.set(r.account_id, (balances.get(r.account_id) ?? 0) + value);
          else if (r.movement_type === "expense") balances.set(r.account_id, (balances.get(r.account_id) ?? 0) - value);
          else if (r.destination_account_id) { balances.set(r.account_id, (balances.get(r.account_id) ?? 0) - value); balances.set(r.destination_account_id, (balances.get(r.destination_account_id) ?? 0) + value); }
        }
      }
      const copy = Object.fromEntries(balances);
      const checking = accounts.filter(a => a.account_type === "checking").reduce((s,a) => s + (balances.get(a.id) ?? 0), 0);
      const savings = accounts.filter(a => a.account_type === "savings").reduce((s,a) => s + (balances.get(a.id) ?? 0), 0);
      result.push({ date, balances: copy, checking, savings, total: checking + savings });
      current = new Date(current); current.setDate(current.getDate() + 1);
    }
    return result;
  }, [accounts, snapshots, movements, recurrences, years]);
  const safeCursor = Math.min(cursor, Math.max(0, points.length - 1));
  const selected = points[safeCursor] ?? { date: iso(today), balances: {}, checking: 0, savings: 0, total: 0 };
  const selectedValue = accountId === "all" ? selected.checking : Number(selected.balances[accountId] ?? 0);
  const firstNegative = points.find(point => accountId === "all" ? point.checking < 0 : Number(point.balances[accountId] ?? 0) < 0);
  const chart = points.filter((_, i) => i % 7 === 0 || i === safeCursor || i === points.length - 1);
  const max = Math.max(1, ...chart.map(p => Math.abs(accountId === "all" ? p.total : Number(p.balances[accountId] ?? 0))));
  return <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><h2 className="text-xl font-semibold">Projection détaillée</h2><p className="mt-1 text-sm text-neutral-500">Consultation par compte et par date, jusqu’à cinq ans.</p></div><div className="flex flex-wrap gap-2">{[1,3,5].map(y => <button key={y} type="button" onClick={() => { setYears(y); setCursor(0); }} className={`rounded-xl px-4 py-2 text-sm font-medium ${years === y ? "bg-black text-white" : "bg-neutral-100"}`}>{y} an{y > 1 ? "s" : ""}</button>)}</div></div>
    <div className="mt-6 grid gap-4 md:grid-cols-2"><label><span className="text-sm font-medium">Compte analysé</span><select value={accountId} onChange={e => setAccountId(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-black/10 bg-white px-3"><option value="all">Tous les comptes courants</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label><span className="text-sm font-medium">Date consultée</span><input type="date" min={points[0]?.date} max={points.at(-1)?.date} value={selected.date} onChange={e => { const index = points.findIndex(p => p.date >= e.target.value); setCursor(index < 0 ? points.length - 1 : index); }} className="mt-2 min-h-12 w-full rounded-xl border border-black/10 px-3"/></label></div>
    {firstNegative ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">Alerte : le solde devient négatif le <strong>{new Intl.DateTimeFormat("fr-FR").format(parse(firstNegative.date))}</strong>.</div> : <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">Aucun découvert projeté sur l’horizon sélectionné.</div>}
    <div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label={`Solde au ${new Intl.DateTimeFormat("fr-FR").format(parse(selected.date))}`} value={money(selectedValue)} danger={selectedValue < 0}/><Metric label="Épargne projetée" value={money(selected.savings)}/><Metric label="Patrimoine liquide" value={money(selected.total)} dark/></div>
    <label className="mt-7 block"><span className="text-sm font-medium">Faire défiler jour par jour</span><input type="range" min="0" max={Math.max(0, points.length - 1)} value={safeCursor} onChange={e => setCursor(Number(e.target.value))} className="mt-3 w-full accent-black"/></label>
    <div className="mt-7 flex h-44 items-end gap-px overflow-hidden rounded-2xl bg-neutral-50 p-4">{chart.map(p => { const value = accountId === "all" ? p.total : Number(p.balances[accountId] ?? 0); return <button key={p.date} type="button" title={`${p.date}: ${money(value)}`} onClick={() => setCursor(points.findIndex(point => point.date === p.date))} className={`min-w-px flex-1 rounded-t ${p.date === selected.date ? "bg-black" : value < 0 ? "bg-red-400" : "bg-neutral-300"}`} style={{ height: `${Math.max(3, Math.abs(value) / max * 100)}%` }}/>; })}</div>
  </section>;
}
function Metric({ label, value, danger, dark }: { label: string; value: string; danger?: boolean; dark?: boolean }) { return <div className={`rounded-2xl p-4 ${dark ? "bg-black text-white" : danger ? "bg-red-50 text-red-800" : "bg-neutral-100"}`}><p className="text-xs opacity-70">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>; }
