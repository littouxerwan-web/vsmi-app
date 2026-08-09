"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PATH = "/perso";
function text(fd: FormData, key: string) { return String(fd.get(key) ?? "").trim(); }
function optional(fd: FormData, key: string) { return text(fd, key) || null; }
function number(fd: FormData, key: string) { return Number(text(fd, key).replace(",", ".")); }
function fail(message: string): never { redirect(`${PATH}?erreur=${encodeURIComponent(message)}`); }
async function auth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  return { supabase, user };
}
function refresh(message: string) { revalidatePath(PATH); redirect(`${PATH}?succes=${encodeURIComponent(message)}`); }

export async function createAccount(fd: FormData) {
  const { supabase, user } = await auth();
  const name = text(fd, "name"); const accountType = text(fd, "account_type"); const color = text(fd, "color") || "#dbeafe";
  if (!name) fail("Indique le nom du compte.");
  if (!["checking", "savings"].includes(accountType)) fail("Type de compte incorrect.");
  const { count } = await supabase.from("personal_accounts").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("account_type", accountType);
  const { error } = await supabase.from("personal_accounts").insert({ owner_id: user.id, name, account_type: accountType, color, is_default: (count ?? 0) === 0 });
  if (error) fail(error.message); refresh("Compte ajouté.");
}

export async function createCategory(fd: FormData) {
  const { supabase, user } = await auth();
  const creationKind = text(fd, "creation_kind") === "budget" ? "budget" : "category";
  const name = text(fd, "name");
  const requestedMovementType = text(fd, "movement_type");
  const movementType = creationKind === "budget" ? "expense" : requestedMovementType;
  const parentId = optional(fd, "parent_id");
  const accountId = creationKind === "budget" ? optional(fd, "account_id") : null;
  const monthlyBudget = creationKind === "budget" ? Math.max(0, number(fd, "monthly_budget") || 0) : 0;
  const budgetStartDate = creationKind === "budget" ? optional(fd, "budget_start_date") : null;
  const budgetEndDate = creationKind === "budget" ? optional(fd, "budget_end_date") : null;
  const isPrimaryIncome = creationKind === "category" && movementType === "income" && text(fd, "is_primary_income") === "on";
  if (!name) fail("Indique le nom de la catégorie ou du budget.");
  if (!["income", "expense"].includes(movementType)) fail("Type de catégorie incorrect.");
  if (creationKind === "budget" && monthlyBudget <= 0) fail("Indique le montant mensuel du budget.");
  if (budgetStartDate && budgetEndDate && budgetEndDate < budgetStartDate) fail("La date de fin du budget doit être postérieure à sa date de début.");
  if (isPrimaryIncome) { const { error: resetError } = await supabase.from("personal_categories").update({ is_primary_income: false }).eq("owner_id", user.id).eq("is_primary_income", true); if (resetError) fail(resetError.message); }
  const { error } = await supabase.from("personal_categories").insert({
    owner_id: user.id,
    name,
    movement_type: movementType,
    parent_id: parentId,
    monthly_budget: monthlyBudget,
    account_id: accountId,
    budget_period: "monthly",
    budget_month: null,
    budget_start_date: budgetStartDate,
    budget_end_date: budgetEndDate,
    is_primary_income: isPrimaryIncome,
  });
  if (error) fail(error.message); refresh(creationKind === "budget" ? "Budget ajouté." : parentId ? "Sous-catégorie ajoutée." : "Catégorie ajoutée.");
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
  const status = text(fd, "status") || "planned";
  const movementDate = text(fd, "movement_date");
  const completedDate = status === "completed"
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
    : null;
  const payload = { owner_id: user.id, account_id: text(fd, "account_id"), category_id: optional(fd, "category_id"), movement_type: movementType, label: text(fd, "label"), amount, movement_date: movementDate, status, completed_date: completedDate, completed_at: status === "completed" ? new Date().toISOString() : null, exclude_from_analysis: text(fd, "exclude_from_analysis") === "on", notes: optional(fd, "notes") };
  if (!payload.account_id || !payload.label || !payload.movement_date || !Number.isFinite(amount) || amount <= 0) fail("Complète les informations du mouvement.");
  if (!["income", "expense"].includes(movementType)) fail("Type de mouvement incorrect.");
  const { error } = await supabase.from("personal_movements").insert(payload);
  if (error) fail(error.message); refresh("Mouvement ajouté.");
}

export async function createTransfer(fd: FormData) {
  const { supabase, user } = await auth();
  const source = text(fd, "source_account_id");
  const destination = text(fd, "destination_account_id");
  const amount = number(fd, "amount");
  const date = text(fd, "movement_date");
  const label = text(fd, "label") || "Virement interne";
  const status = text(fd, "status") === "completed" ? "completed" : "planned";
  if (!source || !destination || source === destination || !date || !Number.isFinite(amount) || amount <= 0) fail("Le virement interne est incomplet ou incorrect.");
  const group = crypto.randomUUID();
  const completedDate = status === "completed"
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
    : null;
  const completedAt = status === "completed" ? new Date().toISOString() : null;
  const { error } = await supabase.from("personal_movements").insert([
    { owner_id: user.id, account_id: source, movement_type: "transfer_out", label, amount, movement_date: date, status, completed_date: completedDate, completed_at: completedAt, transfer_group_id: group },
    { owner_id: user.id, account_id: destination, movement_type: "transfer_in", label, amount, movement_date: date, status, completed_date: completedDate, completed_at: completedAt, transfer_group_id: group },
  ]);
  if (error) fail(error.message);
  refresh(status === "completed" ? "Virement interne effectué." : "Virement interne ajouté aux prévisions.");
}

export async function createRecurrence(fd: FormData) {
  const { supabase, user } = await auth();
  const movementType = text(fd, "movement_type"); const amount = number(fd, "amount");
  const payload = { owner_id: user.id, account_id: text(fd, "account_id"), destination_account_id: optional(fd, "destination_account_id"), category_id: optional(fd, "category_id"), movement_type: movementType, label: text(fd, "label"), amount, frequency: text(fd, "frequency"), interval_count: Math.max(1, Math.trunc(number(fd, "interval_count") || 1)), start_date: text(fd, "start_date"), end_date: optional(fd, "end_date"), annual_change_percent: number(fd, "annual_change_percent") || 0, is_essential: movementType === "expense" && text(fd, "is_essential") === "on", exclude_from_analysis: text(fd, "exclude_from_analysis") === "on", notes: optional(fd, "notes") };
  if (!payload.account_id || !payload.label || !payload.start_date || !Number.isFinite(amount) || amount <= 0) fail("Complète la récurrence.");
  if (movementType === "transfer" && !payload.destination_account_id) fail("Choisis le compte d’épargne destinataire.");
  if (movementType === "transfer" && payload.destination_account_id === payload.account_id) fail("Le compte émetteur et le compte destinataire doivent être différents.");
  const { error } = await supabase.from("personal_recurrences").insert(payload);
  if (error) fail(error.message); refresh("Récurrence ajoutée aux projections.");
}

