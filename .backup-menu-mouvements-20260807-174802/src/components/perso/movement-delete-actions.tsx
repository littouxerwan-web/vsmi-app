"use client";

import { Trash2 } from "lucide-react";
import {
  deleteItem,
  deleteMovementOccurrence,
  deleteRecurrenceSeriesFrom,
} from "@/app/(app)/perso/actions";

type Props = {
  movementId?: string | null;
  recurrenceId?: string | null;
  occurrenceDate: string;
  projected?: boolean;
};

export function MovementDeleteActions({
  movementId = null,
  recurrenceId = null,
  occurrenceDate,
  projected = false,
}: Props) {
  if (recurrenceId) {
    return (
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
          <Trash2 size={14} />
          Supprimer
        </summary>
        <div className="mt-2 grid min-w-[210px] gap-2 rounded-xl border border-red-100 bg-white p-2 shadow-lg">
          <form
            action={deleteMovementOccurrence.bind(
              null,
              projected ? null : movementId,
              recurrenceId,
              occurrenceDate,
            )}
          >
            <button className="w-full rounded-lg border border-red-200 px-3 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-50">
              Ce mois-ci uniquement
            </button>
          </form>

          <form action={deleteRecurrenceSeriesFrom.bind(null, recurrenceId, occurrenceDate)}>
            <button className="w-full rounded-lg bg-red-700 px-3 py-2 text-left text-xs font-medium text-white hover:bg-red-800">
              Toute la série
            </button>
          </form>

          <p className="px-1 text-[11px] leading-4 text-neutral-500">
            Toute la série conserve les échéances antérieures et arrête la récurrence à partir de celle-ci.
          </p>
        </div>
      </details>
    );
  }

  if (projected || !movementId) return null;

  return (
    <form action={deleteItem.bind(null, "personal_movements", movementId)}>
      <button
        title="Supprimer ce mouvement"
        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        <Trash2 size={14} />
        Supprimer
      </button>
    </form>
  );
}
