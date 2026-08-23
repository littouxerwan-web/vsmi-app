"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarClock, Plus, X } from "lucide-react";

type Props = {
  debitForm: ReactNode;
  debitRecurringForm: ReactNode;
  creditForm: ReactNode;
  creditRecurringForm: ReactNode;
  transferForm: ReactNode;
  transferRecurringForm: ReactNode;
  categoryForm: ReactNode;
};
type Modal = "choice" | "debit" | "credit" | "transfer" | "category" | null;
type MovementMode = "oneoff" | "recurring";

export function FinanceQuickActions({ debitForm, debitRecurringForm, creditForm, creditRecurringForm, transferForm, transferRecurringForm, categoryForm }: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const [movementMode, setMovementMode] = useState<MovementMode>("oneoff");
  const searchParams = useSearchParams();
  const router = useRouter();

  const openMovement = (next: "debit" | "credit") => {
    setMovementMode("oneoff");
    setModal(next);
  };

  useEffect(() => {
    const quick = searchParams.get("quick");
    if (!quick || !["movement", "debit", "credit"].includes(quick)) return;
    setMovementMode("oneoff");
    setModal(quick === "debit" ? "debit" : quick === "credit" ? "credit" : "choice");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("quick");
    params.delete("account_id");
    router.replace(params.size ? `/perso?${params.toString()}` : "/perso", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (!modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => event.key === "Escape" && setModal(null);
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [modal]);

  const title = modal === "debit"
    ? "Ajouter un débit"
    : modal === "credit"
      ? "Ajouter un crédit"
      : modal === "transfer"
        ? "Ajouter un virement interne"
        : modal === "category"
          ? "Ajouter une catégorie ou un budget"
          : "Ajouter une opération";

  const movementForm = modal === "debit"
    ? (movementMode === "recurring" ? debitRecurringForm : debitForm)
    : modal === "credit"
      ? (movementMode === "recurring" ? creditRecurringForm : creditForm)
      : null;

  return <>
    <div className="flex flex-wrap gap-2">
      <Action label="+ Débit" onClick={() => openMovement("debit")} primary />
      <Action label="+ Crédit" onClick={() => openMovement("credit")} />
      <Action label="+ Virement interne" onClick={() => {setMovementMode("oneoff");setModal("transfer");}} />
      <Action label="+ Catégorie" onClick={() => setModal("category")} />
    </div>

    {modal ? <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onMouseDown={event => event.currentTarget === event.target && setModal(null)}>
      <div className={`max-h-[calc(100dvh-5rem)] w-full overflow-y-auto bg-white shadow-2xl ${modal === "choice" ? "sm:max-w-md" : "sm:max-w-3xl"}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white px-5 py-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={() => setModal(null)} className="grid size-10 place-items-center bg-neutral-100" aria-label="Fermer"><X size={19}/></button>
        </div>
        <div className="p-5 sm:p-6">
          {modal === "choice" ? <div className="grid gap-3">
            <button type="button" onClick={() => openMovement("debit")} className="flex min-h-16 items-center gap-4 border border-black bg-black px-5 text-left text-white">
              <ArrowUpRight size={22}/><span><span className="block font-semibold">Ajouter un débit</span><span className="block text-sm text-white/65">Dépense ponctuelle ou régulière</span></span>
            </button>
            <button type="button" onClick={() => openMovement("credit")} className="flex min-h-16 items-center gap-4 border border-black/15 bg-white px-5 text-left">
              <ArrowDownLeft size={22}/><span><span className="block font-semibold">Ajouter un crédit</span><span className="block text-sm text-neutral-500">Revenu ponctuel ou régulier</span></span>
            </button>
            <button type="button" onClick={() => setModal("transfer")} className="flex min-h-16 items-center gap-4 border border-black/15 bg-white px-5 text-left">
              <ArrowLeftRight size={22}/><span><span className="block font-semibold">Ajouter un virement interne</span><span className="block text-sm text-neutral-500">Transférer entre deux de tes comptes</span></span>
            </button>
          </div> : modal === "debit" || modal === "credit" ? <>
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1">
              <button type="button" onClick={() => setMovementMode("oneoff")} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${movementMode === "oneoff" ? "bg-white shadow-sm" : "text-neutral-500"}`}>Ponctuel</button>
              <button type="button" onClick={() => setMovementMode("recurring")} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold ${movementMode === "recurring" ? "bg-white shadow-sm" : "text-neutral-500"}`}><CalendarClock size={16}/>Régulier</button>
            </div>
            {movementForm}
          </> : modal === "transfer" ? <><div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1"><button type="button" onClick={()=>setMovementMode("oneoff")} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${movementMode==="oneoff"?"bg-white shadow-sm":"text-neutral-500"}`}>Ponctuel</button><button type="button" onClick={()=>setMovementMode("recurring")} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold ${movementMode==="recurring"?"bg-white shadow-sm":"text-neutral-500"}`}><CalendarClock size={16}/>Régulier</button></div>{movementMode==="recurring"?transferRecurringForm:transferForm}</> : categoryForm}
        </div>
      </div>
    </div> : null}
  </>;
}

function Action({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-10 items-center gap-1.5 border px-4 py-2 text-sm font-semibold ${primary ? "border-black bg-black text-white" : "border-black/15 bg-white"}`}><Plus size={15}/>{label.replace(/^\+\s*/, "")}</button>;
}