export async function deleteCategoryFromSettings(id: string) {
  const { supabase, user } = await auth();

  if (!id) fail("Catégorie introuvable.");

  const { error } = await supabase
    .from("personal_categories")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) fail(error.message);

  revalidatePath(PATH, "page");

  redirect(
    `${PATH}?vue=parametres&section=categories-budgets&succes=${encodeURIComponent(
      "Catégorie ou budget supprimé.",
    )}`,
  );
}

export async function deleteItem(table: "personal_movements" | "personal_recurrences" | "personal_categories" | "personal_accounts" | "personal_savings_goals", id: string) {
  const { supabase, user } = await auth();
  const { error } = await supabase.from(table).delete().eq("id", id).eq("owner_id", user.id);
  if (error) fail(error.message); refresh("Élément supprimé.");
}

export async function deleteMovement(id: string) {
  const { supabase, user } = await auth();
  if (!id) fail("Mouvement introuvable.");
  const { data: movement, error: readError } = await supabase.from("personal_movements").select("id,transfer_group_id,recurrence_id,movement_date").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (readError) fail(readError.message);
  if (!movement) fail("Mouvement introuvable.");
  let deleteQuery = supabase.from("personal_movements").delete().eq("owner_id", user.id);
  deleteQuery = movement.transfer_group_id ? deleteQuery.eq("transfer_group_id", movement.transfer_group_id) : deleteQuery.eq("id", movement.id);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) fail(deleteError.message);
  if (movement.recurrence_id && movement.movement_date) {
    const { error: exclusionError } = await supabase.from("personal_recurrence_exclusions").upsert({ owner_id: user.id, recurrence_id: movement.recurrence_id, occurrence_date: movement.movement_date }, { onConflict: "recurrence_id,occurrence_date" });
    if (exclusionError) fail(exclusionError.message);
  }
  refresh("Mouvement supprimé.");
}


export async function deleteMovementOccurrence(
  movementId: string | null,
  recurrenceId: string,
  occurrenceDate: string,
) {
  const { supabase, user } = await auth();

  if (!recurrenceId || !occurrenceDate) {
    fail("Échéance récurrente introuvable.");
  }

  const { error: exclusionError } = await supabase
    .from("personal_recurrence_exclusions")
    .upsert(
      {
        owner_id: user.id,
        recurrence_id: recurrenceId,
        occurrence_date: occurrenceDate,
      },
      { onConflict: "recurrence_id,occurrence_date" },
    );

  if (exclusionError) fail(exclusionError.message);

  if (movementId) {
    const { data: movement, error: movementError } = await supabase
      .from("personal_movements")
      .select("id,transfer_group_id")
      .eq("id", movementId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (movementError) fail(movementError.message);

    if (movement) {
      let query = supabase
        .from("personal_movements")
        .delete()
        .eq("owner_id", user.id);

      query = movement.transfer_group_id
        ? query.eq("transfer_group_id", movement.transfer_group_id)
        : query.eq("id", movement.id);

      const { error: deleteError } = await query;
      if (deleteError) fail(deleteError.message);
    }
  }

  refresh("Échéance supprimée pour ce mois.");
}

export async function deleteRecurrenceSeriesFrom(
  recurrenceId: string,
  occurrenceDate: string,
) {
  const { supabase, user } = await auth();

  if (!recurrenceId || !occurrenceDate) {
    fail("Série récurrente introuvable.");
  }

  // Vérifie explicitement que la série appartient bien à l'utilisateur.
  const { data: recurrence, error: readError } = await supabase
    .from("personal_recurrences")
    .select("id,start_date,end_date,is_active")
    .eq("id", recurrenceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (readError) fail(readError.message);
  if (!recurrence) fail("Série récurrente introuvable.");

  const selected = new Date(`${occurrenceDate}T12:00:00`);
  if (Number.isNaN(selected.getTime())) {
    fail("Date d'échéance invalide.");
  }

  // La série doit s'arrêter AVANT l'échéance sur laquelle on a cliqué.
  selected.setDate(selected.getDate() - 1);
  const stopDate = selected.toISOString().slice(0, 10);

  const startsBeforeSelected =
    recurrence.start_date && recurrence.start_date <= stopDate;

  const updatePayload = startsBeforeSelected
    ? {
        end_date: stopDate,
        is_active: true,
      }
    : {
        end_date: recurrence.end_date ?? null,
        is_active: false,
      };

  const { data: updated, error: updateError } = await supabase
    .from("personal_recurrences")
    .update(updatePayload)
    .eq("id", recurrenceId)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();

  if (updateError) fail(updateError.message);
  if (!updated) fail("La série n'a pas pu être arrêtée.");

  // Les mouvements déjà pointés sont un historique réel : on les conserve mais on
  // les détache de la série. Les occurrences non pointées sont réellement supprimées.
  const { error: detachCompletedError } = await supabase
    .from("personal_movements")
    .update({ recurrence_id: null })
    .eq("owner_id", user.id)
    .eq("recurrence_id", recurrenceId)
    .eq("status", "completed")
    .gte("movement_date", occurrenceDate);
  if (detachCompletedError) fail(detachCompletedError.message);

  const { error: movementError } = await supabase
    .from("personal_movements")
    .delete()
    .eq("owner_id", user.id)
    .eq("recurrence_id", recurrenceId)
    .neq("status", "completed")
    .gte("movement_date", occurrenceDate);

  if (movementError) fail(movementError.message);

  // Nettoyage des personnalisations futures.
  const { error: overrideError } = await supabase
    .from("personal_recurrence_overrides")
    .delete()
    .eq("owner_id", user.id)
    .eq("recurrence_id", recurrenceId)
    .gte("occurrence_month", `${occurrenceDate.slice(0, 7)}-01`);

  if (overrideError) fail(overrideError.message);

  const { error: exclusionError } = await supabase
    .from("personal_recurrence_exclusions")
    .delete()
    .eq("owner_id", user.id)
    .eq("recurrence_id", recurrenceId)
    .gte("occurrence_date", occurrenceDate);

  if (exclusionError) fail(exclusionError.message);

  revalidatePath("/perso", "page");
  redirect(
    `/perso?vue=finances&succes=${encodeURIComponent(
      "Série récurrente supprimée à partir de cette échéance.",
    )}`,
  );
}


export async function createSavingsGoal(fd: FormData) {
  const { supabase, user } = await auth();
  const accountId = text(fd, "account_id"); const name = text(fd, "name"); const targetAmount = number(fd, "target_amount"); const targetDate = text(fd, "target_date");
  if (!accountId || !name || !targetDate || !Number.isFinite(targetAmount) || targetAmount <= 0) fail("Complète l’objectif d’épargne.");
  const { error } = await supabase.from("personal_savings_goals").insert({ owner_id: user.id, account_id: accountId, name, target_amount: targetAmount, target_date: targetDate, notes: optional(fd, "notes") });
  if (error) fail(error.message); refresh("Objectif d’épargne ajouté.");
}


export async function toggleMovement(id: string, completed: boolean, transferGroupId?: string | null) {
  const { supabase, user } = await auth();
  const completedDate = completed ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) : null;
  let query = supabase.from("personal_movements").update({ status: completed ? "completed" : "planned", completed_date: completedDate, completed_at: completed ? new Date().toISOString() : null }).eq("owner_id", user.id);
  query = transferGroupId ? query.eq("transfer_group_id", transferGroupId) : query.eq("id", id);
  const { error } = await query;
  if (error) fail(error.message); refresh(completed ? "Mouvement pointé et intégré au solde à date." : "Mouvement replacé en prévision.");
}

export async function completeRecurrenceOccurrence(recurrenceId: string, occurrenceDate: string) {
  const { supabase, user } = await auth();
  if (!recurrenceId || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) fail("Échéance récurrente incorrecte.");

  const { data: recurrence, error: recurrenceError } = await supabase
    .from("personal_recurrences")
    .select("id,account_id,destination_account_id,category_id,movement_type,label,amount,notes")
    .eq("id", recurrenceId)
    .eq("owner_id", user.id)
    .single();
  if (recurrenceError || !recurrence) fail(recurrenceError?.message ?? "Récurrence introuvable.");

  const { data: existing } = await supabase
    .from("personal_movements")
    .select("id,transfer_group_id")
    .eq("owner_id", user.id)
    .eq("recurrence_id", recurrenceId)
    .eq("movement_date", occurrenceDate)
    .limit(1)
    .maybeSingle();
  if (existing) {
    const completedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    let query = supabase.from("personal_movements").update({ status: "completed", completed_date: completedDate, completed_at: new Date().toISOString() }).eq("owner_id", user.id);
    query = existing.transfer_group_id ? query.eq("transfer_group_id", existing.transfer_group_id) : query.eq("id", existing.id);
    const { error } = await query;
    if (error) fail(error.message);
    refresh("Échéance pointée et intégrée au solde à date.");
  }

  const month = `${occurrenceDate.slice(0, 7)}-01`;
  const { data: override } = await supabase
    .from("personal_recurrence_overrides")
    .select("amount")
    .eq("owner_id", user.id)
    .eq("recurrence_id", recurrenceId)
    .eq("occurrence_month", month)
    .maybeSingle();
  const amount = Number(override?.amount ?? recurrence.amount);

  if (recurrence.movement_type === "transfer") {
    if (!recurrence.destination_account_id) fail("Le compte destinataire du virement interne est manquant.");
    const group = crypto.randomUUID();
    const { error } = await supabase.from("personal_movements").insert([
      { owner_id: user.id, account_id: recurrence.account_id, category_id: recurrence.category_id, movement_type: "transfer_out", label: recurrence.label, amount, movement_date: occurrenceDate, status: "completed", completed_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), completed_at: new Date().toISOString(), notes: recurrence.notes, transfer_group_id: group, recurrence_id: recurrenceId },
      { owner_id: user.id, account_id: recurrence.destination_account_id, category_id: recurrence.category_id, movement_type: "transfer_in", label: recurrence.label, amount, movement_date: occurrenceDate, status: "completed", completed_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), completed_at: new Date().toISOString(), notes: recurrence.notes, transfer_group_id: group, recurrence_id: recurrenceId },
    ]);
    if (error) fail(error.message);
  } else {
    const { error } = await supabase.from("personal_movements").insert({
      owner_id: user.id,
      account_id: recurrence.account_id,
      category_id: recurrence.category_id,
      movement_type: recurrence.movement_type,
      label: recurrence.label,
      amount,
      movement_date: occurrenceDate,
      status: "completed",
      completed_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), completed_at: new Date().toISOString(),
      notes: recurrence.notes,
      recurrence_id: recurrenceId,
    });
    if (error) fail(error.message);
  }
  refresh("Échéance pointée et intégrée au solde à date.");
}

