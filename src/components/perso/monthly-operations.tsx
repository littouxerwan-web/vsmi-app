"use client";

import { ChevronDown, CircleCheck, Clock3 } from "lucide-react";

type Account = { id: string; name: string };
type Category = { id: string; name: string; parent_id: string | null };
type Movement = { id: string; account_id: string; category_id: string | null; movement_type: string; label: string; amount: number; movement_date: string; status: string };
type Recurrence = { id: string; account_id: string; destination_account_id: string | null; category_id: string | null; movement_type: "income" | "expense" | "transfer"; label: string; amount: number; frequency: "weekly" | "monthly" | "quarterly" | "yearly"; interval_count: number; start_date: string; end_date: string | null; annual_change_percent: number };
type Operation = { id: string; accountId: string; categoryId: string | null; type: string; label: string; amount: number; date: string; status: "planned" | "completed"; projected: boolean };

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function parse(value: string) { return new Date(`${value}T12:00:00`); }
function money(value: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value); }
function add(date: Date, frequency: Recurrence["frequency"], count: number) {
  const result = new Date(date);
  if (frequency === "weekly") result.setDate(result.getDate() + 7 * count);
  else if (frequency === "monthly") result.setMonth(result.getMonth() + count);
  else if (frequency === "quarterly") result.setMonth(result.getMonth() + 3 * count);
  else result.setFullYear(result.getFullYear() + count);
  return result;
}
function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function monthTitle(key: string) { return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${key}-01T12:00:00`)); }
function dateLabel(value: string) { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(parse(value)); }

export function MonthlyOperations({ accounts, categories, movements, recurrences }: { accounts: Account[]; categories: Category[]; movements: Movement[]; recurrences: Recurrence[] }) {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const months = Array.from({ length: 7 }, (_, index) => { const d = new Date(now.getFullYear(), now.getMonth() + index, 1, 12); return monthKey(d); });
  const end = new Date(now.getFullYear(), now.getMonth() + 7, 0, 12);
  const operations: Operation[] = movements
    .filter(m => m.status !== "cancelled" && m.movement_date >= `${months[0]}-01` && parse(m.movement_date) <= end)
    .map(m => ({ id: m.id, accountId: m.account_id, categoryId: m.category_id, type: m.movement_type, label: m.label, amount: Number(m.amount), date: m.movement_date, status: m.status === "completed" ? "completed" : "planned", projected: false }));

  for (const recurrence of recurrences) {
    let occurrence = parse(recurrence.start_date); let guard = 0;
    while (occurrence <= end && guard++ < 500) {
      if (occurrence >= new Date(`${months[0]}-01T12:00:00`) && (!recurrence.end_date || iso(occurrence) <= recurrence.end_date)) {
        const years = Math.max(0, occurrence.getFullYear() - parse(recurrence.start_date).getFullYear());
        const amount = Number(recurrence.amount) * Math.pow(1 + Number(recurrence.annual_change_percent || 0) / 100, years);
        operations.push({ id: `rec-${recurrence.id}-${iso(occurrence)}`, accountId: recurrence.account_id, categoryId: recurrence.category_id, type: recurrence.movement_type, label: recurrence.label, amount, date: iso(occurrence), status: "planned", projected: true });
      }
      occurrence = add(occurrence, recurrence.frequency, recurrence.interval_count);
    }
  }

  return <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
    <div><h2 className="text-xl font-semibold">Opérations mois par mois</h2><p className="mt-1 text-sm text-neutral-500">Le mois en cours est ouvert. Les six mois suivants sont consultables dans les menus déroulants.</p></div>
    <div className="mt-6 space-y-3">{months.map((month, index) => {
      const list = operations.filter(o => o.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
      const income = list.filter(o => ["income", "transfer_in"].includes(o.type)).reduce((s, o) => s + o.amount, 0);
      const expense = list.filter(o => ["expense", "transfer_out", "transfer"].includes(o.type)).reduce((s, o) => s + o.amount, 0);
      return <details key={month} open={index === 0} className="group rounded-2xl border border-black/10 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
          <div><p className="font-semibold capitalize">{monthTitle(month)}</p><p className="mt-1 text-xs text-neutral-500">{list.length} opération{list.length > 1 ? "s" : ""} · Recettes {money(income)} · Dépenses {money(expense)}</p></div>
          <ChevronDown size={18} className="shrink-0 transition group-open:rotate-180"/>
        </summary>
        <div className="border-t border-black/10 p-4">
          {list.length === 0 ? <p className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-500">Aucune opération sur ce mois.</p> : <div className="space-y-2">{list.map(operation => {
            const positive = ["income", "transfer_in"].includes(operation.type);
            const account = accounts.find(a => a.id === operation.accountId)?.name ?? "Compte";
            const category = categories.find(c => c.id === operation.categoryId)?.name;
            return <div key={operation.id} className="flex items-center justify-between gap-4 rounded-xl border border-black/10 px-4 py-3">
              <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-medium">{operation.label}</span>{operation.projected ? <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">Récurrent</span> : operation.status === "completed" ? <CircleCheck size={15} className="text-emerald-600"/> : <Clock3 size={15} className="text-amber-600"/>}</div><p className="mt-1 truncate text-xs text-neutral-500">{dateLabel(operation.date)} · {account}{category ? ` · ${category}` : ""} · {operation.status === "completed" ? "Réalisé" : "Prévu"}</p></div>
              <span className={`shrink-0 font-semibold ${positive ? "text-emerald-700" : "text-red-700"}`}>{positive ? "+" : "−"}{money(operation.amount)}</span>
            </div>;
          })}</div>}
        </div>
      </details>;
    })}</div>
  </section>;
}
