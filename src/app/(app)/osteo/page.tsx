import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OsteoContent } from "./osteo-content";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { month?: string; view?: string; year?: string };

const LAURE_USER_ID = "791eda92-4159-4db2-b132-1be129f56027";

function OsteoSkeleton() {
  return (
    <main className="osteo-page mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
      <section className="osteo-panel rounded-3xl border border-white/10 bg-[#1B1D1B] p-5">
        <div className="flex items-center gap-2 text-[#D2AE57]">
          <Stethoscope size={21} />
          <span className="text-xs font-semibold uppercase tracking-[.18em]">OSTEO</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">Activité de Laure</h1>
        <p className="mt-1 text-sm text-white/55">La page est ouverte. Chargement des données du mois…</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-[#292B28]" />
          ))}
        </div>
      </section>
    </main>
  );
}

export default async function OsteoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect("/connexion");
  if (user.id !== LAURE_USER_ID) redirect("/aujourd-hui");

  return (
    <Suspense fallback={<OsteoSkeleton />}>
      <OsteoContent params={params} ownerId={user.id} />
    </Suspense>
  );
}
