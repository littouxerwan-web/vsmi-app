import { Stethoscope } from "lucide-react";

export default function OsteoLoading() {
  return (
    <main className="osteo-page mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-white/10 bg-[#1B1D1B] p-5">
        <div className="flex items-center gap-2 text-[#D2AE57]">
          <Stethoscope size={21} />
          <span className="text-xs font-semibold uppercase tracking-[.18em]">OSTEO</span>
        </div>
        <h1 className="mt-3 text-xl font-semibold text-white">Chargement de l’activité…</h1>
        <p className="mt-2 text-sm text-white/50">Ouverture du mois en cours. La vue annuelle n’est chargée que sur demande.</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#292B28]" />)}
      </section>
    </main>
  );
}