export async function updateAccount(fd: FormData) {
  const { supabase, user } = await auth();
  const id = text(fd, "id"); const name = text(fd, "name"); const color = text(fd, "color") || "#dbeafe";
  if (!id || !name) fail("Compte incomplet.");
  const { error } = await supabase.from("personal_accounts").update({ name, color }).eq("id", id).eq("owner_id", user.id);
  if (error) fail(error.message); refresh("Compte modifié.");
}

export async function updateCategory(fd: FormData) {
  const { supabase, user } = await auth();
  const id = text(fd, "id"); const name = text(fd, "name"); const accountId = optional(fd, "account_id"); const monthlyBudget = Math.max(0, number(fd, "monthly_budget") || 0);
  const isPrimaryIncome = text(fd, "movement_type") === "income" && text(fd, "is_primary_income") === "on";
  const isEssential = text(fd, "movement_type") !== "income" && text(fd, "is_essential") === "on";
  const excludeFromAnalysis = text(fd, "exclude_from_analysis") === "on";
// Une catégorie simple n'a aucune période. Un budget est mensuel entre
// sa date de début et sa date de fin facultative.
const isBudget = monthlyBudget > 0;
  // Une catégorie simple n'a aucune période. Un budget est mensuel entre
  // sa date de début et sa date de fin facultative.
  const budgetNoEnd = text(fd, "budget_no_end") === "on";
  const budgetPeriod = "monthly";
  const budgetMonth = null;
  const budgetStartDate = isBudget ? optional(fd, "budget_start_date") : null;
  const budgetEndDate = isBudget && !budgetNoEnd ? optional(fd, "budget_end_date") : null;
  if (!id || !name) fail("Catégorie incomplète.");
  if (budgetStartDate && budgetEndDate && budgetEndDate < budgetStartDate) fail("La date de fin du budget doit être postérieure à sa date de début.");
  if (isPrimaryIncome) { const { error: resetError } = await supabase.from("personal_categories").update({ is_primary_income: false }).eq("owner_id", user.id).eq("is_primary_income", true).neq("id", id); if (resetError) fail(resetError.message); }
  const { error } = await supabase.from("personal_categories").update({ name, monthly_budget: monthlyBudget, account_id: accountId, budget_period: budgetPeriod, budget_month: budgetMonth, budget_start_date: budgetStartDate, budget_end_date: budgetEndDate, is_primary_income: isPrimaryIncome, is_essential: isEssential, exclude_from_analysis: excludeFromAnalysis }).eq("id", id).eq("owner_id", user.id);
  if (error) fail(error.message);

revalidatePath(PATH, "page");

redirect(
  `${PATH}?vue=parametres&section=categories-budgets&succes=${encodeURIComponent(
    "Catégorie modifiée et soldes recalculés.",
  )}`,
);
}

export async function applyCategoryBudgetSimulation(fd: FormData) {
  const { supabase, user } = await auth();
  const raw = text(fd, "changes");
  let changes: Array<{ id: string; monthly_budget: number }> = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) changes = parsed;
  } catch {
    fail("Simulation de budgets invalide.");
  }

  const normalized = changes
    .map((item) => ({
      id: String(item?.id ?? ""),
      monthly_budget: Math.round(Math.max(0, Number(item?.monthly_budget ?? 0)) * 100) / 100,
    }))
    .filter((item) => item.id && Number.isFinite(item.monthly_budget));

  if (!normalized.length) fail("Aucune modification de budget à appliquer.");

  for (const change of normalized) {
    const { error } = await supabase
      .from("personal_categories")
      .update({ monthly_budget: change.monthly_budget })
      .eq("id", change.id)
      .eq("owner_id", user.id)
      .eq("movement_type", "expense")
      .eq("is_essential", false)
      .eq("is_active", true);
    if (error) fail(error.message);
  }

  revalidatePath(PATH, "page");
  redirect(`${PATH}?vue=finances&succes=${encodeURIComponent(`${normalized.length} budget(s) mis à jour.`)}`);
}

