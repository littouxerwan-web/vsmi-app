import { Stethoscope } from "lucide-react";

export default function Loading() {
  return (
    <main className="osteo-page mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
      <section className="osteo-panel rounded-3xl border border-white/10 bg-[#1B1D1B] p-5">
        <div className="flex items-center gap-2 text-[#D2AE57]"><Stethoscope size={21}/><span className="text-xs font-semibold uppercase tracking-[.18em]">OSTEO</span></div>
        <h1 className="mt-2 text-2xl font-semibold text-white">Activité de Laure</h1>
        <p className="mt-1 text-sm text-white/55">Ouverture d’OSTEO…</p>
      </section>
    </main>
  );
}
