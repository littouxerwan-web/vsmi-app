"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PATH = "/perso";
function text(fd: FormData, key: string) { return String(fd.get(key) ?? "").trim(); }
function optional(fd: FormData, key: string) { return text(fd, key) || null; }
function number(fd: FormData, key: string) { return Number(text(fd, key).replace(",", ".")); }
function fail(message: string) { redirect(`${PATH}?erreur=${encodeURIComponent(message)}`); }
async function auth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  return { supabase, user };
}
function refresh(message: string) { revalidatePath(PATH); redirect(`${PATH}?succes=${encodeURIComponent(message)}`); }

export async function createAccount(fd: FormData) {
  const { supabase, user } = await auth();
  const name = text(fd, "name"); const accountType = text(fd, "account_type");
  if (!name) fail("Indique le nom du compte.");
  if (!["checking", "savings"].includes(accountType)) fail("Type de compte incorrect.");
  const { count } = await supabase.from("personal_accounts").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("account_type", accountType);
  const { error } = await supabase.from("personal_accounts").insert({ owner_id: user.id, name, account_type: accountType, is_default: (count ?? 0) === 0 });
  if (error) fail(error.message); refresh("Compte ajouté.");
}

export async function createCategory(fd: FormData) {
  const { supabase, user } = await auth();
  const name = text(fd, "name"); const movementType = text(fd, "movement_type"); const parentId = optional(fd, "parent_id");
  if (!name) fail("Indique le nom de la catégorie.");
  if (!["income", "expense"].includes(movementType)) fail("Type de catégorie incorrect.");
  const { error } = await supabase.from("personal_categories").insert({ owner_id: user.id, name, movement_type: movementType, parent_id: parentId });
  if (error) fail(error.message); refresh(parentId ? "Sous-catégorie ajoutée." : "Catégorie ajoutée.");
}

export async function createSnapshot(fd: FormData) {
  const { supabase, user } = await auth();
  const accountId = text(fd, "account_id"); const balance = number(fd, "balance"); const snapshotDate = text(fd, "snapshot_date");
  if (!accountId || !snapshotDate || !Number.isFinite(balance)) fail("Renseigne le compte, le solde et la date.");
  const { error } = await supabase.from("personal_balance_snapshots").upsert({ owner_id: user.id, account_id: accountId, balance, snapshot_date: snapshotDate, notes: optional(fd, "notes") }, { onConflict: "account_id,snapshot_date" });
  if (error) fail(error.message); refresh("Solde de référence enregistré et projections recalculées.");
}

export async function createMovement(fd: FormData) {
  const { supabase, user } = await auth();
  const movementType = text(fd, "movement_type"); const amount = number(fd, "amount");
  const payload = { owner_id: user.id, account_id: text(fd, "account_id"), category_id: optional(fd, "category_id"), movement_type: movementType, label: text(fd, "label"), amount, movement_date: text(fd, "movement_date"), status: text(fd, "status") || "planned", notes: optional(fd, "notes") };
  if (!payload.account_id || !payload.label || !payload.movement_date || !Number.isFinite(amount) || amount <= 0) fail("Complète les informations du mouvement.");
  if (!["income", "expense"].includes(movementType)) fail("Type de mouvement incorrect.");
  const { error } = await supabase.from("personal_movements").insert(payload);
  if (error) fail(error.message); refresh("Mouvement ajouté.");
}

export async function createTransfer(fd: FormData) {
  const { supabase, user } = await auth();
  const source = text(fd, "source_account_id"); const destination = text(fd, "destination_account_id"); const amount = number(fd, "amount"); const date = text(fd, "movement_date"); const label = text(fd, "label") || "Versement épargne";
  if (!source || !destination || source === destination || !date || !Number.isFinite(amount) || amount <= 0) fail("Le transfert est incomplet ou incorrect.");
  const group = crypto.randomUUID();
  const { error } = await supabase.from("personal_movements").insert([
    { owner_id: user.id, account_id: source, movement_type: "transfer_out", label, amount, movement_date: date, status: "completed", transfer_group_id: group },
    { owner_id: user.id, account_id: destination, movement_type: "transfer_in", label, amount, movement_date: date, status: "completed", transfer_group_id: group },
  ]);
  if (error) fail(error.message); refresh("Transfert d’épargne enregistré.");
}

export async function createRecurrence(fd: FormData) {
  const { supabase, user } = await auth();
  const movementType = text(fd, "movement_type"); const amount = number(fd, "amount");
  const payload = { owner_id: user.id, account_id: text(fd, "account_id"), destination_account_id: optional(fd, "destination_account_id"), category_id: optional(fd, "category_id"), movement_type: movementType, label: text(fd, "label"), amount, frequency: text(fd, "frequency"), interval_count: Math.max(1, Math.trunc(number(fd, "interval_count") || 1)), start_date: text(fd, "start_date"), end_date: optional(fd, "end_date"), annual_change_percent: number(fd, "annual_change_percent") || 0, notes: optional(fd, "notes") };
  if (!payload.account_id || !payload.label || !payload.start_date || !Number.isFinite(amount) || amount <= 0) fail("Complète la récurrence.");
  if (movementType === "transfer" && !payload.destination_account_id) fail("Choisis le compte d’épargne destinataire.");
  const { error } = await supabase.from("personal_recurrences").insert(payload);
  if (error) fail(error.message); refresh("Récurrence ajoutée aux projections.");
}

export async function deleteItem(table: "personal_movements" | "personal_recurrences" | "personal_categories" | "personal_accounts" | "personal_savings_goals", id: string) {
  const { supabase, user } = await auth();
  const { error } = await supabase.from(table).delete().eq("id", id).eq("owner_id", user.id);
  if (error) fail(error.message); refresh("Élément supprimé.");
}

export async function createSavingsGoal(fd: FormData) {
  const { supabase, user } = await auth();
  const accountId = text(fd, "account_id"); const name = text(fd, "name"); const targetAmount = number(fd, "target_amount"); const targetDate = text(fd, "target_date");
  if (!accountId || !name || !targetDate || !Number.isFinite(targetAmount) || targetAmount <= 0) fail("Complète l’objectif d’épargne.");
  const { error } = await supabase.from("personal_savings_goals").insert({ owner_id: user.id, account_id: accountId, name, target_amount: targetAmount, target_date: targetDate, notes: optional(fd, "notes") });
  if (error) fail(error.message); refresh("Objectif d’épargne ajouté.");
}
