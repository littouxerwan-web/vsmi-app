import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, CircleDollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Wedding = {
  id: string;
  partner1_first_name: string | null;
  partner1_last_name: string | null;
  partner2_first_name: string | null;
  partner2_last_name: string | null;
  wedding_date: string;
  city: string | null;
};

type Payment = {
  amount: number;
  expected_date: string | null;
  received_date: string | null;
  status: "expected" | "received" | "cancelled";
};

function weddingName(wedding: Wedding) {
  const one = [wedding.partner1_first_name, wedding.partner1_last_name].filter(Boolean).join(" ");
  const two = [wedding.partner2_first_name, wedding.partner2_last_name].filter(Boolean).join(" ");
  return one && two ? `${one} & ${two}` : one || two || "Mariage sans nom";
}

export default async function TodayPage() {
  const supabase = await createClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);

  const [{ data: weddingsData }, { data: paymentsData }] = await Promise.all([
    supabase
      .from("weddings")
      .select("id, partner1_first_name, partner1_last_name, partner2_first_name, partner2_last_name, wedding_date, city")
      .gte("wedding_date", today)
      .order("wedding_date")
      .limit(6),
    supabase
      .from("wedding_payments")
      .select("amount, expected_date, received_date, status")
      .neq("status", "cancelled"),
  ]);

  const weddings = (weddingsData ?? []) as Wedding[];
  const payments = (paymentsData ?? []) as Payment[];
  const receivedMonth = payments
    .filter((p) => p.status === "received" && p.received_date?.startsWith(month))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const receivedYear = payments
    .filter((p) => p.status === "received" && p.received_date?.startsWith(year))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const expectedYear = payments
    .filter((p) => p.status === "expected" && p.expected_date?.startsWith(year))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <main className="px-4 py-5 sm:px-5 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm text-neutral-500">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Aujourd’hui</h1>
        <p className="mt-2 text-neutral-600">L’essentiel de tes mariages et de ta comptabilité.</p>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={CalendarDays} label="Mariages à venir" value={String(weddings.length)} />
          <Metric icon={CheckCircle2} label="Encaissé ce mois" value={money.format(receivedMonth)} />
          <Metric icon={CircleDollarSign} label="Encaissé cette année" value={money.format(receivedYear)} />
          <Metric icon={Clock3} label="À venir cette année" value={money.format(expectedYear)} dark />
        </section>

        <section className="mt-7 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div><h2 className="text-xl font-semibold">Prochains mariages</h2><p className="mt-1 text-sm text-neutral-500">Les six prochaines réservations.</p></div>
            <Link href="/mariages" className="text-sm font-medium text-neutral-600 hover:text-black">Voir tout</Link>
          </div>
          <div className="mt-6 space-y-3">
            {weddings.length === 0 ? <p className="rounded-2xl bg-neutral-100 p-5 text-sm text-neutral-500">Aucun mariage à venir.</p> : weddings.map((wedding) => (
              <Link key={wedding.id} href={`/mariages/${wedding.id}`} className="flex flex-col gap-2 rounded-2xl border border-black/10 px-4 py-4 hover:bg-neutral-50 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold">{weddingName(wedding)}</p><p className="mt-1 text-sm text-neutral-500">{wedding.city || "Ville à définir"}</p></div>
                <p className="text-sm font-medium">{new Intl.DateTimeFormat("fr-FR").format(new Date(`${wedding.wedding_date}T12:00:00`))}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon: Icon, label, value, dark = false }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; dark?: boolean }) {
  return <article className={`rounded-3xl border p-5 shadow-sm ${dark ? "border-black bg-black text-white" : "border-black/10 bg-white"}`}><div className="flex items-center justify-between"><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${dark ? "bg-white/10" : "bg-neutral-100"}`}><Icon size={21} /></span><span className="text-2xl font-semibold">{value}</span></div><p className="mt-5 text-sm font-medium">{label}</p></article>;
}
