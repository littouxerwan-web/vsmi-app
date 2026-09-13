import Link from "next/link";
import { CalendarDays, ChevronDown, MapPin, Navigation } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MomentRow = {
  id: string;
  wedding_id: string;
  label: string;
  location: string | null;
  scheduled_time: string | null;
  photographer_present: boolean;
};

type WeddingRow = {
  id: string;
  partner1_first_name: string | null;
  partner1_last_name: string | null;
  partner2_first_name: string | null;
  partner2_last_name: string | null;
  wedding_date: string;
  city: string | null;
  archived_at: string | null;
  wedding_moments: MomentRow[] | null;
};

function nameOf(wedding: WeddingRow) {
  const one = [wedding.partner1_first_name, wedding.partner1_last_name].filter(Boolean).join(" ");
  const two = [wedding.partner2_first_name, wedding.partner2_last_name].filter(Boolean).join(" ");
  return one && two ? `${one} & ${two}` : one || two || "Mariage sans nom";
}

function WeddingSummary({ wedding, momentsCount, expandable = true }: { wedding: WeddingRow; momentsCount: number; expandable?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <CalendarDays size={17} className="shrink-0" />
      <div className="min-w-0 flex-1 sm:grid sm:grid-cols-[150px_1fr_1fr] sm:items-center sm:gap-4">
        <p className="text-sm font-semibold">{new Intl.DateTimeFormat("fr-FR").format(new Date(`${wedding.wedding_date}T12:00:00`))}</p>
        <p className="truncate font-semibold">{nameOf(wedding)}</p>
        <p className="truncate text-sm text-neutral-500">{wedding.city || "Ville à définir"}</p>
      </div>
      <span className="shrink-0 text-xs text-neutral-500">
        {momentsCount > 0 ? `${momentsCount} temps fort${momentsCount > 1 ? "s" : ""}` : "Aucun temps fort"}
      </span>
      {expandable ? <ChevronDown size={16} className="shrink-0 transition group-open:rotate-180" /> : null}
    </div>
  );
}

export default async function AgendaPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = String(new Date().getFullYear());

  // L'agenda doit partir de TOUS les mariages à venir, puis rattacher les temps forts.
  // Ainsi, un mariage reste visible même s'il n'a encore aucun temps fort enregistré.
  const { data, error } = await supabase
    .from("weddings")
    .select(`
      id,
      partner1_first_name,
      partner1_last_name,
      partner2_first_name,
      partner2_last_name,
      wedding_date,
      city,
      archived_at,
      wedding_moments (id, wedding_id, label, location, scheduled_time, photographer_present)
    `)
    .gte("wedding_date", today)
    .is("archived_at", null)
    .order("wedding_date", { ascending: true });

  if (error) console.error("Erreur agenda :", error);

  const weddings = ((data ?? []) as unknown as WeddingRow[]);
  const byYear = new Map<string, WeddingRow[]>();
  for (const wedding of weddings) {
    const year = wedding.wedding_date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), wedding]);
  }

  const years = Array.from(byYear.keys()).sort((a, b) => {
    if (a === currentYear) return -1;
    if (b === currentYear) return 1;
    const af = a > currentYear;
    const bf = b > currentYear;
    if (af !== bf) return af ? -1 : 1;
    return af ? a.localeCompare(b) : b.localeCompare(a);
  });

  return (
    <main className="px-4 py-5 sm:px-5 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-medium text-neutral-500">Planning</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Agenda</h1>
        <p className="mt-2 text-neutral-600">Tous les prochains mariages, avec les temps forts à déplier lorsqu'ils sont renseignés.</p>

        <div className="mt-7 space-y-5">
          {years.length === 0 ? (
            <p className="rounded-3xl border border-black/10 bg-white p-10 text-center text-sm text-neutral-500">Aucun mariage programmé.</p>
          ) : years.map((year, yearIndex) => {
            const entries = [...(byYear.get(year) ?? [])].sort((a, b) => a.wedding_date.localeCompare(b.wedding_date));
            return (
              <details key={year} open={yearIndex === 0} className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between bg-neutral-50 px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="text-xl font-semibold">{year}</h2>
                    <p className="mt-1 text-xs text-neutral-500">{entries.length} mariage{entries.length > 1 ? "s" : ""}</p>
                  </div>
                  <ChevronDown size={19} />
                </summary>

                <div>
                  {entries.map((wedding) => {
                    const sorted = [...(wedding.wedding_moments ?? [])]
                      .filter((moment) => Boolean(moment.scheduled_time || moment.location || moment.photographer_present))
                      .sort((a, b) => (a.scheduled_time || "99:99").localeCompare(b.scheduled_time || "99:99"));

                    if (sorted.length === 0) {
                      return (
                        <div key={wedding.id} className="border-t border-black/5 first:border-t-0">
                          <Link href={`/mariages/${wedding.id}`} className="flex items-center px-4 py-4 hover:bg-neutral-50 sm:px-6">
                            <WeddingSummary wedding={wedding} momentsCount={0} expandable={false} />
                          </Link>
                        </div>
                      );
                    }

                    return (
                      <details key={wedding.id} className="group border-t border-black/5 first:border-t-0">
                        <summary className="flex cursor-pointer list-none items-center px-4 py-4 hover:bg-neutral-50 sm:px-6">
                          <WeddingSummary wedding={wedding} momentsCount={sorted.length} />
                        </summary>
                        <div className="space-y-2 bg-neutral-50/70 px-4 pb-4 sm:px-6 sm:pl-12">
                          {sorted.map((moment) => (
                            <div key={moment.id} className="grid gap-2 rounded-xl border border-black/5 bg-white px-4 py-3 sm:grid-cols-[70px_180px_1fr_auto] sm:items-center">
                              <p className="font-semibold tabular-nums">{moment.scheduled_time?.slice(0, 5) || "--:--"}</p>
                              <p className="text-sm font-medium">{moment.label}</p>
                              <p className="flex items-center gap-2 text-sm text-neutral-600">
                                {moment.location ? <><MapPin size={14} />{moment.location}</> : null}
                              </p>
                              {moment.location ? (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(moment.location)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium">
                                  <Navigation size={14} /> GPS
                                </a>
                              ) : null}
                            </div>
                          ))}
                        </div>
                        <div className="px-4 pb-4 sm:px-6 sm:pl-12">
                          <Link href={`/mariages/${wedding.id}`} className="text-xs font-medium text-neutral-500 hover:text-black">Ouvrir la fiche mariage</Link>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </main>
  );
}
