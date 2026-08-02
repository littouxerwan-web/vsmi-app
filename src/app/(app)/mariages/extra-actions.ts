"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/connexion");
  return { supabase, user };
}

export async function archiveWedding(weddingId: string) {
  const { supabase, user } = await auth();

  const { error } = await supabase
    .from("weddings")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", weddingId)
    .eq("owner_id", user.id);

  if (error) {
    redirect(`/mariages?erreur=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/mariages");
  revalidatePath("/comptabilite");
  revalidatePath("/aujourd-hui");
  redirect("/mariages?archive=ok");
}

export async function restoreWedding(weddingId: string) {
  const { supabase, user } = await auth();

  const { error } = await supabase
    .from("weddings")
    .update({ archived_at: null })
    .eq("id", weddingId)
    .eq("owner_id", user.id);

  if (error) {
    redirect(`/mariages?erreur=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/mariages");
  revalidatePath("/comptabilite");
  revalidatePath("/aujourd-hui");
  redirect("/mariages?restauration=ok");
}

export async function uploadWeddingQuote(
  weddingId: string,
  formData: FormData,
) {
  const { supabase, user } = await auth();
  const file = formData.get("quote");

  if (!(file instanceof File) || file.size === 0) {
    redirect(
      `/mariages/${weddingId}?erreur=${encodeURIComponent(
        "Sélectionne un fichier PDF, JPG ou PNG.",
      )}`,
    );
  }

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
  ];

  if (!allowedTypes.includes(file.type)) {
    redirect(
      `/mariages/${weddingId}?erreur=${encodeURIComponent(
        "La pièce jointe doit être au format PDF, JPG ou PNG.",
      )}`,
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    redirect(
      `/mariages/${weddingId}?erreur=${encodeURIComponent(
        "La pièce jointe ne doit pas dépasser 10 Mo.",
      )}`,
    );
  }

  const extension =
    file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/png"
        ? "png"
        : "jpg";

  const path = `${user.id}/${weddingId}/devis.${extension}`;

  const { data: currentWedding } = await supabase
    .from("weddings")
    .select("quote_path")
    .eq("id", weddingId)
    .eq("owner_id", user.id)
    .single();

  if (
    currentWedding?.quote_path &&
    currentWedding.quote_path !== path
  ) {
    await supabase.storage
      .from("wedding-documents")
      .remove([currentWedding.quote_path]);
  }

  const { error: uploadError } = await supabase.storage
    .from("wedding-documents")
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    redirect(
      `/mariages/${weddingId}?erreur=${encodeURIComponent(
        uploadError.message,
      )}`,
    );
  }

  const { error } = await supabase
    .from("weddings")
    .update({ quote_path: path })
    .eq("id", weddingId)
    .eq("owner_id", user.id);

  if (error) {
    redirect(
      `/mariages/${weddingId}?erreur=${encodeURIComponent(
        error.message,
      )}`,
    );
  }

  revalidatePath(`/mariages/${weddingId}`);
  revalidatePath("/mariages");
  redirect(`/mariages/${weddingId}?devis=ok`);
}

export async function deleteWeddingQuote(weddingId: string) {
  const { supabase, user } = await auth();

  const { data: wedding, error: fetchError } = await supabase
    .from("weddings")
    .select("quote_path")
    .eq("id", weddingId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !wedding) {
    redirect(
      `/mariages/${weddingId}?erreur=${encodeURIComponent(
        fetchError?.message ?? "Mariage introuvable.",
      )}`,
    );
  }

  if (wedding.quote_path) {
    await supabase.storage
      .from("wedding-documents")
      .remove([wedding.quote_path]);
  }

  const { error } = await supabase
    .from("weddings")
    .update({ quote_path: null })
    .eq("id", weddingId)
    .eq("owner_id", user.id);

  if (error) {
    redirect(
      `/mariages/${weddingId}?erreur=${encodeURIComponent(
        error.message,
      )}`,
    );
  }

  revalidatePath(`/mariages/${weddingId}`);
  revalidatePath("/mariages");
  redirect(`/mariages/${weddingId}?devis_supprime=ok`);
}
