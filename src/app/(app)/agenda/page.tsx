import Link from "next/link";
import { CalendarDays, MapPin, Navigation } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MomentRow = {
  id: string;
  wedding_id: string;
  label: string;
  location: string | null;
  scheduled_time: string | null;
  weddings: {
    partner1_first_name: string | null;
    partner1_last_name: string | null;
    partner2_first_name: string | null;
    partner2_last_name: string | null;
    wedding_date: string;
    city: string | null;
  } | null;
};

function nameOf(wedding: NonNullable<MomentRow["weddings"]>) {
  const one = [wedding.partner1_first_name, wedding.partner1_last_name].filter(Boolean).join(" ");
  const two = [wedding.partner2_first_name, wedding.partner2_last_name].filter(Boolean).join(" ");
  return one && two ? `${one} & ${two}` : one || two || "Mariage sans nom";
}

export default async function AgendaPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("wedding_moments")
    .select(`id, wedding_id, label, location, scheduled_time, weddings!inner (partner1_first_name, partner1_last_name, partner2_first_name, partner2_last_name, wedding_date, city)`)
    .gte("weddings.wedding_date", today)
    .order("scheduled_time", { ascending: true });

  if (error) console.error("Erreur agenda :", error);
  const moments = (data ?? []) as unknown as MomentRow[];
  const grouped = new Map<string, MomentRow[]>();
  for (const moment of moments) {
    const date = moment.weddings?.wedding_date;
    if (!date) continue;
    grouped.set(date, [...(grouped.get(date) ?? []), moment]);
  }

  return (
    <main className="px-4 py-5 sm:px-5 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-medium text-neutral-500">Planning</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Agenda</h1>
        <p className="mt-2 text-neutral-600">Horaires et lieux des prochains mariages.</p>

        <div className="mt-7 space-y-6">
          {grouped.size === 0 ? <p className="rounded-3xl border border-black/10 bg-white p-10 text-center text-sm text-neutral-500">Aucun moment programmé.</p> : Array.from(grouped.entries()).map(([date, rows]) => {
            const wedding = rows[0].weddings!;
            return <section key={date} className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 font-semibold"><CalendarDays size={18} />{new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${date}T12:00:00`))}</p><Link href={`/mariages/${rows[0].wedding_id}`} className="mt-1 inline-block text-sm text-neutral-500 hover:text-black">{nameOf(wedding)} · {wedding.city || "Ville à définir"}</Link></div></div>
              <div className="mt-5 space-y-3">{rows.map((moment) => <div key={moment.id} className="grid gap-3 rounded-2xl bg-neutral-100 px-4 py-3 sm:grid-cols-[90px_180px_1fr_auto] sm:items-center"><p className="font-semibold">{moment.scheduled_time?.slice(0, 5) || "--:--"}</p><p className="text-sm font-medium">{moment.label}</p><p className="flex items-center gap-2 text-sm text-neutral-600"><MapPin size={15} />{moment.location || "Lieu à définir"}</p>{moment.location ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(moment.location)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium"><Navigation size={15} /> GPS</a> : null}</div>)}</div>
            </section>;
          })}
        </div>
      </div>
    </main>
  );
}
