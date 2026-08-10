"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function optionalText(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  return value || null;
}
function amount(formData: FormData, field: string) {
  return Number(String(formData.get(field) ?? "").replace(",", "."));
}
async function auth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  return { supabase, user };
}

export async function createManualPayment(formData: FormData) {
  const { supabase, user } = await auth();
  const displayName = optionalText(formData, "display_name");
  const paymentType = optionalText(formData, "payment_type");
  const paymentAmount = amount(formData, "amount");
  const receivedDate = optionalText(formData, "received_date");
  const weddingDate = optionalText(formData, "wedding_date");

  if (!displayName) redirect(`/comptabilite?erreur=${encodeURIComponent("Indique le nom du mariage.")}`);
  if (!paymentType || !["deposit", "balance"].includes(paymentType)) redirect(`/comptabilite?erreur=${encodeURIComponent("Le type de paiement est incorrect.")}`);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) redirect(`/comptabilite?erreur=${encodeURIComponent("Le montant doit être supérieur à zéro.")}`);
  if (!receivedDate) redirect(`/comptabilite?erreur=${encodeURIComponent("Indique la date d’encaissement.")}`);

  const { error } = await supabase.from("wedding_payments").insert({
    owner_id: user.id,
    wedding_id: null,
    display_name: displayName,
    wedding_date: weddingDate,
    payment_type: paymentType,
    amount: paymentAmount,
    expected_date: receivedDate,
    received_date: receivedDate,
    status: "received",
    source: "manual",
    notes: "Saisie manuelle d’un mariage passé.",
  });
  if (error) redirect(`/comptabilite?erreur=${encodeURIComponent(error.message)}`);
  revalidatePath("/comptabilite"); revalidatePath("/aujourd-hui");
  redirect("/comptabilite?creation=ok");
}

export async function markBalanceReceived(paymentId: string, formData: FormData) {
  const { supabase, user } = await auth();
  const receivedDate = optionalText(formData, "received_date") ?? new Date().toISOString().slice(0, 10);
  const { data: payment, error: fetchError } = await supabase.from("wedding_payments").select("payment_type").eq("id", paymentId).eq("owner_id", user.id).single();
  if (fetchError || !payment) redirect(`/comptabilite?erreur=${encodeURIComponent(fetchError?.message ?? "Paiement introuvable.")}`);
  if (payment.payment_type !== "balance") redirect(`/comptabilite?erreur=${encodeURIComponent("Les acomptes sont automatiquement encaissés à la création du mariage.")}`);
  const { error } = await supabase.from("wedding_payments").update({ status: "received", received_date: receivedDate }).eq("id", paymentId).eq("owner_id", user.id);
  if (error) redirect(`/comptabilite?erreur=${encodeURIComponent(error.message)}`);
  revalidatePath("/comptabilite"); revalidatePath("/aujourd-hui");
  redirect("/comptabilite?encaissement=ok");
}

export async function deletePayment(paymentId: string) {
  const { supabase, user } = await auth();
  const { error } = await supabase.from("wedding_payments").delete().eq("id", paymentId).eq("owner_id", user.id);
  if (error) redirect(`/comptabilite?erreur=${encodeURIComponent(error.message)}`);
  revalidatePath("/comptabilite"); revalidatePath("/aujourd-hui");
  redirect("/comptabilite?suppression=ok");
}
