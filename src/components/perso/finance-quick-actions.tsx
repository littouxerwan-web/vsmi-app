"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Plus, X } from "lucide-react";

type Props = { debitForm: ReactNode; creditForm: ReactNode; categoryForm: ReactNode };
type Modal = "choice" | "debit" | "credit" | "category" | null;

export function FinanceQuickActions({ debitForm, creditForm, categoryForm }: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("quick") !== "movement") return;
    setModal("choice");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("quick");
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
      : modal === "category"
        ? "Ajouter une catégorie"
        : "Ajouter une opération";

  return <>
    <div className="flex flex-wrap gap-2">
      <Action label="+ Débit" onClick={() => setModal("debit")} primary />
      <Action label="+ Crédit" onClick={() => setModal("credit")} />
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
            <button type="button" onClick={() => setModal("debit")} className="flex min-h-16 items-center gap-4 border border-black bg-black px-5 text-left text-white">
              <ArrowUpRight size={22}/><span><span className="block font-semibold">Ajouter un débit</span><span className="block text-sm text-white/65">Dépense ou sortie d’argent</span></span>
            </button>
            <button type="button" onClick={() => setModal("credit")} className="flex min-h-16 items-center gap-4 border border-black/15 bg-white px-5 text-left">
              <ArrowDownLeft size={22}/><span><span className="block font-semibold">Ajouter un crédit</span><span className="block text-sm text-neutral-500">Revenu ou entrée d’argent</span></span>
            </button>
          </div> : modal === "debit" ? debitForm : modal === "credit" ? creditForm : categoryForm}
        </div>
      </div>
    </div> : null}
  </>;
}

function Action({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-10 items-center gap-1.5 border px-4 py-2 text-sm font-semibold ${primary ? "border-black bg-black text-white" : "border-black/15 bg-white"}`}><Plus size={15}/>{label.replace(/^\+\s*/, "")}</button>;
}
