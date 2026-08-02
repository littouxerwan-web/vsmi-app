"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/connexion?erreur=Champs%20obligatoires");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
  console.error("Erreur Supabase :", error);

  redirect(
    `/connexion?erreur=${encodeURIComponent(
      `${error.message} (${error.code ?? "sans code"})`,
    )}`,
  );
}

  revalidatePath("/", "layout");
  redirect("/aujourd-hui");
}

export async function logout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/connexion");
}