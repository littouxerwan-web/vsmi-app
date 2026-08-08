import Image from "next/image";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { logout } from "@/app/connexion/actions";
import { AppNavigation } from "@/components/app-navigation";
import { MobileNavigation } from "@/components/mobile-navigation";
import { PrivacyModeToggle } from "@/components/privacy-mode-toggle";
import { InteractionFeedback } from "@/components/interaction-feedback";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AppLayoutProps = {
  children: React.ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as
    | {
        sub?: string;
        email?: string;
        app_metadata?: { role?: string; photo_access?: boolean };
        user_metadata?: { first_name?: string };
      }
    | undefined;

  if (error || !claims?.sub) {
    redirect("/connexion");
  }

  const personalOnly = claims.app_metadata?.role === "personal";
  const photoAccess = claims.app_metadata?.photo_access === true;

  const firstName =
    typeof claims.user_metadata?.first_name === "string"
      ? claims.user_metadata.first_name
      : null;

  return (
    <>
      <InteractionFeedback />
      <div className="min-h-screen bg-[#f5f3ef] text-neutral-950">
      <div className="flex min-h-screen">
        <AppNavigation photoAccess={photoAccess} />

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-black/10 bg-white/95 backdrop-blur">
            <div className="relative flex h-18 items-center justify-between px-5 lg:px-8">
              <Link href={personalOnly || !photoAccess ? "/perso?vue=finances" : "/aujourd-hui"} className="flex items-center lg:hidden" aria-label="Accueil VSMI">
                <Image src="/vsmi-logo.gif" alt="Logo VSMI" width={54} height={54} className="h-11 w-auto object-contain" unoptimized priority />
              </Link>

              <div className="flex items-center gap-2 sm:gap-4">
                <PrivacyModeToggle />
                <Link
                  href="/perso?vue=parametres"
                  aria-label="Ouvrir les paramètres personnels"
                  title="Paramètres"
                  className="grid size-10 place-items-center rounded-full border border-black/10 bg-white transition hover:bg-neutral-100"
                >
                  <Settings size={18} />
                </Link>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium">
                    {firstName ?? claims.email ?? "Utilisateur"}
                  </p>
                  {personalOnly ? <p className="text-xs text-neutral-500">Personnel</p> : null}
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

          <div id="app-private-content" className="relative pb-24 lg:pb-0">
            {children}
          </div>
          <MobileNavigation photoAccess={photoAccess} />
        </div>
      </div>
    </div>
    </>
  );
}
