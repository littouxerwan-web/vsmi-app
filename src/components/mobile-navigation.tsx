"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CircleDollarSign,
  HeartHandshake,
  LayoutDashboard,
  LockKeyhole,
  Plus,
} from "lucide-react";

const items = [
  { href: "/aujourd-hui", label: "Aujourd’hui", icon: LayoutDashboard },
  { href: "/mariages", label: "Mariages", icon: HeartHandshake },
  { href: "/mariages/nouveau", label: "Ajouter", icon: Plus, primary: true },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/perso", label: "Perso", icon: LockKeyhole },
];

export function MobileNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/mariages"
            ? pathname === "/mariages" || pathname.startsWith("/mariages/")
            : pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition ${
                item.primary
                  ? "bg-black text-white"
                  : active
                    ? "bg-neutral-100 text-black"
                    : "text-neutral-500 hover:bg-neutral-50 hover:text-black"
              }`}
            >
              <Icon size={item.primary ? 21 : 19} strokeWidth={1.9} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
