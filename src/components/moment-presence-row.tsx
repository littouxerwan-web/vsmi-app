"use client";

import { Navigation } from "lucide-react";
import { useState } from "react";

export function MomentPresenceRow({
  type,
  label,
  location,
  time,
  present,
}: {
  type: string;
  label: string;
  location: string;
  time: string;
  present: boolean;
}) {
  const [isPresent, setIsPresent] = useState(present);

  return (
    <div className={`grid gap-4 rounded-2xl border p-4 transition md:grid-cols-[170px_1fr_130px_170px] md:items-end ${isPresent ? "border-black/10 bg-neutral-100" : "border-black/10 bg-white"}`}>
      <p className="pb-3 font-semibold">{label}</p>
      <div>
        <label className="block">
          <span className="text-sm font-medium">Lieu</span>
          <input name={`${type}_location`} defaultValue={location} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:border-black" />
        </label>
        {location ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-neutral-600 hover:text-black"><Navigation size={14} /> Naviguer</a> : null}
      </div>
      <label className="block">
        <span className="text-sm font-medium">Horaire</span>
        <input name={`${type}_time`} type="time" defaultValue={time} className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-3 outline-none focus:border-black" />
      </label>
      <label className="mb-3 inline-flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name={`${type}_present`} checked={isPresent} onChange={(event) => setIsPresent(event.target.checked)} className="h-4 w-4" />
        Présent
      </label>
    </div>
  );
}
