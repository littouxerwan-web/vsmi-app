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
} from "lucide-react";

const basePersoNavigation = [
  { href: "/perso?vue=finances", label: "En cours", icon: CircleDollarSign },
  { href: "/perso?vue=projection", label: "Projection", icon: TrendingUp },
  { href: "/perso?vue=analyse", label: "Analyse", icon: BarChart3 },
];

const commonNavigation = [
  { href: "/commun?vue=encours", label: "En cours", icon: WalletCards },
  { href: "/commun?vue=budget", label: "Budget", icon: CircleDollarSign },
];

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
  const hover =
    accent === "perso"
      ? "hover:bg-[#C7A45A]/14 hover:text-[#E0C27E]"
      : accent === "common"
        ? "hover:bg-[#4F8F86]/18 hover:text-[#8BC7BE]"
        : "hover:bg-white/10 hover:text-white";

  return (
    <Link
      href={item.href}
      className={`vsmi-press flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-neutral-200 transition ${hover}`}
    >
      <Icon size={19} strokeWidth={1.8} />
      {item.label}
    </Link>
  );
}

export function AppNavigation({ photoAccess = false, childrenAccess = false }: { photoAccess?: boolean; childrenAccess?: boolean }) {
  const persoNavigation = childrenAccess
    ? [...basePersoNavigation, { href: "/enfants", label: "Enfants", icon: Baby }]
    : basePersoNavigation;
  return (
    <aside className="hidden min-h-screen w-64 shrink-0 bg-black text-white lg:flex lg:flex-col">
      <div className="h-18 border-b border-white/10" aria-hidden="true" />

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
              PERSO
            </span>
            <span className="text-lg transition group-open:rotate-45">+</span>
          </summary>
          <div className="mt-1 space-y-1 border-l border-[#C7A45A]/45 pl-2">
            {persoNavigation.map((item) => (
              <NavLink key={item.href} item={item} accent="perso" />
            ))}
          </div>
        </details>

        <details className="group mt-4" open>
          <summary className="vsmi-press flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-[#79B8AE] transition hover:bg-[#4F8F86]/18">
            <span className="flex items-center gap-3">
              <UsersRound size={19} />
              COMMUN
            </span>
            <span className="text-lg transition group-open:rotate-45">+</span>
          </summary>
          <div className="mt-1 space-y-1 border-l border-[#4F8F86]/45 pl-2">
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
          <span className="text-[#C7A45A]">PERSO</span>
          <span className="text-neutral-600">•</span>
          <span className="text-[#79B8AE]">COMMUN</span>
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
