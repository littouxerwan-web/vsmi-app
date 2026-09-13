"use client";

import { ChevronDown, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

export type WeddingMomentOption = { type: string; label: string };
export type WeddingMomentValue = WeddingMomentOption & { location: string; time: string };

type Row = WeddingMomentValue & { key: string; editing: boolean };

export function WeddingMomentsEditor({ options, initialMoments }: { options: WeddingMomentOption[]; initialMoments: WeddingMomentValue[] }) {
  const [rows, setRows] = useState<Row[]>(() => initialMoments.map((m, i) => ({ ...m, key: `${m.type}-${i}`, editing: false })));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<WeddingMomentValue>({ type: options[0]?.type ?? "", label: options[0]?.label ?? "", location: "", time: "" });

  const sortedRows = useMemo(() => [...rows].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")), [rows]);
  const usedTypes = new Set(rows.map((row) => row.type));
  const available = options.filter((option) => !usedTypes.has(option.type));

  function addRow() {
    if (!draft.type || usedTypes.has(draft.type)) return;
    const option = options.find((item) => item.type === draft.type);
    setRows((current) => [...current, { ...draft, label: option?.label ?? draft.label, key: `${draft.type}-${Date.now()}`, editing: false }]);
    const next = options.find((item) => item.type !== draft.type && !usedTypes.has(item.type));
    setDraft({ type: next?.type ?? "", label: next?.label ?? "", location: "", time: "" });
    setAdding(false);
  }

  function patch(key: string, values: Partial<Row>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...values } : row));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="dynamic_moments" value="1" />
      {sortedRows.map((row) => (
        <div key={row.key} className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
          <input type="hidden" name="moment_type" value={row.type} />
          <input type="hidden" name="moment_location" value={row.location} />
          <input type="hidden" name="moment_time" value={row.time} />
          {row.editing ? (
            <div className="grid gap-3 md:grid-cols-[190px_130px_1fr_auto] md:items-end">
              <label className="block"><span className="text-xs font-medium text-neutral-500">Temps fort</span><select value={row.type} onChange={(e) => { const option = options.find((o) => o.type === e.target.value); patch(row.key, { type: e.target.value, label: option?.label ?? "" }); }} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-3">{options.map((o) => <option key={o.type} value={o.type} disabled={o.type !== row.type && usedTypes.has(o.type)}>{o.label}</option>)}</select></label>
              <label className="block"><span className="text-xs font-medium text-neutral-500">Horaire</span><input type="time" value={row.time} onChange={(e) => patch(row.key, { time: e.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-3" /></label>
              <label className="block"><span className="text-xs font-medium text-neutral-500">Lieu (facultatif)</span><input value={row.location} onChange={(e) => patch(row.key, { location: e.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-3" /></label>
              <button type="button" onClick={() => patch(row.key, { editing: false })} className="min-h-11 rounded-xl bg-black px-4 text-sm font-medium text-white">OK</button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-14 shrink-0 text-base font-semibold tabular-nums">{row.time || "--:--"}</div>
              <div className="min-w-0 flex-1"><p className="font-semibold">{row.label}</p>{row.location ? <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-neutral-500"><MapPin size={14} />{row.location}</p> : null}</div>
              <button type="button" title="Modifier" onClick={() => patch(row.key, { editing: true })} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white"><Pencil size={16} /></button>
              <button type="button" title="Supprimer" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-white text-red-700"><Trash2 size={16} /></button>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="rounded-2xl border border-dashed border-black/20 p-4">
          <div className="grid gap-3 md:grid-cols-[190px_130px_1fr_auto] md:items-end">
            <label className="block"><span className="text-xs font-medium text-neutral-500">Temps fort</span><select value={draft.type} onChange={(e) => { const option = options.find((o) => o.type === e.target.value); setDraft((d) => ({ ...d, type: e.target.value, label: option?.label ?? "" })); }} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-3">{available.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}</select></label>
            <label className="block"><span className="text-xs font-medium text-neutral-500">Horaire</span><input type="time" value={draft.time} onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-3" /></label>
            <label className="block"><span className="text-xs font-medium text-neutral-500">Lieu (facultatif)</span><input value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-3" /></label>
            <div className="flex gap-2"><button type="button" onClick={addRow} disabled={!draft.type} className="min-h-11 rounded-xl bg-black px-4 text-sm font-medium text-white disabled:opacity-40">Ajouter</button><button type="button" onClick={() => setAdding(false)} className="min-h-11 rounded-xl border border-black/10 px-3 text-sm">Annuler</button></div>
          </div>
        </div>
      ) : available.length > 0 ? (
        <button type="button" onClick={() => { const first = available[0]; setDraft({ type: first.type, label: first.label, location: "", time: "" }); setAdding(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 px-4 text-sm font-medium hover:bg-neutral-50"><Plus size={17} /> Ajouter un temps fort <ChevronDown size={15} /></button>
      ) : null}
      {rows.length === 0 && !adding ? <p className="text-sm text-neutral-500">Aucun temps fort renseigné.</p> : null}
    </div>
  );
}
