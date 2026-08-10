"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  PiggyBank,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  createTodayCommonMovement,
  createTodayPersonalMovement,
  saveDashboardColors,
  saveDashboardOrder,
} from "@/app/(app)/aujourd-hui/actions";

type Category = { id: string; name: string; movement_type: "income" | "expense"; account_id?: string | null };
type Tile = {
  key: string;
  id: string | null;
  name: string;
  type: "checking" | "savings" | "crypto" | "common";
  balance: number;
  monthEnd: number;
  afterSavings: number;
  savingsUseProposed?: number;
  href: string;
};
type Wedding = { id: string; name: string; date: string; city: string | null };
type TileColor = "black" | "gold" | "silver";

type Props = {
  tiles: Tile[];
  personalCategories: Category[];
  commonCategories: Category[];
  initialOrder: string[];
  initialColors?: Record<string, TileColor>;
  weddings?: Wedding[];
  weddingStats?: { upcoming: number; receivedMonth: number; expectedYear: number } | null;
};

const money = (value: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

function orderedTiles(tiles: Tile[], order: string[]) {
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...tiles].sort((a, b) => {
    const ar = rank.has(a.key) ? rank.get(a.key)! : 10_000;
    const br = rank.has(b.key) ? rank.get(b.key)! : 10_000;
    if (ar !== br) return ar - br;
    return tiles.findIndex((tile) => tile.key === a.key) - tiles.findIndex((tile) => tile.key === b.key);
  });
}

function defaultTone(type: Tile["type"], index: number): TileColor {
  if (type === "savings") return "gold";
  if (type === "crypto" || type === "common") return "silver";
  return index % 2 === 0 ? "black" : "black";
}

const toneClasses: Record<TileColor, string> = {
  black: "border-[#4B4B4B] bg-[#111111] text-white",
  gold: "border-[#D2AE57] bg-[#D2AE57] text-black",
  silver: "border-[#BFC2C7] bg-[#D7D9DD] text-black",
};

const typeLabel = (type: Tile["type"]) => type === "common" ? "Commun" : type === "checking" ? "Courant" : type === "savings" ? "Épargne" : "Crypto";

