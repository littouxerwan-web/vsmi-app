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
  const childrenAccess = photoAccess && !personalOnly;

  const firstName =
    typeof claims.user_metadata?.first_name === "string"
      ? claims.user_metadata.first_name
      : null;

  return (
    <>
      <InteractionFeedback />
      <div className="vsmi-lux-theme min-h-screen bg-[#0B0B0B] text-[#F4F4F2]">
      <div className="flex min-h-screen">
        <AppNavigation photoAccess={photoAccess} childrenAccess={childrenAccess} />

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101010]/95 text-white shadow-[0_8px_28px_rgba(0,0,0,.18)] backdrop-blur">
            <div className="relative grid h-18 grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-5 lg:px-8">
              <div className="flex items-center justify-start">
                <PrivacyModeToggle />
              </div>

              <Link
                href="/aujourd-hui"
                className="vsmi-press flex items-center justify-center rounded-xl px-2"
                aria-label="Accueil"
              >
                <Image
                  src="/vsmi-logo.gif"
                  alt="Logo"
                  width={68}
                  height={54}
                  className="h-11 w-auto max-w-[7rem] object-contain sm:h-12"
                  unoptimized
                  priority
                />
              </Link>

              <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
                <Link
                  href="/perso?vue=parametres"
                  aria-label="Ouvrir les paramètres personnels"
                  title="Paramètres"
                  className="grid size-10 place-items-center rounded-full border border-[#D2AE57]/35 bg-white/[0.06] text-[#D2AE57] transition hover:border-[#D2AE57]/65 hover:bg-[#D2AE57]/12"
                >
                  <Settings size={18} />
                </Link>
                <div className="hidden max-w-44 text-right sm:block">
                  <p className="truncate text-sm font-medium text-[#E7E7E7]">
                    {firstName ?? claims.email ?? "Utilisateur"}
                  </p>
                  {personalOnly ? <p className="text-xs text-[#A9A9A9]">Personnel</p> : null}
                </div>

                <form action={logout}>
                  <button
                    type="submit"
                    title="Se déconnecter"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-[#C8C8C8] transition hover:border-[#D2AE57]/55 hover:bg-[#D2AE57]/10 hover:text-[#D2AE57]"
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
