"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Baby,
  CalendarDays,
  Camera,
  CircleDollarSign,
  HeartHandshake,
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  UserRound,
  UsersRound,
  WalletCards,
  Stethoscope,
} from "lucide-react";

function getCurrentMonthLabel() {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "Europe/Paris" })
    .format(new Date())
    .replace(/^./, (c) => c.toUpperCase());
}

function getBasePersoNavigation(currentMonthLabel: string) {
  return [
    { href: "/perso?vue=finances", label: currentMonthLabel, icon: CircleDollarSign },
    { href: "/perso?vue=projection", label: "Projection", icon: TrendingUp },
    { href: "/perso?vue=analyse", label: "Analyse", icon: BarChart3 },
  ];
}

function getCommonNavigation(currentMonthLabel: string) {
  return [
    { href: "/commun?vue=encours", label: currentMonthLabel, icon: WalletCards },
    { href: "/commun?vue=budget", label: "Budget", icon: CircleDollarSign },
  ];
}

const photoNavigation = [
  { href: "/mariages", label: "Mes Mariages", icon: HeartHandshake },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/comptabilite", label: "Comptabilité photo", icon: CircleDollarSign },
];

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof CircleDollarSign;
};

function NavLink({
  item,
  accent = "neutral",
}: {
  item: NavigationItem;
  accent?: "perso" | "common" | "neutral";
}) {
  const Icon = item.icon;
  const pathname = usePathname(), params = useSearchParams();
  const [route, query] = item.href.split("?");
  const targetView = new URLSearchParams(query).get("vue");
  const active = (pathname === route || pathname.startsWith(`${route}/`)) && (!targetView || (params.get("vue") ?? (route === "/commun" ? "encours" : "finances")) === targetView);
  const hover =
    accent === "perso"
      ? "hover:bg-[#C7A45A]/14 hover:text-[#E0C27E]"
      : accent === "common"
        ? "hover:bg-white/10 hover:text-[#D9DADD]"
        : "hover:bg-white/10 hover:text-white";

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`vsmi-press flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-neutral-200 transition ${hover}`}
    >
      <Icon size={19} strokeWidth={1.8} />
      {item.label}
    </Link>
  );
}

export function AppNavigation({ photoAccess = false, childrenAccess = false, osteoAccess = false }: { photoAccess?: boolean; childrenAccess?: boolean; osteoAccess?: boolean }) {
  // Calculé à chaque rendu serveur : le menu bascule automatiquement au nouveau mois
  // sans rester figé sur le mois du dernier build/déploiement.
  const currentMonthLabel = getCurrentMonthLabel();
  const basePersoNavigation = getBasePersoNavigation(currentMonthLabel);
  const commonNavigation = getCommonNavigation(currentMonthLabel);
  const persoNavigation = childrenAccess
    ? [...basePersoNavigation, { href: "/enfants", label: "Enfants", icon: Baby }]
    : basePersoNavigation;
  return (
    <aside className="premium-sidebar hidden min-h-screen w-60 shrink-0 text-white lg:flex lg:flex-col">
      <Link href="/aujourd-hui" className="premium-brand"><svg className="premium-brand-sailboat" viewBox="0 0 144 104" fill="none" role="img" aria-label="VSMI — voilier" xmlns="http://www.w3.org/2000/svg">
        <g stroke="#F2EEE5" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
          <path d="M75 12V75"/>
          <path d="M70 19C57 35 43 54 34 66H70C66 52 67 33 70 19Z"/>
          <path d="M81 29L107 67H81C85 54 84 40 81 29Z"/>
        </g>
        <g stroke="#DCC79D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M25 75C49 78 82 79 118 73L107 85C87 91 51 91 36 85L25 75Z"/>
          <path d="M43 96C52 93 59 93 67 96C75 99 82 99 91 96" opacity=".65"/>
          <path d="M99 96C104 94 109 94 114 95" opacity=".4"/>
        </g>
      </svg><small>Votre quotidien, en équilibre.</small></Link>

      <nav className="flex-1 px-4 py-6">
        <Link
          href="/aujourd-hui"
          className="vsmi-press mb-5 flex items-center gap-3 rounded-2xl border border-[#C7A45A]/35 bg-[#C7A45A]/10 px-4 py-3.5 text-sm font-semibold text-[#E0C27E] transition hover:bg-[#C7A45A]/18"
        >
          <LayoutDashboard size={19} strokeWidth={1.8} />
          Aujourd’hui
        </Link>

        <details className="group" open>
          <summary className="vsmi-press flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-[#C7A45A] transition hover:bg-[#C7A45A]/14">
            <span className="flex items-center gap-3">
              <UserRound size={19} />
              MES COMPTES
            </span>
            <span className="text-lg transition group-open:rotate-45">+</span>
          </summary>
          <div className="mt-1 space-y-1 border-l border-[#C7A45A]/45 pl-2">
            {persoNavigation.map((item) => (
              <NavLink key={item.href} item={item} accent="perso" />
            ))}
          </div>
        </details>

        {osteoAccess ? (
          <Link
            href="/osteo"
            className="vsmi-press mt-4 flex items-center gap-3 rounded-2xl border border-[#9B7CC1]/40 bg-[#9B7CC1]/12 px-4 py-3 text-sm font-semibold text-[#D9C7EF] transition hover:bg-[#9B7CC1]/20"
          >
            <Stethoscope size={19} strokeWidth={1.8} />
            OSTEO
          </Link>
        ) : null}

        <details className="group mt-4" open>
          <summary className="vsmi-press flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-[#D9DADD] transition hover:bg-white/10">
            <span className="flex items-center gap-3">
              <UsersRound size={19} />
              COMMUN
            </span>
            <span className="text-lg transition group-open:rotate-45">+</span>
          </summary>
          <div className="mt-1 space-y-1 border-l border-white/20 pl-2">
            {commonNavigation.map((item) => (
              <NavLink key={item.href} item={item} accent="common" />
            ))}
          </div>
        </details>

        {photoAccess ? (
          <details className="group mt-4" open>
            <summary className="vsmi-press flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              <span className="flex items-center gap-3">
                <Camera size={19} />
                PHOTO
              </span>
              <span className="text-lg transition group-open:rotate-45">+</span>
            </summary>
            <div className="mt-1 space-y-1 border-l border-white/20 pl-2">
              {photoNavigation.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </details>
        ) : null}
      </nav>

      <div className="border-t border-white/10 px-7 py-5">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em]">
          <span className="text-[#C7A45A]">MES COMPTES</span>
          <span className="text-neutral-600">•</span>
          <span className="text-[#D9DADD]">COMMUN</span>
          {photoAccess ? (
            <>
              <span className="text-neutral-600">•</span>
              <span className="text-white">PHOTO</span>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