export async function updateRecurrence(fd: FormData) {
  const { supabase, user } = await auth();
  const id = text(fd, "id"); const amount = number(fd, "amount");
  const movementType = text(fd, "movement_type");
  const accountId = text(fd, "account_id");
  const categoryId = optional(fd, "category_id");
  if (!id || !text(fd, "label") || !accountId || !Number.isFinite(amount) || amount <= 0) fail("Mouvement régulier incomplet.");
  if (!["income","expense","transfer"].includes(movementType)) fail("Type de mouvement régulier incorrect.");
  const { error } = await supabase.from("personal_recurrences").update({
    label: text(fd, "label"), amount, movement_type: movementType, account_id: accountId,
    category_id: categoryId, end_date: optional(fd, "end_date"), is_active: text(fd, "is_active") !== "false",
    is_essential: movementType === "expense" && text(fd, "is_essential") === "on", exclude_from_analysis: text(fd, "exclude_from_analysis") === "on"
  }).eq("id", id).eq("owner_id", user.id);
  if (error) fail(error.message); refresh("Mouvement régulier modifié.");
}

export async function setRecurrenceOverride(fd: FormData) {
  const { supabase, user } = await auth();
  const recurrenceId = text(fd, "recurrence_id"); const month = text(fd, "occurrence_month"); const amount = number(fd, "amount");
  if (!recurrenceId || !/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(amount) || amount <= 0) fail("Montant mensuel incorrect.");
  const occurrenceMonth = `${month}-01`;
  const { error } = await supabase.from("personal_recurrence_overrides").upsert({ owner_id: user.id, recurrence_id: recurrenceId, occurrence_month: occurrenceMonth, amount }, { onConflict: "recurrence_id,occurrence_month" });
  if (error) fail(error.message); refresh("Montant exceptionnel du mois enregistré.");
}


export async function updateMovement(fd: FormData) {
  const { supabase, user } = await auth();
  const id = text(fd, "id");
  const label = text(fd, "label");
  const amount = number(fd, "amount");
  const movementDate = text(fd, "movement_date");
  const accountId = text(fd, "account_id");
  const categoryId = optional(fd, "category_id");
  const excludeFromAnalysis = text(fd, "exclude_from_analysis") === "on";
  if (!id || !label || !accountId || !movementDate || !Number.isFinite(amount) || amount <= 0) fail("Mouvement incomplet.");
  const { error } = await supabase
    .from("personal_movements")
    .update({ label, amount, movement_date: movementDate, account_id: accountId, category_id: categoryId, exclude_from_analysis: excludeFromAnalysis })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) fail(error.message);
  refresh("Mouvement modifié.");
}

export async function updateMovementAnalysisEssential(fd: FormData) {
  const { supabase, user } = await auth();
  const movementId = text(fd, "movement_id");
  if (!movementId) fail("Mouvement introuvable.");
  const isEssential = text(fd, "is_essential") === "on";
  const { error } = await supabase
    .from("personal_movements")
    .update({ is_essential_override: isEssential })
    .eq("id", movementId)
    .eq("owner_id", user.id)
    .eq("movement_type", "expense");
  if (error) fail(error.message);
  revalidatePath(PATH, "page");
}

export async function assignMovementCategory(fd: FormData) {
  const { supabase, user } = await auth();
  const movementId = text(fd, "movement_id");
  const categoryId = text(fd, "category_id");
  if (!movementId || !categoryId) fail("Choisis une catégorie.");
  const { error } = await supabase
    .from("personal_movements")
    .update({ category_id: categoryId })
    .eq("id", movementId)
    .eq("owner_id", user.id);
  if (error) fail(error.message);
  revalidatePath(PATH, "page");
}

