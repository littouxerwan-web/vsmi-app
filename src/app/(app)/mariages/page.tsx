import Link from "next/link";
import { Archive, CalendarDays, FileText, MapPin, Plus, RotateCcw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { archiveWedding, restoreWedding } from "./extra-actions";

export const dynamic = "force-dynamic";

type WeddingRow = {
  id: string;
  partner1_first_name: string | null;
  partner1_last_name: string | null;
  partner2_first_name: string | null;
  partner2_last_name: string | null;
  wedding_date: string;
  city: string | null;
  total_amount: number;
  archived_at: string | null;
  quote_path: string | null;
};

function weddingName(wedding: WeddingRow) {
  const one = [wedding.partner1_first_name, wedding.partner1_last_name].filter(Boolean).join(" ");
  const two = [wedding.partner2_first_name, wedding.partner2_last_name].filter(Boolean).join(" ");
  return one && two ? `${one} & ${two}` : one || two || "Mariage sans nom";
}

export default async function WeddingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    recherche?: string;
    suppression?: string;
    archive?: string;
    restauration?: string;
    erreur?: string;
  }>;
}) {
  const { recherche = "", suppression, archive, restauration, erreur: messageErreur } = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("weddings")
    .select("id, partner1_first_name, partner1_last_name, partner2_first_name, partner2_last_name, wedding_date, city, total_amount, archived_at, quote_path")
    .order("wedding_date", { ascending: true });

  if (error) console.error("Erreur chargement mariages :", error);

  const query = recherche.trim().toLowerCase();
  const allWeddings = ((data ?? []) as WeddingRow[]).filter((wedding) => {
    const haystack = `${weddingName(wedding)} ${wedding.city ?? ""}`.toLowerCase();
    return !query || haystack.includes(query);
  });

  const activeWeddings = allWeddings.filter((wedding) => !wedding.archived_at);
  const archivedWeddings = allWeddings.filter((wedding) => wedding.archived_at);
  const years = Array.from(new Set(activeWeddings.map((wedding) => wedding.wedding_date.slice(0, 4)))).sort((a, b) => b.localeCompare(a));

  const money = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

  return (
    <main className="mariages-ledger-theme px-4 py-5 sm:px-5 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500">Réservations confirmées</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Mes Mariages</h1>
            <p className="mt-2 text-neutral-600">Tous les mariages réservés avec acompte reçu.</p>
          </div>
          <Link href="/mariages/nouveau" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-medium text-white hover:bg-neutral-800">
            <Plus size={18} /> Nouveau mariage
          </Link>
        </div>

        {suppression ? <Success text="Le mariage a été supprimé." /> : archive ? <Success text="Le mariage a été classé dans les archives." /> : restauration ? <Success text="Le mariage a été restauré." /> : null}
        {messageErreur ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{messageErreur}</div> : null}

        <form className="mt-6 flex max-w-xl items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
          <Search size={18} className="text-neutral-400" />
          <input name="recherche" defaultValue={recherche} placeholder="Rechercher un nom ou une ville…" className="min-w-0 flex-1 bg-transparent outline-none" />
        </form>

        <div className="mt-8 space-y-5">
          {years.length === 0 ? (
            <div className="rounded-3xl border border-black/10 bg-white px-6 py-16 text-center text-sm text-neutral-500">Aucun mariage trouvé.</div>
          ) : (
            years.map((year, index) => {
              const weddings = activeWeddings.filter((wedding) => wedding.wedding_date.startsWith(year));
              return (
                <details key={year} open={index === 0} className="overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between bg-neutral-50 px-6 py-5">
                    <div>
                      <h2 className="text-xl font-semibold">{year}</h2>
                      <p className="mt-1 text-xs text-neutral-500">{weddings.length} mariage{weddings.length > 1 ? "s" : ""}</p>
                    </div>
                    <p className="font-semibold">{money.format(weddings.reduce((sum, wedding) => sum + Number(wedding.total_amount), 0))}</p>
                  </summary>

                  <div className="hidden grid-cols-[140px_1.3fr_1fr_140px_110px] gap-4 border-y border-black/10 bg-white px-6 py-3 text-xs font-medium uppercase tracking-[0.12em] text-neutral-500 md:grid">
                    <span>Date</span><span>Nom</span><span>Ville</span><span className="text-right">Budget</span><span />
                  </div>

                  {weddings.map((wedding) => {
                    const archiveAction = archiveWedding.bind(null, wedding.id);
                    return (
                      <div key={wedding.id} className="grid gap-3 border-b border-black/5 px-4 py-5 last:border-0 sm:px-6 md:grid-cols-[140px_1.3fr_1fr_140px_110px] md:items-center">
                        <Link href={`/mariages/${wedding.id}`} className="contents">
                          <p className="flex items-center gap-2 text-sm font-medium"><CalendarDays size={17} />{new Intl.DateTimeFormat("fr-FR").format(new Date(`${wedding.wedding_date}T12:00:00`))}</p>
                          <p className="flex items-center gap-2 font-semibold">
                            {weddingName(wedding)}
                            {wedding.quote_path ? (
                              <span
                                title="Devis ou pièce jointe disponible"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700"
                              >
                                <FileText size={15} />
                              </span>
                            ) : null}
                          </p>
                          <p className="flex items-center gap-2 text-sm text-neutral-500"><MapPin size={16} />{wedding.city || "Ville à définir"}</p>
                          <p className="font-semibold md:text-right">{money.format(Number(wedding.total_amount))}</p>
                        </Link>
                        <form action={archiveAction}>
                          <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-xs font-medium hover:bg-neutral-100"><Archive size={15} /> Réalisé</button>
                        </form>
                      </div>
                    );
                  })}
                </details>
              );
            })
          )}
        </div>

        <details className="mt-8 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between bg-neutral-950 px-6 py-5 text-white">
            <div>
              <h2 className="text-xl font-semibold">Archives</h2>
              <p className="mt-1 text-xs text-neutral-400">{archivedWeddings.length} mariage{archivedWeddings.length > 1 ? "s" : ""} réalisé{archivedWeddings.length > 1 ? "s" : ""}</p>
            </div>
            <Archive size={20} />
          </summary>

          {archivedWeddings.length === 0 ? (
            <p className="px-6 py-10 text-sm text-neutral-500">Aucun mariage archivé.</p>
          ) : (
            archivedWeddings.map((wedding) => {
              const restoreAction = restoreWedding.bind(null, wedding.id);
              return (
                <div key={wedding.id} className="flex flex-col gap-4 border-b border-black/5 px-6 py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`/mariages/${wedding.id}`}>
                    <p className="flex items-center gap-2 font-semibold">
                            {weddingName(wedding)}
                            {wedding.quote_path ? (
                              <span
                                title="Devis ou pièce jointe disponible"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700"
                              >
                                <FileText size={15} />
                              </span>
                            ) : null}
                          </p>
                    <p className="mt-1 text-sm text-neutral-500">{new Intl.DateTimeFormat("fr-FR").format(new Date(`${wedding.wedding_date}T12:00:00`))}{wedding.city ? ` · ${wedding.city}` : ""}</p>
                  </Link>
                  <form action={restoreAction}>
                    <button className="inline-flex items-center gap-2 rounded-xl border border-black/10 px-4 py-2 text-sm font-medium hover:bg-neutral-50"><RotateCcw size={15} /> Restaurer</button>
                  </form>
                </div>
              );
            })
          )}
        </details>
      </div>
    </main>
  );
}

function Success({ text }: { text: string }) {
  return <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">{text}</div>;
}
