"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, PiggyBank, Plus, Tags, X } from "lucide-react";

type MovementTab = "movement" | "recurrence" | "transfer";

type Props = {
  movementForm: ReactNode;
  recurrenceForm: ReactNode;
  transferForm: ReactNode;
  categoryForm: ReactNode;
};

export function FinanceQuickActions({
  movementForm,
  recurrenceForm,
  transferForm,
  categoryForm,
}: Props) {
  const [modal, setModal] = useState<"movement" | "category" | null>(null);
  const [tab, setTab] = useState<MovementTab>("movement");
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("quick") !== "movement") return;
    setTab("movement");
    setModal("movement");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("quick");
    router.replace(params.size ? `/perso?${params.toString()}` : "/perso", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (!modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [modal]);

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => {
            setTab("movement");
            setModal("movement");
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800"
        >
          <Plus size={17} />
          Créer un mouvement
        </button>
        <button
          type="button"
          onClick={() => setModal("category")}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm transition hover:bg-neutral-50"
        >
          <Tags size={17} />
          Créer une catégorie
        </button>
      </div>

      {modal ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setModal(null);
          }}
        >
          <div className="max-h-[calc(100dvh-5.25rem-env(safe-area-inset-bottom))] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[92vh] sm:max-w-3xl sm:rounded-3xl sm:pb-0">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
                  Action rapide
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {modal === "movement" ? "Créer un mouvement" : "Créer une catégorie"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="grid size-10 place-items-center rounded-full bg-neutral-100 transition hover:bg-neutral-200"
                aria-label="Fermer"
              >
                <X size={19} />
              </button>
            </div>

            {modal === "movement" ? (
              <div className="p-5 sm:p-6">
                <div className="mb-6 grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1.5 sm:gap-2">
                  <TabButton
                    active={tab === "movement"}
                    onClick={() => setTab("movement")}
                    icon={<Plus size={15} />}
                    label="Ponctuel"
                  />
                  <TabButton
                    active={tab === "recurrence"}
                    onClick={() => setTab("recurrence")}
                    icon={<CalendarClock size={15} />}
                    label="Périodique"
                  />
                  <TabButton
                    active={tab === "transfer"}
                    onClick={() => setTab("transfer")}
                    icon={<PiggyBank size={15} />}
                    label="Virement"
                  />
                </div>
                {tab === "movement"
                  ? movementForm
                  : tab === "recurrence"
                    ? recurrenceForm
                    : transferForm}
              </div>
            ) : (
              <div className="p-5 sm:p-6">{categoryForm}</div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition sm:text-sm ${
        active ? "bg-white text-black shadow-sm" : "text-neutral-500 hover:text-black"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
