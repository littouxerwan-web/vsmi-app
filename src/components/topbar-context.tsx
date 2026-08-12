"use client";

import { usePathname, useSearchParams } from "next/navigation";

const currentMonthLabel = () =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "Europe/Paris" })
    .format(new Date())
    .replace(/^./, (c) => c.toUpperCase());

export function TopbarContext() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vue = searchParams.get("vue") ?? "finances";
  const accountName = searchParams.get("account_name");
  const month = currentMonthLabel();

  let section = "Aujourd’hui";
  let detail: string | null = null;

  if (pathname === "/perso") {
    section = "MES COMPTES";
    if (vue === "finances") detail = accountName ? `${month} · ${accountName}` : `${month} · Tous les comptes`;
    else if (vue === "projection") detail = "Projection";
    else if (vue === "analyse") detail = "Analyse";
    else if (vue === "parametres") detail = "Paramètres";
  } else if (pathname === "/commun") {
    section = "COMMUN";
    detail = vue === "budget" ? "Budget" : month;
  } else if (pathname === "/mariages") section = "MARIAGES";
  else if (pathname === "/agenda") section = "AGENDA";
  else if (pathname === "/comptabilite") section = "COMPTABILITÉ PHOTO";
  else if (pathname === "/enfants") section = "ENFANTS";
  else if (pathname === "/osteo") section = "OSTEO";
  else if (pathname === "/aujourd-hui") section = "AUJOURD’HUI";

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-2 lg:flex">
      <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[.16em] text-[#D2AE57]">{section}</span>
      {detail ? <><span className="text-white/25">•</span><span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[.12em] text-white/65">{detail}</span></> : null}
    </div>
  );
}
