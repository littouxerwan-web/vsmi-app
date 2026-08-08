"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Camera,
  CircleDollarSign,
  HeartHandshake,
  LayoutDashboard,
  Plus,
  Sparkles,
  TrendingUp,
  X,
  UsersRound,
  WalletCards,
} from "lucide-react";

const commonItems = [
  { href: "/commun?vue=encours", label: "COMMUN · En cours", icon: WalletCards },
  { href: "/commun?vue=budget", label: "COMMUN · Budget", icon: UsersRound },
];

const photoItems = [
  { href: "/aujourd-hui", label: "Aujourd’hui", icon: LayoutDashboard },
  { href: "/mariages", label: "Mariages", icon: HeartHandshake },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/comptabilite", label: "Comptabilité photo", icon: CircleDollarSign },
];

export function MobileNavigation({ photoAccess = false }: { photoAccess?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [photoOpen, setPhotoOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const view = searchParams.get("vue") ?? "finances";

  useEffect(() => setPhotoOpen(false), [pathname, searchParams]);
  useEffect(() => {
    if (!photoOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setPhotoOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [photoOpen]);

  const persoItem = (href: string, label: string, icon: typeof CircleDollarSign, active: boolean) => {
    const Icon = icon;
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition ${
          active ? "bg-neutral-100 text-black" : "text-neutral-500"
        }`}
      >
        <Icon size={19} strokeWidth={1.9} />
        <span className="whitespace-nowrap">{label}</span>
      </Link>
    );
  };

  return (
    <>
      {photoOpen ? (
        <div
          className="fixed inset-0 z-[80] bg-black/35 lg:hidden"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setPhotoOpen(false);
          }}
        >
          <div
            ref={panelRef}
            className="absolute inset-x-3 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] max-h-[min(70dvh,34rem)] overflow-y-auto overscroll-contain rounded-3xl bg-white p-3 shadow-2xl"
          >
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-400">Navigation</p>
                <p className="mt-1 text-lg font-semibold">COMMUN{photoAccess ? " & PHOTO" : ""}</p>
              </div>
              <button type="button" onClick={() => setPhotoOpen(false)} className="grid size-10 place-items-center rounded-full bg-neutral-100" aria-label="Fermer le menu Photo">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-1">
              {[...commonItems, ...(photoAccess ? photoItems : [])].map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} className={`flex min-h-13 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${active ? "bg-black text-white" : "bg-neutral-50 text-neutral-800"}`}>
                    <Icon size={19} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-[90] border-t border-black/10 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end gap-1">
          {persoItem("/perso?vue=finances", "En cours", CircleDollarSign, pathname === "/perso" && view === "finances")}
          {persoItem("/perso?vue=projection", "Projection", TrendingUp, pathname === "/perso" && view === "projection")}
          <Link href="/perso?vue=finances&quick=movement" aria-label="Ajouter un débit ou un crédit" className="relative -top-3 mx-auto grid size-14 place-items-center rounded-full border-4 border-white bg-black text-white shadow-lg">
            <Plus size={25} strokeWidth={2.2} />
          </Link>
          {persoItem("/perso?vue=epargne", "Épargne", Sparkles, pathname === "/perso" && view === "epargne")}
          <button type="button" onClick={() => setPhotoOpen((open) => !open)} aria-expanded={photoOpen} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition ${pathname === "/commun" ? "bg-neutral-100 text-black" : "text-neutral-500"}`}>
            <UsersRound size={19} strokeWidth={1.9} />
            <span>COMMUN</span>
          </button>
        </div>
      </nav>
    </>
  );
}
