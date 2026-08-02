"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  weddingId: string;
  currentPath: string | null;
  currentUrl: string | null;
};

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function WeddingAttachmentUploader({
  weddingId,
  currentPath,
  currentUrl,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isImage = Boolean(
    currentPath && /\.(jpe?g|png)$/i.test(currentPath),
  );

  async function upload(file: File) {
    setMessage(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setMessage("La pièce jointe doit être un PDF, un JPG ou un PNG.");
      return;
    }

    if (file.size > MAX_SIZE) {
      setMessage("La pièce jointe ne doit pas dépasser 10 Mo.");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Session expirée. Reconnecte-toi puis réessaie.");
      }

      const extension =
        file.type === "application/pdf"
          ? "pdf"
          : file.type === "image/png"
            ? "png"
            : "jpg";
      const path = `${user.id}/${weddingId}/devis.${extension}`;

      if (currentPath && currentPath !== path) {
        await supabase.storage.from("wedding-documents").remove([currentPath]);
      }

      const { error: uploadError } = await supabase.storage
        .from("wedding-documents")
        .upload(path, file, {
          contentType: file.type,
          upsert: true,
          cacheControl: "3600",
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("weddings")
        .update({ quote_path: path })
        .eq("id", weddingId);

      if (updateError) {
        await supabase.storage.from("wedding-documents").remove([path]);
        throw updateError;
      }

      setMessage("La pièce jointe a été enregistrée.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "L’envoi de la pièce jointe a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!currentPath) return;

    setMessage(null);
    setBusy(true);
    const supabase = createClient();

    try {
      const { error: storageError } = await supabase.storage
        .from("wedding-documents")
        .remove([currentPath]);

      if (storageError) throw storageError;

      const { error: updateError } = await supabase
        .from("weddings")
        .update({ quote_path: null })
        .eq("id", weddingId);

      if (updateError) throw updateError;

      setMessage("La pièce jointe a été supprimée.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "La suppression de la pièce jointe a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-neutral-50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
          {isImage ? <ImageIcon size={19} /> : <FileText size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Devis ou pièce jointe</h3>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            PDF, JPG ou PNG, 10 Mo maximum. L’envoi est direct vers Supabase
            Storage et ne passe plus par une Server Action.
          </p>
        </div>
      </div>

      {currentUrl ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-black/10 bg-white">
          {isImage ? (
            // Une balise img est volontaire ici : l’URL signée Supabase est temporaire.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt="Aperçu de la pièce jointe"
              className="max-h-80 w-full object-contain"
            />
          ) : (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-28 items-center justify-center gap-2 px-4 text-sm font-medium hover:bg-neutral-50"
            >
              <FileText size={20} />
              Ouvrir le PDF
            </a>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800">
          <Upload size={17} />
          {busy ? "Traitement…" : currentPath ? "Remplacer" : "Ajouter une pièce jointe"}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>

        {currentPath ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 size={17} />
            Supprimer
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-neutral-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}