export async function createCategoryAndAssignMovement(fd: FormData) {
  const { supabase, user } = await auth();
  const movementId = text(fd, "movement_id");
  const categoryName = text(fd, "category_name");
  if (!movementId || !categoryName) fail("Indique un nom de catégorie.");

  const { data: movement, error: movementError } = await supabase
    .from("personal_movements")
    .select("id,movement_type,account_id")
    .eq("id", movementId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (movementError) fail(movementError.message);
  if (!movement || !["income", "expense"].includes(movement.movement_type)) fail("Mouvement introuvable.");

  const { data: category, error: categoryError } = await supabase
    .from("personal_categories")
    .insert({
      owner_id: user.id,
      name: categoryName,
      movement_type: movement.movement_type,
      parent_id: null,
      monthly_budget: 0,
      account_id: movement.account_id,
      budget_period: "monthly",
      is_active: true,
      is_essential: false,
      exclude_from_analysis: false,
    })
    .select("id")
    .single();
  if (categoryError) fail(categoryError.message);

  const { error: updateError } = await supabase
    .from("personal_movements")
    .update({ category_id: category.id })
    .eq("id", movementId)
    .eq("owner_id", user.id);
  if (updateError) {
    await supabase.from("personal_categories").delete().eq("id", category.id).eq("owner_id", user.id);
    fail(updateError.message);
  }
  revalidatePath(PATH, "page");
}

export async function excludeRecurrenceOccurrence(recurrenceId: string, occurrenceDate: string) {
  const { supabase, user } = await auth();
  if (!recurrenceId || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) fail("Échéance incorrecte.");
  const { error } = await supabase.from("personal_recurrence_exclusions").upsert(
    { owner_id: user.id, recurrence_id: recurrenceId, occurrence_date: occurrenceDate },
    { onConflict: "recurrence_id,occurrence_date" }
  );
  if (error) fail(error.message);
  refresh("Échéance supprimée uniquement pour ce mois.");
}


export async function saveChildrenSyncSettings(fd: FormData) {
  const { supabase, user } = await auth();
  const enabled = text(fd, "children_sync_enabled") === "on";
  const accountId = optional(fd, "children_sync_account_id");
  const day = Math.min(28, Math.max(1, Math.trunc(number(fd, "children_sync_day") || 5)));
  const self = text(fd, "children_sync_person") === "person_1" ? "person_1" : "person_2";
  if (enabled && !accountId) fail("Choisis le compte utilisé pour les régularisations ENFANTS.");
  const { error } = await supabase.from("personal_settings").upsert({
    owner_id: user.id,
    children_sync_enabled: enabled,
    children_sync_account_id: accountId,
    children_sync_day: day,
    children_sync_person: self,
  }, { onConflict: "owner_id" });
  if (error) fail(error.message);
  revalidatePath(PATH, "page");
  redirect(`${PATH}?vue=parametres&succes=${encodeURIComponent("Intégration ENFANTS mise à jour.")}`);
}

export async function completeChildrenProjectedMovement(
  sourceKey: string,
  accountId: string,
  movementType: "income" | "expense",
  label: string,
  amount: number,
  movementDate: string,
) {
  const { supabase, user } = await auth();
  if (!sourceKey.startsWith("children:") || !accountId || !["income","expense"].includes(movementType) || !/^\d{4}-\d{2}-\d{2}$/.test(movementDate) || !Number.isFinite(amount) || amount <= 0) fail("Régularisation ENFANTS incorrecte.");
  const completedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { error } = await supabase.from("personal_movements").upsert({
    owner_id: user.id, account_id: accountId, category_id: null, movement_type: movementType,
    label, amount, movement_date: movementDate, status: "completed", completed_date: completedDate,
    completed_at: new Date().toISOString(), source_type: "children", source_key: sourceKey,
  }, { onConflict: "owner_id,source_type,source_key" });
  if (error) fail(error.message);
  refresh("Régularisation ENFANTS pointée. Son montant est désormais figé dans l'historique.");
}

export async function resetChildrenMovement(id: string) {
  const { supabase, user } = await auth();
  if (!id) fail("Mouvement ENFANTS introuvable.");
  const { error } = await supabase.from("personal_movements").delete()
    .eq("id", id).eq("owner_id", user.id).eq("source_type", "children");
  if (error) fail(error.message);
  refresh("Régularisation ENFANTS replacée en prévision et resynchronisée.");
}

export async function deleteRecurrenceFromSettings(id: string) {
  const { supabase, user } = await auth();
  if (!id) fail("Mouvement régulier introuvable.");
  // Les opérations déjà pointées restent un historique réel, mais sont détachées de la série.
  const { error: detachError } = await supabase.from("personal_movements")
    .update({ recurrence_id: null })
    .eq("owner_id", user.id).eq("recurrence_id", id).eq("status", "completed");
  if (detachError) fail(detachError.message);
  // Les occurrences non réalisées sont supprimées avant la série : aucun mouvement fantôme ne subsiste.
  const { error: plannedError } = await supabase.from("personal_movements")
    .delete().eq("owner_id", user.id).eq("recurrence_id", id).neq("status", "completed");
  if (plannedError) fail(plannedError.message);
  const { error } = await supabase.from("personal_recurrences").delete().eq("id", id).eq("owner_id", user.id);
  if (error) fail(error.message);
  revalidatePath(PATH, "page");
  redirect(`${PATH}?vue=parametres&section=mouvements-reguliers&succes=${encodeURIComponent("Mouvement régulier supprimé. Aucun mouvement futur masqué n'est conservé.")}`);
}

async function saveDefaultAccountSetting(
  fd: FormData,
  formKey: "photo_default_account_id" | "movement_default_account_id" | "urssaf_default_account_id" | "savings_source_account_id" | "savings_destination_account_id" | "savings_source_account_2_id" | "savings_destination_account_2_id",
  successMessage: string,
) {
  const { supabase, user } = await auth();
  const accountId = optional(fd, formKey);

  if (accountId) {
    const { data: account, error: accountError } = await supabase
      .from("personal_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (accountError) fail(accountError.message);
    if (!account) fail("Le compte sélectionné est introuvable ou inactif.");
  }

  const { data: existing, error: readError } = await supabase
    .from("personal_settings")
    .select("owner_id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (readError) fail(readError.message);

  const payload = { [formKey]: accountId, updated_at: new Date().toISOString() };
  const query = existing
    ? supabase.from("personal_settings").update(payload).eq("owner_id", user.id)
    : supabase.from("personal_settings").insert({ owner_id: user.id, ...payload });

  const { error } = await query;
  if (error) fail(error.message);
  revalidatePath(PATH);
  redirect(`${PATH}?vue=parametres&succes=${encodeURIComponent(successMessage)}`);
}

export async function updatePhotoDefaultAccount(fd: FormData) {
  return saveDefaultAccountSetting(
    fd,
    "photo_default_account_id",
    "Compte par défaut des encaissements photo enregistré.",
  );
}

export async function updateMovementDefaultAccount(fd: FormData) {
  return saveDefaultAccountSetting(
    fd,
    "movement_default_account_id",
    "Compte par défaut des mouvements enregistré.",
  );
}

export async function updateUrssafDefaultAccount(fd: FormData) {
  return saveDefaultAccountSetting(
    fd,
    "urssaf_default_account_id",
    "Compte par défaut URSSAF enregistré.",
  );
}


async function saveSavingsProfile(fd: FormData, profile: 1 | 2) {
  const { supabase, user } = await auth();
  const sourceKey = profile === 1 ? "savings_source_account_id" : "savings_source_account_2_id";
  const destinationKey = profile === 1 ? "savings_destination_account_id" : "savings_destination_account_2_id";
  const thresholdKey = profile === 1 ? "savings_threshold" : "savings_threshold_2";
  const incomeCategoryKey = profile === 1 ? "savings_income_category_id" : "savings_income_category_2_id";
  const proposalTimingKey = profile === 1 ? "savings_proposal_timing" : "savings_proposal_timing_2";
  const incomeSourceKey = profile === 1 ? "savings_income_source" : "savings_income_source_2";
  const sourceAccountId = optional(fd, sourceKey);
  const destinationAccountId = optional(fd, destinationKey);
  const requestedIncomeSource = text(fd, incomeSourceKey) === "weddings" ? "weddings" : "category";
  // Les revenus mariage sont réservés aux comptes VSMI complets. Le rôle est
  // stocké dans app_metadata (non modifiable par l'utilisateur depuis le client).
  const incomeSource = user.app_metadata?.role === "personal" ? "category" : requestedIncomeSource;
  const incomeCategoryId = incomeSource === "category" ? optional(fd, incomeCategoryKey) : null;
  const proposalTiming = text(fd, proposalTimingKey) === "next_day" ? "next_day" : "same_day";
  const thresholdRaw = Number(fd.get(thresholdKey) ?? 500);
  const threshold = Number.isFinite(thresholdRaw) && thresholdRaw >= 0 ? thresholdRaw : 500;

  if (sourceAccountId === destinationAccountId && sourceAccountId) fail("Le compte source et le compte d’épargne doivent être différents.");
  if (sourceAccountId) {
    const { data: source, error } = await supabase.from("personal_accounts").select("id,account_type").eq("id", sourceAccountId).eq("owner_id", user.id).eq("is_active", true).maybeSingle();
    if (error) fail(error.message);
    if (!source || source.account_type !== "checking") fail("Choisis un compte courant valide comme source.");
  }
  if (destinationAccountId) {
    const { data: destination, error } = await supabase.from("personal_accounts").select("id,account_type").eq("id", destinationAccountId).eq("owner_id", user.id).eq("is_active", true).maybeSingle();
    if (error) fail(error.message);
    if (!destination || destination.account_type !== "savings") fail("Choisis un compte d’épargne valide comme destination.");
  }
  if (incomeCategoryId) {
    const { data: category, error } = await supabase.from("personal_categories").select("id,movement_type").eq("id", incomeCategoryId).eq("owner_id", user.id).eq("is_active", true).maybeSingle();
    if (error) fail(error.message);
    if (!category || category.movement_type !== "income") fail("Choisis une catégorie de revenu valide pour démarrer le cycle.");
  }

  const payload = {
    owner_id: user.id,
    [sourceKey]: sourceAccountId,
    [destinationKey]: destinationAccountId,
    [thresholdKey]: threshold,
    [incomeCategoryKey]: incomeCategoryId,
    [incomeSourceKey]: incomeSource,
    [proposalTimingKey]: proposalTiming,
    updated_at: new Date().toISOString(),
  };
  const { data: saved, error } = await supabase
    .from("personal_settings")
    .upsert(payload, { onConflict: "owner_id" })
    .select(`${sourceKey},${destinationKey},${thresholdKey},${incomeCategoryKey},${incomeSourceKey},${proposalTimingKey}`)
    .single();
  if (error) fail(error.message);
  if (!saved) fail("Le profil d’épargne n’a pas pu être relu après son enregistrement.");
  revalidatePath(PATH);
  redirect(`${PATH}?vue=parametres&succes=${encodeURIComponent(`Profil d’épargne ${profile} enregistré.`)}`);
}

export async function updateSavingsProfile1(fd: FormData) {
  return saveSavingsProfile(fd, 1);
}

export async function updateSavingsProfile2(fd: FormData) {
  return saveSavingsProfile(fd, 2);
}

export async function toggleUrssafContribution(month: string, completed: boolean, fallbackAccountId?: string | null) {
  const { supabase, user } = await auth();
  if (!/^\d{4}-\d{2}$/.test(month)) fail("Mois URSSAF incorrect.");
  let accountId = fallbackAccountId ?? null;
  if (!accountId) {
    const { data: settings } = await supabase.from("personal_settings").select("urssaf_default_account_id").eq("owner_id", user.id).maybeSingle();
    accountId = settings?.urssaf_default_account_id ?? null;
  }
  if (!accountId) fail("Choisis d’abord le compte URSSAF par défaut dans Paramètres.");
  const { error } = await supabase.from("personal_urssaf_states").upsert(
    { owner_id: user.id, contribution_month: `${month}-01`, account_id: accountId, is_completed: completed, completed_date: completed ? new Date().toISOString().slice(0, 10) : null },
    { onConflict: "owner_id,contribution_month" }
  );
  if (error) fail(error.message);
  refresh(completed ? "Cotisation URSSAF intégrée au disponible aujourd’hui." : "Cotisation URSSAF replacée en prévision.");
}

export async function toggleWeddingPayment(paymentId: string, completed: boolean, fallbackAccountId?: string | null) {
  const { supabase, user } = await auth();
  const { data: payment, error: paymentError } = await supabase
    .from("wedding_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("owner_id", user.id)
    .single();
  if (paymentError || !payment) fail(paymentError?.message ?? "Encaissement photo introuvable.");

  let accountId = fallbackAccountId ?? null;
  if (!accountId) {
    const { data: settings } = await supabase
      .from("personal_settings")
      .select("photo_default_account_id")
      .eq("owner_id", user.id)
      .maybeSingle();
    accountId = settings?.photo_default_account_id ?? null;
  }
  if (completed && !accountId) fail("Choisis d’abord le compte récepteur photo dans Paramètres.");

  const { error } = await supabase.from("personal_photo_payment_states").upsert(
    {
      owner_id: user.id,
      payment_id: paymentId,
      account_id: accountId,
      is_completed: completed,
      completed_date: completed ? new Date().toISOString().slice(0, 10) : null,
    },
    { onConflict: "owner_id,payment_id" }
  );
  if (error) fail(error.message);
  refresh(completed ? "Encaissement photo intégré au disponible aujourd’hui." : "Encaissement photo maintenu en prévision.");
}

function savingsReturnView(fd: FormData) { return text(fd, "return_view") === "projection" ? "projection" : "finances"; }
function savingsSuccess(fd: FormData, message: string): never { revalidatePath(PATH); redirect(`${PATH}?vue=${savingsReturnView(fd)}&succes=${encodeURIComponent(message)}`); }

function savingsProposalKey(fd: FormData) {
  const sourceAccountId = text(fd, "source_account_id");
  const destinationAccountId = text(fd, "destination_account_id");
  const sourceMonth = text(fd, "source_month");
  if (!sourceAccountId || !destinationAccountId || sourceAccountId === destinationAccountId || !/^\d{4}-\d{2}$/.test(sourceMonth)) fail("Proposition d’épargne incorrecte.");
  const proposalDateRaw = optional(fd, "proposal_date");
  const proposalDate = proposalDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(proposalDateRaw) ? proposalDateRaw : `${sourceMonth}-28`;
  return { sourceAccountId, destinationAccountId, sourceMonth, sourceMonthDate: `${sourceMonth}-01`, proposalDate };
}

async function verifySavingsAccounts(supabase: any, ownerId: string, sourceAccountId: string, destinationAccountId: string) {
  const { data: rows, error } = await supabase.from("personal_accounts").select("id,account_type").eq("owner_id", ownerId).in("id", [sourceAccountId, destinationAccountId]).eq("is_active", true);
  if (error) fail(error.message);
  const source = rows?.find((a: { id: string; account_type: string }) => a.id === sourceAccountId);
  const destination = rows?.find((a: { id: string; account_type: string }) => a.id === destinationAccountId);
  const isSavingsDeposit = source?.account_type === "checking" && destination?.account_type === "savings";
  const isSavingsUse = source?.account_type === "savings" && destination?.account_type === "checking";
  if (!source || !destination || (!isSavingsDeposit && !isSavingsUse)) fail("Les comptes de la proposition d’épargne sont incorrects.");
}

async function savingsTransferGroupsForMonth(supabase:any, ownerId:string, sourceAccountId:string, destinationAccountId:string, sourceMonth:string, isSavingsUse:boolean){
  const start=`${sourceMonth}-01`;
  const next=(()=>{const d=new Date(`${start}T12:00:00`);d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,10)})();
  const prefix=isSavingsUse?"Utilisation d'épargne conseillée":"Versement épargne proposé";
  const {data:outs,error:outError}=await supabase.from("personal_movements").select("transfer_group_id").eq("owner_id",ownerId).eq("account_id",sourceAccountId).eq("movement_type","transfer_out").gte("movement_date",start).lt("movement_date",next).like("label",`${prefix}%`).not("transfer_group_id","is",null).neq("status","cancelled");
  if(outError) fail(outError.message);
  const groups=[...new Set((outs??[]).map((row:{transfer_group_id:string|null})=>row.transfer_group_id).filter(Boolean))] as string[];
  if(groups.length===0)return [] as string[];
  const {data:ins,error:inError}=await supabase.from("personal_movements").select("transfer_group_id").eq("owner_id",ownerId).eq("account_id",destinationAccountId).eq("movement_type","transfer_in").in("transfer_group_id",groups).neq("status","cancelled");
  if(inError) fail(inError.message);
  const valid=new Set((ins??[]).map((row:{transfer_group_id:string|null})=>row.transfer_group_id).filter(Boolean));
  return groups.filter(group=>valid.has(group));
}

export async function acceptSavingsProposal(fd: FormData) {
  const { supabase, user } = await auth();
  const key = savingsProposalKey(fd); const amount = number(fd, "amount");
  const previousTransferGroupId = optional(fd,"previous_transfer_group_id");
  if (!Number.isFinite(amount) || amount <= 0) fail("Le montant proposé doit être supérieur à zéro.");
  await verifySavingsAccounts(supabase, user.id, key.sourceAccountId, key.destinationAccountId);
  const { data: accountRows, error: accountError } = await supabase.from("personal_accounts").select("id,account_type").eq("owner_id", user.id).in("id", [key.sourceAccountId, key.destinationAccountId]);
  if (accountError) fail(accountError.message);
  const sourceType = accountRows?.find((row: { id: string; account_type: string }) => row.id === key.sourceAccountId)?.account_type;
  const isSavingsUse = sourceType === "savings";
  const { data: existing, error: existingError } = await supabase.from("personal_savings_proposals").select("id,status,transfer_group_id").eq("owner_id", user.id).eq("source_account_id", key.sourceAccountId).eq("destination_account_id", key.destinationAccountId).eq("source_month", key.sourceMonthDate).maybeSingle();
  if (existingError) fail(existingError.message);
  const existingGroups=await savingsTransferGroupsForMonth(supabase,user.id,key.sourceAccountId,key.destinationAccountId,key.sourceMonth,isSavingsUse);
  if(existing?.status==="accepted"&&existing.transfer_group_id){
    const materialized=existingGroups.includes(existing.transfer_group_id);
    // Un second versement n'est accepté que depuis une carte recalculée après le premier.
    // Cela empêche un double-clic sur « Accepter » de créer deux virements identiques.
    if(!materialized||previousTransferGroupId!==existing.transfer_group_id) savingsSuccess(fd,"Ce versement d’épargne est déjà accepté.");
  }
  if(!isSavingsUse&&existingGroups.length>=2)savingsSuccess(fd,"Deux versements d’épargne sont déjà enregistrés pour ce mois.");
  let category: { id: string } | null = null;
  if (!isSavingsUse) {
    const { data, error: categoryError } = await supabase.from("personal_categories").select("id").eq("owner_id", user.id).eq("name", "Épargne").eq("movement_type", "expense").is("parent_id", null).maybeSingle();
    if (categoryError) fail(categoryError.message);
    category = data;
    if (!category) {
      const { data: created, error } = await supabase.from("personal_categories").insert({ owner_id: user.id, name: "Épargne", movement_type: "expense", parent_id: null, monthly_budget: 0, account_id: key.sourceAccountId, is_active: true }).select("id").single();
      if (error) fail(error.message); category = created;
    }
  }
  const movementDate = key.proposalDate; const group = crypto.randomUUID();
  const label = isSavingsUse ? `Utilisation d'épargne conseillée · ${key.sourceMonth}` : `Versement épargne proposé · ${key.sourceMonth}`;
  const { error: movementError } = await supabase.from("personal_movements").insert([
    { owner_id: user.id, account_id: key.sourceAccountId, category_id: isSavingsUse ? null : category?.id ?? null, movement_type: "transfer_out", label, amount, movement_date: movementDate, status: "planned", transfer_group_id: group },
    { owner_id: user.id, account_id: key.destinationAccountId, category_id: null, movement_type: "transfer_in", label, amount, movement_date: movementDate, status: "planned", transfer_group_id: group },
  ]);
  if (movementError) fail(movementError.message);
  const payload = { owner_id: user.id, source_account_id: key.sourceAccountId, destination_account_id: key.destinationAccountId, source_month: key.sourceMonthDate, amount, status: "accepted", transfer_group_id: group, accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await supabase.from("personal_savings_proposals").upsert(payload, { onConflict: "owner_id,source_account_id,destination_account_id,source_month" });
  if (error) {
    await supabase.from("personal_movements").delete().eq("owner_id", user.id).eq("transfer_group_id", group);
    fail(error.message);
  }
  savingsSuccess(fd, existingGroups.length===1&&!isSavingsUse?"Deuxième versement d’épargne accepté et ajouté aux prévisions.":"Proposition d’épargne acceptée et ajoutée aux prévisions.");
}

export async function updateSavingsProposalAmount(fd: FormData) {
  const { supabase, user } = await auth();
  const key = savingsProposalKey(fd); const amount = number(fd, "amount");
  if (!Number.isFinite(amount) || amount <= 0) fail("Le montant doit être supérieur à zéro.");
  await verifySavingsAccounts(supabase, user.id, key.sourceAccountId, key.destinationAccountId);
  const { data: existing, error: readError } = await supabase.from("personal_savings_proposals").select("amount,status,transfer_group_id").eq("owner_id", user.id).eq("source_account_id", key.sourceAccountId).eq("destination_account_id", key.destinationAccountId).eq("source_month", key.sourceMonthDate).maybeSingle();
  if (readError) fail(readError.message);

  const previousTransferGroupId=optional(fd,"previous_transfer_group_id");
  const editingSecondProposal=existing?.status==="accepted"&&existing.transfer_group_id&&previousTransferGroupId===existing.transfer_group_id;
  const nextStatus = existing?.status === "accepted"&&!editingSecondProposal ? "accepted" : "pending";
  const proposalPayload = { owner_id: user.id, source_account_id: key.sourceAccountId, destination_account_id: key.destinationAccountId, source_month: key.sourceMonthDate, amount, status: nextStatus, transfer_group_id: editingSecondProposal?null:(existing?.transfer_group_id ?? null), updated_at: new Date().toISOString() };
  const { error: proposalError } = await supabase.from("personal_savings_proposals").upsert(proposalPayload, { onConflict: "owner_id,source_account_id,destination_account_id,source_month" });
  if (proposalError) fail(proposalError.message);

  if (existing?.status === "accepted" && existing.transfer_group_id && !editingSecondProposal) {
    const { error: movementError } = await supabase.from("personal_movements").update({ amount }).eq("owner_id", user.id).eq("transfer_group_id", existing.transfer_group_id);
    if (movementError) {
      // Restaure la proposition précédente : pas de montant incohérent entre carte et virement.
      await supabase.from("personal_savings_proposals").upsert({ ...proposalPayload, amount: Number(existing.amount), status: existing.status, updated_at: new Date().toISOString() }, { onConflict: "owner_id,source_account_id,destination_account_id,source_month" });
      fail(movementError.message);
    }
  }
  savingsSuccess(fd, "Montant du versement d’épargne modifié.");
}

export async function deleteSavingsProposal(fd: FormData) {
  const { supabase, user } = await auth();
  const key = savingsProposalKey(fd);
  const previousTransferGroupId=optional(fd,"previous_transfer_group_id");
  const { data: existing, error: readError } = await supabase.from("personal_savings_proposals").select("amount,status,transfer_group_id,accepted_at").eq("owner_id", user.id).eq("source_account_id", key.sourceAccountId).eq("destination_account_id", key.destinationAccountId).eq("source_month", key.sourceMonthDate).maybeSingle();
  if (readError) fail(readError.message);

  const deletedPayload = { owner_id: user.id, source_account_id: key.sourceAccountId, destination_account_id: key.destinationAccountId, source_month: key.sourceMonthDate, amount: 0, status: "deleted", transfer_group_id: null, accepted_at: null, updated_at: new Date().toISOString() };
  const { error: proposalError } = await supabase.from("personal_savings_proposals").upsert(deletedPayload, { onConflict: "owner_id,source_account_id,destination_account_id,source_month" });
  if (proposalError) fail(proposalError.message);

  const deletingSecondSuggestion=existing?.status==="accepted"&&existing.transfer_group_id&&previousTransferGroupId===existing.transfer_group_id;
  if (existing?.transfer_group_id && !deletingSecondSuggestion) {
    const { error: movementError } = await supabase.from("personal_movements").delete().eq("owner_id", user.id).eq("transfer_group_id", existing.transfer_group_id);
    if (movementError) {
      // Si la suppression du virement échoue, restaure la décision précédente.
      await supabase.from("personal_savings_proposals").upsert({ owner_id: user.id, source_account_id: key.sourceAccountId, destination_account_id: key.destinationAccountId, source_month: key.sourceMonthDate, amount: Number(existing.amount), status: existing.status, transfer_group_id: existing.transfer_group_id, accepted_at: existing.accepted_at ?? null, updated_at: new Date().toISOString() }, { onConflict: "owner_id,source_account_id,destination_account_id,source_month" });
      fail(movementError.message);
    }
  }
  savingsSuccess(fd, "Proposition d’épargne supprimée.");
}


function savingsBudgetRedirect(message:string){
  revalidatePath(PATH, "page");
  redirect(`${PATH}?vue=budgets-epargne&succes=${encodeURIComponent(message)}`);
}

export async function createSavingsBudget(fd: FormData) {
  const { supabase, user } = await auth();
  const accountId=text(fd,"account_id"), name=text(fd,"name");
  const kind=text(fd,"kind")==="reserve"?"reserve":"project";
  const allocationMode=text(fd,"allocation_mode")==="percent"?"percent":"amount";
  const allocationValue=Math.max(0,number(fd,"allocation_value")||0);
  const protection=["free","preserve","untouchable"].includes(text(fd,"protection"))?text(fd,"protection"):"preserve";
  const allowRecovery=protection!=="untouchable"&&text(fd,"allow_recovery")==="on";
  const criticalThreshold=Math.max(0,number(fd,"critical_threshold")||0);
  const targetAmount=number(fd,"target_amount");
  if(!accountId||!name||allocationValue<=0) fail("Complète le budget d’épargne.");
  if(allocationMode==="percent"&&allocationValue>100) fail("Un pourcentage ne peut pas dépasser 100 %.");
  const {error}=await supabase.from("personal_savings_budgets").insert({owner_id:user.id,account_id:accountId,name,kind,allocation_mode:allocationMode,allocation_value:allocationValue,protection,allow_recovery:allowRecovery,critical_threshold:criticalThreshold,target_amount:Number.isFinite(targetAmount)&&targetAmount>0?targetAmount:null,target_date:optional(fd,"target_date"),priority:Math.max(0,Math.trunc(number(fd,"priority")||0))});
  if(error) fail(error.message); savingsBudgetRedirect("Budget d’épargne ajouté.");
}

export async function updateSavingsBudget(fd: FormData) {
  const { supabase, user } = await auth();
  const id=text(fd,"id"),accountId=text(fd,"account_id"),name=text(fd,"name");
  const kind=text(fd,"kind")==="reserve"?"reserve":"project";
  const allocationMode=text(fd,"allocation_mode")==="percent"?"percent":"amount";
  const allocationValue=Math.max(0,number(fd,"allocation_value")||0);
  const protection=["free","preserve","untouchable"].includes(text(fd,"protection"))?text(fd,"protection"):"preserve";
  const allowRecovery=protection!=="untouchable"&&text(fd,"allow_recovery")==="on";
  const criticalThreshold=Math.max(0,number(fd,"critical_threshold")||0);
  const targetAmount=number(fd,"target_amount");
  if(!id||!accountId||!name||allocationValue<=0) fail("Budget d’épargne incomplet.");
  if(allocationMode==="percent"&&allocationValue>100) fail("Un pourcentage ne peut pas dépasser 100 %.");
  const {error}=await supabase.from("personal_savings_budgets").update({account_id:accountId,name,kind,allocation_mode:allocationMode,allocation_value:allocationValue,protection,allow_recovery:allowRecovery,critical_threshold:criticalThreshold,target_amount:Number.isFinite(targetAmount)&&targetAmount>0?targetAmount:null,target_date:optional(fd,"target_date"),priority:Math.max(0,Math.trunc(number(fd,"priority")||0))}).eq("id",id).eq("owner_id",user.id);
  if(error) fail(error.message); savingsBudgetRedirect("Budget d’épargne modifié.");
}

export async function deleteSavingsBudget(id:string){
  const {supabase,user}=await auth();
  const {error}=await supabase.from("personal_savings_budgets").delete().eq("id",id).eq("owner_id",user.id);
  if(error) fail(error.message); savingsBudgetRedirect("Budget d’épargne supprimé.");
}

export async function applySavingsBudgetReallocation(fd:FormData){
  const {supabase,user}=await auth();
  const sourceId=text(fd,"source_budget_id"),destinationId=text(fd,"destination_budget_id"),amount=Math.max(0,number(fd,"amount")||0);
  if(!sourceId||!destinationId||sourceId===destinationId||amount<=0) fail("Réaffectation incorrecte.");
  const {data:rows,error:readError}=await supabase.from("personal_savings_budgets").select("id,allocation_mode,allocation_value,protection,allow_recovery").eq("owner_id",user.id).in("id",[sourceId,destinationId]);
  if(readError) fail(readError.message);
  const source=(rows??[]).find(r=>r.id===sourceId),destination=(rows??[]).find(r=>r.id===destinationId);
  if(!source||!destination) fail("Enveloppe introuvable.");
  if(source.protection==="untouchable") fail("Une enveloppe intouchable ne peut pas être réaffectée.");
  if(source.allocation_mode!=="amount"||destination.allocation_mode!=="amount") fail("La réaffectation automatique V1 est disponible entre enveloppes en montant fixe.");
  const actual=Math.min(amount,Math.max(0,Number(source.allocation_value)));
  if(actual<=0) fail("Aucun montant disponible à réaffecter.");
  const {error:e1}=await supabase.from("personal_savings_budgets").update({allocation_value:Math.max(0,Number(source.allocation_value)-actual)}).eq("id",sourceId).eq("owner_id",user.id); if(e1) fail(e1.message);
  const {error:e2}=await supabase.from("personal_savings_budgets").update({allocation_value:Number(destination.allocation_value)+actual,allow_recovery:true}).eq("id",destinationId).eq("owner_id",user.id); if(e2) fail(e2.message);
  savingsBudgetRedirect("Réaffectation appliquée.");
}
