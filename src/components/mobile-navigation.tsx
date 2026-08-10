"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Camera,
  CircleDollarSign,
  HeartHandshake,
  LayoutDashboard,
  Plus,
  TrendingUp,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

const ICON_SIZE = 20;

const commonItems = [
  { href: "/commun?vue=encours", label: "En cours", icon: WalletCards },
  { href: "/commun?vue=budget", label: "Budget", icon: CircleDollarSign },
];

const photoItems = [
  { href: "/mariages", label: "Mariages", icon: HeartHandshake },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/comptabilite", label: "Comptabilité", icon: CircleDollarSign },
];

type Panel = "common" | "photo" | null;

export function MobileNavigation({ photoAccess = false }: { photoAccess?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("vue") ?? "finances";
  const isToday = pathname === "/aujourd-hui";
  const [panel, setPanel] = useState<Panel>(null);

  useEffect(() => setPanel(null), [pathname, searchParams]);

  useEffect(() => {
    if (!panel) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [panel]);

  const persoLink = (
    href: string,
    label: string,
    Icon: typeof CircleDollarSign,
    active: boolean,
  ) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`vsmi-press flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium leading-none transition ${
        active
          ? isToday ? "bg-[#D2AE57] text-black" : "bg-[#C7A45A]/14 text-[#9A7530]"
          : isToday ? "text-white/55" : "text-neutral-500"
      }`}
    >
      <Icon size={ICON_SIZE} strokeWidth={1.9} />
      <span className="whitespace-nowrap text-[10px] font-medium leading-none">{label}</span>
    </Link>
  );

  const panelItems = panel === "common" ? commonItems : photoItems;
  const panelTitle = panel === "common" ? "COMMUN" : "PHOTO";
  const panelColor = panel === "common" ? "text-[#4F8F86]" : "text-black";

  return (
    <>
      {panel ? (
        <div
          className="fixed inset-0 z-[80] bg-black/35 lg:hidden"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setPanel(null);
          }}
        >
          <div className="absolute inset-x-3 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] max-h-[min(70dvh,34rem)] overflow-y-auto overscroll-contain rounded-3xl bg-white p-3 shadow-2xl">
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-400">
                  Navigation
                </p>
                <p className={`mt-1 text-lg font-semibold ${panelColor}`}>{panelTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="vsmi-press grid size-10 place-items-center rounded-full bg-neutral-100"
                aria-label={`Fermer le menu ${panelTitle}`}
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-1">
              {panelItems.map((item) => {
                const Icon = item.icon;
                const [path, query] = item.href.split("?");
                const itemView = new URLSearchParams(query ?? "").get("vue");
                const active =
                  pathname === path &&
                  (!itemView || searchParams.get("vue") === itemView);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`vsmi-press flex min-h-13 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      active
                        ? panel === "common"
                          ? "bg-[#4F8F86] text-white"
                          : "bg-black text-white"
                        : "bg-neutral-50 text-neutral-800"
                    }`}
                  >
                    <Icon size={ICON_SIZE} strokeWidth={1.9} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Navigation mobile"
        className={`fixed inset-x-0 bottom-0 z-[90] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden ${isToday ? "border-t border-white/10 bg-[#111111]/95 shadow-[0_-8px_30px_rgba(0,0,0,.35)]" : "border-t border-black/10 bg-white/95 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"}`}
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end gap-1">
          {persoLink(
            "/perso?vue=finances",
            "En cours",
            CircleDollarSign,
            pathname === "/perso" && view === "finances",
          )}

          {persoLink(
            "/perso?vue=projection",
            "Projection",
            TrendingUp,
            pathname === "/perso" && view === "projection",
          )}

          {isToday ? (
            <Link
              href="/perso?vue=finances&quick=movement"
              aria-label="Ajouter un débit ou un crédit"
              className="vsmi-press relative -top-3 mx-auto grid size-14 place-items-center rounded-full border-4 border-[#111111] bg-[#D2AE57] text-black shadow-lg transition hover:bg-[#E0C27E]"
            >
              <Plus size={25} strokeWidth={2.2} />
            </Link>
          ) : (
            <Link
              href="/aujourd-hui"
              aria-label="Ouvrir Aujourd’hui"
              title="Aujourd’hui"
              className="vsmi-press relative -top-3 mx-auto grid size-14 place-items-center rounded-full border-4 border-white bg-[#111111] text-[#D2AE57] shadow-lg transition hover:bg-black"
            >
              <LayoutDashboard size={24} strokeWidth={2} />
            </Link>
          )}

          <button
            type="button"
            onClick={() => setPanel(panel === "common" ? null : "common")}
            aria-expanded={panel === "common"}
            className={`vsmi-press flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium leading-none transition ${
              pathname === "/commun" || panel === "common"
                ? isToday ? "bg-white/10 text-[#D2AE57]" : "bg-[#4F8F86]/12 text-[#3D776F]"
                : isToday ? "text-white/55" : "text-neutral-500"
            }`}
          >
            <UsersRound size={ICON_SIZE} strokeWidth={1.9} />
            <span className="text-[10px] font-medium leading-none">Commun</span>
          </button>

          {photoAccess ? (
            <button
              type="button"
              onClick={() => setPanel(panel === "photo" ? null : "photo")}
              aria-expanded={panel === "photo"}
              className={`vsmi-press flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium leading-none transition ${
                (pathname !== "/perso" && pathname !== "/commun" && pathname !== "/aujourd-hui") || panel === "photo"
                  ? isToday ? "bg-[#D2AE57] text-black" : "bg-neutral-900 text-white"
                  : isToday ? "text-white/55" : "text-neutral-500"
              }`}
            >
              <Camera size={ICON_SIZE} strokeWidth={1.9} />
              <span className="text-[10px] font-medium leading-none">Photo</span>
            </button>
          ) : (
            <div aria-hidden="true" />
          )}
        </div>
      </nav>
    </>
  );
}