export function TodayDashboard({
  tiles,
  personalCategories,
  commonCategories,
  initialOrder,
  initialColors = {},
  weddings = [],
  weddingStats = null,
}: Props) {
  const [order, setOrder] = useState(() => orderedTiles(tiles, initialOrder).map((tile) => tile.key));
  const [colors, setColors] = useState<Record<string, TileColor>>(initialColors);
  const [organizing, setOrganizing] = useState(false);
  const [movementTile, setMovementTile] = useState<Tile | null>(null);
  const [movementType, setMovementType] = useState<"expense" | "income">("expense");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const sorted = useMemo(() => orderedTiles(tiles, order), [tiles, order]);

  const move = (key: string, delta: number) => {
    const next = [...order];
    const from = next.indexOf(key);
    if (from < 0) return;
    const to = from + delta;
    if (to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    setOrder(next);
    startTransition(async () => {
      try { await saveDashboardOrder(next); } catch { setFeedback("Impossible d’enregistrer l’ordre."); }
    });
  };

  const setTileColor = (key: string, color: TileColor) => {
    const next = { ...colors, [key]: color };
    setColors(next);
    startTransition(async () => {
      try { await saveDashboardColors(next); } catch { setFeedback("Impossible d’enregistrer la couleur."); }
    });
  };

  const categories = movementTile?.type === "common"
    ? commonCategories
    : personalCategories.filter((category) => !category.account_id || category.account_id === movementTile?.id);

  const submitMovement = (fd: FormData) => {
    if (!movementTile) return;
    fd.set("movement_type", movementType);
    if (movementTile.id) fd.set("account_id", movementTile.id);
    setFeedback(null);
    startTransition(async () => {
      try {
        if (movementTile.type === "common") await createTodayCommonMovement(fd);
        else await createTodayPersonalMovement(fd);
        setMovementTile(null);
        setFeedback("Mouvement enregistré.");
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Impossible d’enregistrer le mouvement.");
      }
    });
  };

  const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.22em] text-[#D2AE57]">Comptes</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Vue instantanée</h2>
          </div>
          <button
            type="button"
            onClick={() => setOrganizing((value) => !value)}
            className={`vsmi-press inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${organizing ? "border-[#D2AE57] bg-[#D2AE57] text-black" : "border-white/15 bg-white/[.07] text-white"}`}
          >
            <SlidersHorizontal size={15}/>{organizing ? "Terminé" : "Organiser"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {sorted.map((tile, index) => {
            const tone = colors[tile.key] ?? defaultTone(tile.type, index);
            const useProposed = Number(tile.savingsUseProposed ?? 0);
            return (
              <article
                key={tile.key}
                className={`relative min-h-[11.2rem] overflow-hidden rounded-[1.45rem] border p-3.5 shadow-[0_10px_28px_rgba(0,0,0,.18)] sm:min-h-[11.6rem] sm:p-4 ${toneClasses[tone]}`}
              >
                {!organizing ? <Link href={tile.href} className="absolute inset-0 z-0" aria-label={`Ouvrir ${tile.name}`}/> : null}
                <div className="relative z-10 flex h-full flex-col pointer-events-none">
                  <div className="flex min-h-[3rem] items-start justify-between gap-2">
                    <div className="min-w-0 pr-1">
                      <p className="line-clamp-2 text-[14px] font-semibold leading-[1.08] sm:text-[15px]">{tile.name}</p>
                      <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[.16em] opacity-55">{typeLabel(tile.type)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMovementTile(tile); setMovementType("expense"); }}
                      className="pointer-events-auto grid size-8 shrink-0 place-items-center rounded-full border border-current/20 bg-white/12 backdrop-blur transition hover:bg-white/25"
                      aria-label={`Ajouter un mouvement sur ${tile.name}`}
                    >
                      <Plus size={17}/>
                    </button>
                  </div>

                  <div className="mt-auto space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[9px] uppercase tracking-[.11em] opacity-55">Aujourd’hui</span>
                      <strong className="truncate text-[12px] font-semibold sm:text-[13px]">{money(tile.balance)}</strong>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 border-t border-current/10 pt-1.5">
                      <span className="text-[9px] uppercase tracking-[.11em] opacity-55">Fin de mois</span>
                      <strong className={`truncate text-[12px] font-semibold sm:text-[13px] ${tile.monthEnd < 0 ? "text-red-500" : ""}`}>{money(tile.monthEnd)}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] uppercase tracking-[.11em] opacity-55">Après épargne</span>
                      <span className="flex min-w-0 items-center justify-end gap-1.5">
                        <strong className={`truncate text-[12px] font-semibold sm:text-[13px] ${tile.afterSavings < 0 ? "text-red-500" : tone === "black" && tile.type === "checking" ? "text-[#E3C97E]" : ""}`}>{money(tile.afterSavings)}</strong>
                        {useProposed > 0 ? (
                          <span className="pointer-events-auto inline-flex shrink-0" title={`Utilisation d’épargne proposée : ${money(useProposed)}`} aria-label={`Utilisation d’épargne proposée : ${money(useProposed)}`}>
                            <PiggyBank size={15} className={tone === "black" ? "text-[#E3C97E]" : "text-red-700"}/>
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>

                  {organizing ? (
                    <div className="pointer-events-auto mt-3 border-t border-current/10 pt-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1.5" aria-label={`Couleur de ${tile.name}`}>
                          {(["black", "gold", "silver"] as TileColor[]).map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setTileColor(tile.key, color)}
                              disabled={pending}
                              className={`size-6 rounded-full border-2 ${color === "black" ? "bg-black" : color === "gold" ? "bg-[#D2AE57]" : "bg-[#D7D9DD]"} ${(colors[tile.key] ?? defaultTone(tile.type, index)) === color ? "border-white ring-1 ring-black/40" : "border-black/15"}`}
                              aria-label={color === "black" ? "Noir" : color === "gold" ? "Or" : "Argent"}
                            />
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => move(tile.key, -1)} disabled={index === 0 || pending} className="grid size-7 place-items-center rounded-full border border-current/20 bg-white/12 disabled:opacity-25" aria-label="Déplacer avant"><ArrowLeft size={13}/></button>
                          <button type="button" onClick={() => move(tile.key, 1)} disabled={index === sorted.length - 1 || pending} className="grid size-7 place-items-center rounded-full border border-current/20 bg-white/12 disabled:opacity-25" aria-label="Déplacer après"><ArrowRight size={13}/></button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        {feedback ? <p className="mt-3 text-sm text-white/60">{feedback}</p> : null}
      </section>

      {weddingStats ? (
        <section className="rounded-[1.6rem] border border-[#D2AE57]/30 bg-[#141414] p-4 text-white shadow-[0_18px_50px_rgba(0,0,0,.28)] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[#D2AE57]">Photo</p>
              <h2 className="mt-1 text-xl font-semibold">Mariages à venir</h2>
            </div>
            <Link href="/mariages" className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10">Voir tout</Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/[.06] p-3"><p className="text-[9px] uppercase tracking-wide text-white/45">À venir</p><p className="mt-1 text-xl font-semibold">{weddingStats.upcoming}</p></div>
            <div className="rounded-2xl bg-white/[.06] p-3"><p className="text-[9px] uppercase tracking-wide text-white/45">Ce mois</p><p className="mt-1 text-xs font-semibold text-[#D2AE57] sm:text-sm">{money(weddingStats.receivedMonth)}</p></div>
            <div className="rounded-2xl bg-white/[.06] p-3"><p className="text-[9px] uppercase tracking-wide text-white/45">À venir année</p><p className="mt-1 text-xs font-semibold text-[#D7D9DD] sm:text-sm">{money(weddingStats.expectedYear)}</p></div>
          </div>
          <div className="mt-3 space-y-2">
            {weddings.length ? weddings.slice(0, 3).map((wedding) => (
              <Link key={wedding.id} href={`/mariages/${wedding.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.035] px-3.5 py-3 transition hover:bg-white/[.07]">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{wedding.name}</p><p className="mt-1 truncate text-[11px] text-white/45">{wedding.city || "Ville à définir"}</p></div>
                <p className="shrink-0 text-xs font-semibold text-[#D2AE57]">{new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(`${wedding.date}T12:00:00`))}</p>
              </Link>
            )) : <p className="rounded-2xl bg-white/[.05] p-4 text-sm text-white/55">Aucun mariage à venir.</p>}
          </div>
        </section>
      ) : null}

      {movementTile ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onPointerDown={(event) => { if (event.target === event.currentTarget && !pending) setMovementTile(null); }}>
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-5 text-black shadow-2xl sm:max-w-lg sm:rounded-[2rem] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-400">Nouveau mouvement</p><h3 className="mt-1 text-xl font-semibold">{movementTile.name}</h3></div>
              <button type="button" onClick={() => !pending && setMovementTile(null)} className="grid size-10 place-items-center rounded-full bg-neutral-100" aria-label="Fermer"><X size={18}/></button>
            </div>
            <div className="mt-5 grid grid-cols-2 rounded-2xl bg-neutral-100 p-1">
              <button type="button" onClick={() => setMovementType("expense")} className={`min-h-10 rounded-xl text-sm font-semibold ${movementType === "expense" ? "bg-black text-white shadow-sm" : "text-neutral-500"}`}>Débit</button>
              <button type="button" onClick={() => setMovementType("income")} className={`min-h-10 rounded-xl text-sm font-semibold ${movementType === "income" ? "bg-black text-white shadow-sm" : "text-neutral-500"}`}>Crédit</button>
            </div>
            <form action={submitMovement} className="mt-5 grid gap-4">
              <label className="text-sm font-medium">Libellé<input name="label" required className="mt-1.5 min-h-12 w-full rounded-xl border border-black/10 px-3"/></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">Montant<input name="amount" type="number" min="0.01" step="0.01" required className="mt-1.5 min-h-12 w-full rounded-xl border border-black/10 px-3"/></label>
                <label className="text-sm font-medium">Date<input name="movement_date" type="date" defaultValue={today} required className="mt-1.5 min-h-12 w-full rounded-xl border border-black/10 px-3"/></label>
              </div>
              <label className="text-sm font-medium">Catégorie<select name="category_id" className="mt-1.5 min-h-12 w-full rounded-xl border border-black/10 bg-white px-3"><option value="">Sans catégorie</option>{categories.filter((category) => category.movement_type === movementType).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="text-sm font-medium">État<select name="status" defaultValue="planned" className="mt-1.5 min-h-12 w-full rounded-xl border border-black/10 bg-white px-3"><option value="planned">Prévu</option><option value="completed">Déjà débité / crédité</option></select></label>
              <button disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-black px-4 font-semibold text-white disabled:opacity-50"><Check size={17}/>{pending ? "Enregistrement…" : "Enregistrer"}</button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
