import Image from "next/image";
import Link from "next/link";

const items = [
  ["Aujourd’hui", "/aujourd-hui"],
  ["Prospects", "/prospects"],
  ["Clients", "/clients"],
  ["Agenda", "/agenda"],
  ["Comptabilité", "/comptabilite"],
  ["Paramètres", "/parametres"]
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="shell">
    <aside className="sidebar">
      <Image src="/vsmi-logo.gif" alt="Logo VSMI" width={220} height={260} className="logo" unoptimized />
      <div className="brand">VSMI</div>
      <nav className="nav">{items.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
    </aside>
    <main className="main">{children}</main>
  </div>;
}
