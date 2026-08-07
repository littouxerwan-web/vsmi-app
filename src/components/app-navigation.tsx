import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Camera, CircleDollarSign, HeartHandshake, LayoutDashboard, Sparkles, TrendingUp } from "lucide-react";

const persoNavigation = [
  { href: "/perso?vue=finances", label: "En cours", icon: CircleDollarSign },
  { href: "/perso?vue=projection", label: "Projection", icon: TrendingUp },
  { href: "/perso?vue=epargne", label: "Potentiel d’épargne", icon: Sparkles },
];
const photoNavigation = [
  { href: "/aujourd-hui", label: "Aujourd’hui", icon: LayoutDashboard },
  { href: "/mariages", label: "Mes Mariages", icon: HeartHandshake },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/comptabilite", label: "Comptabilité photo", icon: CircleDollarSign },
];

function NavLink({ item }: { item: (typeof persoNavigation)[number] }) {
  const Icon = item.icon;
  return <Link href={item.href} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"><Icon size={19} strokeWidth={1.8}/>{item.label}</Link>;
}

export function AppNavigation({ photoAccess = false }: { photoAccess?: boolean }) {
  return <aside className="hidden min-h-screen w-64 shrink-0 bg-black text-white lg:flex lg:flex-col">
    <div className="flex justify-center border-b border-white/10 px-7 py-7"><Link href="/perso?vue=finances"><Image src="/vsmi-logo.gif" alt="Vue sur mer imprenable" width={150} height={150} priority className="h-auto w-36 object-contain"/></Link></div>
    <nav className="flex-1 px-4 py-6">
      <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-[.2em] text-neutral-500">Personnel</p>
      <div className="space-y-1">{persoNavigation.map(item=><NavLink key={item.href} item={item}/>)}</div>
      {photoAccess ? <details className="group mt-6" open>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"><span className="flex items-center gap-3"><Camera size={19}/>PHOTO</span><span className="text-lg transition group-open:rotate-45">+</span></summary>
        <div className="mt-1 space-y-1 border-l border-white/15 pl-2">{photoNavigation.map(item=><NavLink key={item.href} item={item}/>)}</div>
      </details> : null}
    </nav>
    <div className="border-t border-white/10 px-7 py-5"><p className="text-xs text-neutral-400">PERSO au premier plan</p></div>
  </aside>;
}
