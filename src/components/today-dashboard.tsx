"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, SlidersHorizontal, X } from "lucide-react";
import { createTodayCommonMovement, createTodayPersonalMovement, saveDashboardOrder } from "@/app/(app)/aujourd-hui/actions";

type Category = { id: string; name: string; movement_type: "income" | "expense"; account_id?: string | null };
type Tile = {
  key: string;
  id: string | null;
  name: string;
  type: "checking" | "savings" | "crypto" | "common";
  balance: number;
  href: string;
};

type Wedding = { id: string; name: string; date: string; city: string | null };

type Props = {
  tiles: Tile[];
  personalCategories: Category[];
  commonCategories: Category[];
  initialOrder: string[];
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

function tileTone(type: Tile["type"], index: number) {
  if (type === "common") return "border-[#BFC2C7] bg-[#E7E8EA] text-black";
  if (type === "savings") return "border-[#C7A45A] bg-[#C7A45A] text-black";
  if (type === "crypto") return "border-[#BFC2C7] bg-[#D8DADD] text-black";
  return index % 2 === 0
    ? "border-black bg-black text-white"
    : "border-[#C7A45A] bg-[#111111] text-white";
}

export function TodayDashboard({ tiles, personalCategories, commonCategories, initialOrder, weddings = [], weddingStats = null }: Props) {
  const [order, setOrder] = useState(() => orderedTiles(tiles, initialOrder).map((tile) => tile.key));
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
    <div className="space-y-7">
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-neutral-500">Comptes</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Vue instantanée</h2>
          </div>
          <button type="button" onClick={() => setOrganizing((value) => !value)} className={`vsmi-press inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${organizing ? "border-black bg-black text-white" : "border-black/10 bg-white text-neutral-700"}`}>
            <SlidersHorizontal size={15}/>{organizing ? "Terminé" : "Organiser"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {sorted.map((tile, index) => (
            <article key={tile.key} className={`relative aspect-square min-h-[9.5rem] overflow-hidden rounded-[1.65rem] border p-4 shadow-[0_10px_35px_rgba(0,0,0,.08)] ${tileTone(tile.type, index)}`}>
              <Link href={tile.href} className="absolute inset-0 z-0" aria-label={`Ouvrir ${tile.name}`}/>
              <div className="relative z-10 flex h-full flex-col justify-between pointer-events-none">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{tile.name}</p>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-[.15em] opacity-55">{tile.type === "common" ? "Commun" : tile.type === "checking" ? "Courant" : tile.type === "savings" ? "Épargne" : "Crypto"}</p>
                    </div>
                    <button type="button" onClick={(event) => { event.preventDefault(); setMovementTile(tile); setMovementType("expense"); }} className="pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full border border-current/20 bg-white/15 backdrop-blur transition hover:bg-white/25" aria-label={`Ajouter un mouvement sur ${tile.name}`}>
                      <Plus size={18}/>
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[.14em] opacity-55">Solde</p>
                  <p className="mt-1 break-words text-[clamp(1.05rem,5vw,1.65rem)] font-semibold tracking-tight">{money(tile.balance)}</p>
                  {organizing ? (
                    <div className="pointer-events-auto mt-3 flex gap-2">
                      <button type="button" onClick={() => move(tile.key, -1)} disabled={index === 0 || pending} className="grid size-8 place-items-center rounded-full border border-current/20 bg-white/15 disabled:opacity-25" aria-label="Déplacer avant"><ArrowLeft size={14}/></button>
                      <button type="button" onClick={() => move(tile.key, 1)} disabled={index === sorted.length - 1 || pending} className="grid size-8 place-items-center rounded-full border border-current/20 bg-white/15 disabled:opacity-25" aria-label="Déplacer après"><ArrowRight size={14}/></button>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
        {feedback ? <p className="mt-3 text-sm text-neutral-600">{feedback}</p> : null}
      </section>

      {weddingStats ? (
        <section className="rounded-[2rem] border border-black/10 bg-black p-5 text-white shadow-[0_18px_50px_rgba(0,0,0,.12)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#C7A45A]">Photo</p>
              <h2 className="mt-1 text-xl font-semibold">Mariages à venir</h2>
            </div>
            <Link href="/mariages" className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10">Voir tout</Link>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/8 p-3"><p className="text-[10px] uppercase tracking-wide text-white/50">À venir</p><p className="mt-1 text-xl font-semibold">{weddingStats.upcoming}</p></div>
            <div className="rounded-2xl bg-white/8 p-3"><p className="text-[10px] uppercase tracking-wide text-white/50">Ce mois</p><p className="mt-1 text-sm font-semibold text-[#C7A45A]">{money(weddingStats.receivedMonth)}</p></div>
            <div className="rounded-2xl bg-white/8 p-3"><p className="text-[10px] uppercase tracking-wide text-white/50">À venir année</p><p className="mt-1 text-sm font-semibold text-[#C9CBCF]">{money(weddingStats.expectedYear)}</p></div>
          </div>
          <div className="mt-4 space-y-2">
            {weddings.length ? weddings.slice(0, 3).map((wedding) => (
              <Link key={wedding.id} href={`/mariages/${wedding.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 transition hover:bg-white/[.08]">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{wedding.name}</p><p className="mt-1 truncate text-xs text-white/45">{wedding.city || "Ville à définir"}</p></div>
                <p className="shrink-0 text-xs font-semibold text-[#C7A45A]">{new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(new Date(`${wedding.date}T12:00:00`))}</p>
              </Link>
            )) : <p className="rounded-2xl bg-white/[.05] p-4 text-sm text-white/55">Aucun mariage à venir.</p>}
          </div>
        </section>
      ) : null}

      {movementTile ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6" onPointerDown={(event) => { if (event.target === event.currentTarget && !pending) setMovementTile(null); }}>
          <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-400">{movementTile.name}</p><h3 className="mt-1 text-xl font-semibold">Nouveau mouvement</h3></div>
              <button type="button" onClick={() => setMovementTile(null)} disabled={pending} className="grid size-10 place-items-center rounded-full bg-neutral-100"><X size={18}/></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">
              <button type="button" onClick={() => setMovementType("expense")} className={`min-h-11 rounded-xl text-sm font-semibold transition ${movementType === "expense" ? "bg-black text-white shadow-sm" : "text-neutral-600"}`}>Débit</button>
              <button type="button" onClick={() => setMovementType("income")} className={`min-h-11 rounded-xl text-sm font-semibold transition ${movementType === "income" ? "bg-[#C7A45A] text-black shadow-sm" : "text-neutral-600"}`}>Crédit</button>
            </div>
            <form action={submitMovement} className="mt-5 grid gap-4">
              <label><span className="mb-1.5 block text-sm font-medium">Libellé</span><input name="label" required className="min-h-12 w-full rounded-xl border border-black/10 px-3"/></label>
              <label><span className="mb-1.5 block text-sm font-medium">Montant</span><input name="amount" type="number" min="0.01" step="0.01" required inputMode="decimal" className="min-h-12 w-full rounded-xl border border-black/10 px-3"/></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-sm font-medium">Date</span><span className="flex min-h-12 w-full min-w-0 items-center rounded-xl border border-black/10 px-3"><input name="movement_date" type="date" defaultValue={today} required className="block w-full min-w-0 border-0 bg-transparent p-0 text-base"/></span></label>
                <label><span className="mb-1.5 block text-sm font-medium">État</span><select name="status" defaultValue="completed" className="min-h-12 w-full rounded-xl border border-black/10 bg-white px-3"><option value="completed">Déjà débité / crédité</option><option value="planned">Prévu</option></select></label>
              </div>
              <label><span className="mb-1.5 block text-sm font-medium">Catégorie</span><select name="category_id" defaultValue="" className="min-h-12 w-full rounded-xl border border-black/10 bg-white px-3"><option value="">Sans catégorie</option>{categories.filter((category) => category.movement_type === movementType).map((category) => <option key={category.id} value={category.id}>{category.name} · {movementType === "income" ? "Crédit" : "Débit"}</option>)}</select></label>
              <button disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-black px-4 font-semibold text-white disabled:opacity-50">{pending ? "Enregistrement…" : <><Check size={17}/>Enregistrer</>}</button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
