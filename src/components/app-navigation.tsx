import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  CircleDollarSign,
  HeartHandshake,
  LayoutDashboard,
  Settings,
} from "lucide-react";

const navigation = [
  { href: "/aujourd-hui", label: "Aujourd’hui", icon: LayoutDashboard },
  { href: "/mariages", label: "Mes Mariages", icon: HeartHandshake },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/comptabilite", label: "Comptabilité", icon: CircleDollarSign },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];

export function AppNavigation() {
  return (
    <aside className="hidden min-h-screen w-64 shrink-0 bg-black text-white lg:flex lg:flex-col">
      <div className="flex justify-center border-b border-white/10 px-7 py-7">
        <Link href="/aujourd-hui" aria-label="Retour à la page Aujourd’hui">
          <Image
            src="/vsmi-logo.gif"
            alt="Vue sur mer imprenable"
            width={150}
            height={150}
            priority
            className="h-auto w-36 object-contain"
          />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-6">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
            >
              <Icon size={19} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-7 py-5">
        <p className="text-xs text-neutral-400">Gestion des mariages</p>
      </div>
    </aside>
  );
}
