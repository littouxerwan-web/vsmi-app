import Link from "next/link";
import { LogOut, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { logout } from "@/app/connexion/actions";
import { AppNavigation } from "@/components/app-navigation";
import { MobileNavigation } from "@/components/mobile-navigation";
import { createClient } from "@/lib/supabase/server";

type AppLayoutProps = {
  children: React.ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  const firstName =
    typeof user.user_metadata?.first_name === "string"
      ? user.user_metadata.first_name
      : null;

  return (
    <div className="min-h-screen bg-[#f5f3ef] text-neutral-950">
      <div className="flex min-h-screen">
        <AppNavigation />

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-black/10 bg-white/95 backdrop-blur">
            <div className="relative flex h-18 items-center justify-between px-5 lg:px-8">
              <Link href="/aujourd-hui" className="lg:hidden">
                <p className="text-xl font-semibold tracking-tight">VSMI</p>
              </Link>

              <Link
                href="/perso?vue=finances&quick=movement"
                aria-label="Saisir rapidement un nouveau mouvement"
                title="Nouveau mouvement"
                className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black text-white shadow-md transition hover:bg-neutral-800"
              >
                <Plus size={22} strokeWidth={2.2} />
              </Link>

              <div className="flex items-center gap-4">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium">
                    {firstName ?? user.email ?? "Utilisateur"}
                  </p>

                  <p className="text-xs text-neutral-500">Photographe</p>
                </div>

                <form action={logout}>
                  <button
                    type="submit"
                    title="Se déconnecter"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white transition hover:bg-neutral-100"
                  >
                    <LogOut size={18} />
                  </button>
                </form>
              </div>
            </div>
          </header>

          <div className="pb-24 lg:pb-0">{children}</div>
          <MobileNavigation />
        </div>
      </div>
    </div>
  );
}