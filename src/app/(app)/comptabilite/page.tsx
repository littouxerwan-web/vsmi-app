import Link from "next/link";
import { CheckCircle2, CircleDollarSign, Clock3, Plus, Trash2, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createManualPayment, deletePayment, markBalanceReceived } from "./actions";

export const dynamic = "force-dynamic";

type Payment = {
  id: string;
  wedding_id: string | null;
  display_name: string;
  wedding_date: string | null;
  payment_type: "deposit" | "balance";
  amount: number;
  expected_date: string | null;
  received_date: string | null;
  status: "expected" | "received" | "cancelled";
  source: "automatic" | "manual";
};
type WeddingCount = { id: string; wedding_date: string; archived_at: string | null };

function money(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
function dateLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR").format(new Date(`${value}T12:00:00`)) : "Date à définir";
}
function monthLabel(key: string) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${key}-01T12:00:00`));
}
function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function weddingKey(payment: Payment) {
  return payment.wedding_id ? `w:${payment.wedding_id}` : `m:${normalizeName(payment.display_name)}:${payment.wedding_date ?? "sans-date"}`;
}

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ creation?: string; encaissement?: string; suppression?: string; erreur?: string }>;
}) {
  const messages = await searchParams;
  const supabase = await createClient();
  const [{ data: paymentsData, error }, { data: weddingsData }] = await Promise.all([
    supabase.from("wedding_payments").select("id, wedding_id, display_name, wedding_date, payment_type, amount, expected_date, received_date, status, source").neq("status", "cancelled").order("expected_date"),
    supabase.from("weddings").select("id, wedding_date, archived_at"),
  ]);

  if (error) console.error("Erreur comptabilité :", error);

  const payments = (paymentsData ?? []) as Payment[];
  const weddings = (weddingsData ?? []) as WeddingCount[];
  const now = new Date();
  const currentYear = now.getFullYear();
  const today = now.toISOString().slice(0, 10);
  const received = payments.filter((p) => p.status === "received");
  const expected = payments.filter((p) => p.status === "expected");

  const receivedCurrentYear = received.filter((p) => p.received_date?.startsWith(String(currentYear))).reduce((s, p) => s + Number(p.amount), 0);
  const expectedCurrentYear = expected.filter((p) => p.expected_date?.startsWith(String(currentYear))).reduce((s, p) => s + Number(p.amount), 0);

  const automaticDone = weddings
    .filter((w) => w.wedding_date.startsWith(String(currentYear)) && (w.wedding_date < today || Boolean(w.archived_at)))
    .map((w) => `w:${w.id}`);
  const manualDone = received
    .filter((p) => p.source === "manual" && p.payment_type === "balance" && p.received_date?.startsWith(String(currentYear)))
    .map(weddingKey);
  const weddingsDone = new Set([...automaticDone, ...manualDone]).size;
  const weddingsRemaining = weddings.filter((w) => w.wedding_date.startsWith(String(currentYear)) && w.wedding_date >= today && !w.archived_at).length;

  const years = Array.from(new Set([
    ...payments.flatMap((p) => [p.received_date?.slice(0, 4), p.expected_date?.slice(0, 4), p.wedding_date?.slice(0, 4)]).filter((v): v is string => Boolean(v)),
    ...weddings.map((w) => w.wedding_date.slice(0, 4)),
    String(currentYear),
    String(currentYear + 1),
  ])).sort((a, b) => b.localeCompare(a));

  const yearData = years.map((year) => {
    const yearPayments = payments.filter((p) => (p.received_date ?? p.expected_date ?? p.wedding_date)?.startsWith(year));
    const yearReceived = yearPayments.filter((p) => p.status === "received").reduce((s, p) => s + Number(p.amount), 0);
    const yearExpected = yearPayments.filter((p) => p.status === "expected").reduce((s, p) => s + Number(p.amount), 0);
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`).map((key) => {
      const lines = yearPayments.filter((p) => (p.status === "received" ? p.received_date : p.expected_date)?.startsWith(key));
      return { key, lines, total: lines.reduce((s, p) => s + Number(p.amount), 0) };
    });
    return { year, yearReceived, yearExpected, total: yearReceived + yearExpected, weddings: new Set(yearPayments.map(weddingKey)).size, months };
  });

  return (
    <main className="mariages-ledger-theme px-4 py-5 sm:px-5 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-neutral-500">Pilotage financier</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Comptabilité</h1>
          <p className="mt-2 text-neutral-600">Encaissements, prévisionnel et historique des mariages.</p>
        </div>

        <Messages {...messages} />
        {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">Les données comptables n’ont pas pu être chargées.</div> : null}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric icon={CheckCircle2} label={`Encaissé ${currentYear}`} value={money(receivedCurrentYear)} />
          <Metric icon={Clock3} label={`À venir ${currentYear}`} value={money(expectedCurrentYear)} highlight />
          <Metric icon={WalletCards} label={`Total ${currentYear}`} value={money(receivedCurrentYear + expectedCurrentYear)} dark />
          <Metric icon={CircleDollarSign} label="Mariages effectués" value={String(weddingsDone)} />
          <Metric icon={CircleDollarSign} label="Mariages restants" value={String(weddingsRemaining)} />
        </section>

        <section className="mt-7 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Ajouter un mariage passé</h2>
          <p className="mt-1 text-sm text-neutral-500">Utilise exactement le même nom et la même date pour l’acompte et le solde : l’historique ne comptera qu’un seul mariage.</p>
          <form action={createManualPayment} className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Nom" name="display_name" required />
            <Field label="Date du mariage" name="wedding_date" type="date" />
            <label className="block"><span className="text-sm font-medium">Type</span><select name="payment_type" className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3"><option value="deposit">Acompte</option><option value="balance">Solde</option></select></label>
            <Field label="Montant (€)" name="amount" type="number" min="0.01" step="0.01" required />
            <Field label="Date encaissée" name="received_date" type="date" required />
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white md:col-span-2 xl:col-span-5 xl:justify-self-end"><Plus size={17} /> Ajouter la ligne</button>
          </form>
        </section>

        <div className="mt-7 space-y-5">
          {yearData.map((data, index) => (
            <details key={data.year} open={index === 0} className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 bg-neutral-50 px-6 py-5">
                <div><h2 className="text-xl font-semibold">Année {data.year}</h2><p className="mt-1 text-xs text-neutral-500">{data.weddings} mariage{data.weddings > 1 ? "s" : ""}</p></div>
                <div className="text-right"><p className="font-semibold">{money(data.total)}</p><p className="mt-1 text-xs text-neutral-500">{money(data.yearReceived)} encaissé · {money(data.yearExpected)} à venir</p></div>
              </summary>
              <div className="space-y-3 p-6">
                {data.months.map((month) => (
                  <details key={month.key} className="rounded-2xl border border-black/10">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4"><span className="font-semibold capitalize">{monthLabel(month.key)}</span><span className="font-semibold">{money(month.total)}</span></summary>
                    <div className="border-t border-black/10 px-5 py-4">
                      {month.lines.length === 0 ? <p className="text-sm text-neutral-500">Aucune ligne.</p> : month.lines.map((payment) => <PaymentLine key={payment.id} payment={payment} today={today} />)}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}

function PaymentLine({ payment, today }: { payment: Payment; today: string }) {
  const receiveAction = markBalanceReceived.bind(null, payment.id);
  const deleteAction = deletePayment.bind(null, payment.id);
  const date = payment.status === "received" ? payment.received_date : payment.expected_date;
  const late = payment.status === "expected" && Boolean(payment.expected_date && payment.expected_date < today);

  return (
    <div className="flex flex-col gap-3 border-b border-black/5 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {payment.wedding_id ? <Link href={`/mariages/${payment.wedding_id}`} className="font-medium hover:underline">{payment.display_name}</Link> : <p className="font-medium">{payment.display_name}</p>}
        <p className="mt-1 text-xs text-neutral-500">{payment.payment_type === "deposit" ? "Acompte" : "Solde"} · mariage {dateLabel(payment.wedding_date)} · {payment.status === "received" ? "encaissé" : late ? "en retard" : "à venir"} le {dateLabel(date)}</p>
      </div>
      <div className="flex items-center gap-3">
        <p className="font-semibold">{money(Number(payment.amount))}</p>
        {payment.status === "expected" && payment.payment_type === "balance" ? <form action={receiveAction}><input type="hidden" name="received_date" value={today} /><button className="min-h-11 rounded-xl bg-black px-4 py-2 text-xs font-medium text-white">Marquer reçu</button></form> : null}
        <form action={deleteAction}><button className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 text-red-700 hover:bg-red-50" title="Supprimer"><Trash2 size={15} /></button></form>
      </div>
    </div>
  );
}

function Messages({ creation, encaissement, suppression, erreur }: { creation?: string; encaissement?: string; suppression?: string; erreur?: string }) {
  if (erreur) return <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{erreur}</div>;
  const text = creation ? "La ligne a été ajoutée." : encaissement ? "Le solde a été marqué comme reçu." : suppression ? "La ligne a été supprimée." : null;
  return text ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">{text}</div> : null;
}
function Metric({ icon: Icon, label, value, highlight = false, dark = false }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; highlight?: boolean; dark?: boolean }) {
  return <article className={`rounded-3xl border p-5 shadow-sm ${dark ? "border-black bg-black text-white" : highlight ? "border-amber-200 bg-amber-50" : "border-black/10 bg-white"}`}><div className="flex items-center justify-between"><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${dark ? "bg-white/10" : "bg-neutral-100"}`}><Icon size={21} /></span><span className="text-2xl font-semibold">{value}</span></div><p className="mt-5 text-sm font-medium">{label}</p></article>;
}
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...input } = props;
  return <label className="block"><span className="text-sm font-medium">{label}</span><input {...input} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-3 outline-none focus:border-black" /></label>;
}
