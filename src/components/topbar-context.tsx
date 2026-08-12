"use client";

import { usePathname, useSearchParams } from "next/navigation";

const currentMonthLabel = () =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "Europe/Paris" })
    .format(new Date())
    .replace(/^./, (c) => c.toUpperCase());

export function TopbarContext({ mobile = false }: { mobile?: boolean }) {
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

  if (mobile) {
    return (
      <div className="vsmi-topbar-context pointer-events-none flex min-w-0 items-center justify-center gap-1.5 px-4 text-center lg:hidden">
        <span className="truncate text-[9px] font-semibold uppercase tracking-[.14em] text-[#D2AE57]">{section}</span>
        {detail ? <><span className="vsmi-topbar-separator shrink-0 text-white/20">•</span><span className="vsmi-topbar-detail truncate text-[9px] font-medium uppercase tracking-[.09em] text-white/60">{detail}</span></> : null}
      </div>
    );
  }

  return (
    <div className="vsmi-topbar-context pointer-events-none absolute right-1/2 top-1/2 mr-[4.75rem] hidden max-w-[11rem] -translate-y-1/2 items-center justify-end gap-2 xl:max-w-[20rem] 2xl:max-w-[26rem] lg:flex">
      <span className="truncate text-[11px] font-semibold uppercase tracking-[.16em] text-[#D2AE57]">{section}</span>
      {detail ? <><span className="shrink-0 text-white/25">•</span><span className="vsmi-topbar-detail truncate text-[11px] font-medium uppercase tracking-[.12em] text-white/65">{detail}</span></> : null}
    </div>
  );
}
