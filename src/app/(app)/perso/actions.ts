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
  const name = text(fd, "name"); const accountType = text(fd, "account_type");
  if (!name) fail("Indique le nom du compte.");
  if (!["checking", "savings"].includes(accountType)) fail("Type de compte incorrect.");
  const { count } = await supabase.from("personal_accounts").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("account_type", accountType);
  const { error } = await supabase.from("personal_accounts").insert({ owner_id: user.id, name, account_type: accountType, is_default: (count ?? 0) === 0 });
  if (error) fail(error.message); refresh("Compte ajouté.");
}

export async function createCategory(fd: FormData) {
  const { supabase, user } = await auth();
  const name = text(fd, "name"); const movementType = text(fd, "movement_type"); const parentId = optional(fd, "parent_id"); const accountId = optional(fd, "account_id"); const monthlyBudget = Math.max(0, number(fd, "monthly_budget") || 0);
  const isPrimaryIncome = movementType === "income" && text(fd, "is_primary_income") === "on";
  const budgetPeriod = text(fd, "budget_period") === "specific_month" ? "specific_month" : "monthly";
  const budgetMonthInput = optional(fd, "budget_month");
  const budgetMonth = budgetPeriod === "specific_month" && budgetMonthInput ? `${budgetMonthInput.slice(0, 7)}-01` : null;
  if (movementType === "expense" && monthlyBudget > 0 && budgetPeriod === "specific_month" && !budgetMonth) fail("Choisis le mois du budget ponctuel.");
  if (!name) fail("Indique le nom de la catégorie.");
  if (!["income", "expense"].includes(movementType)) fail("Type de catégorie incorrect.");
  if (isPrimaryIncome) { const { error: resetError } = await supabase.from("personal_categories").update({ is_primary_income: false }).eq("owner_id", user.id).eq("is_primary_income", true); if (resetError) fail(resetError.message); }
  const { error } = await supabase.from("personal_categories").insert({ owner_id: user.id, name, movement_type: movementType, parent_id: parentId, monthly_budget: movementType === "expense" ? monthlyBudget : 0, account_id: movementType === "expense" ? accountId : null, budget_period: movementType === "expense" ? budgetPeriod : "monthly", budget_month: movementType === "expense" ? budgetMonth : null, is_primary_income: isPrimaryIncome });
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
  if (movementType === "transfer" && payload.destination_account_id === payload.account_id) fail("Le compte émetteur et le compte destinataire doivent être différents.");
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


export async function toggleMovement(id: string, completed: boolean, transferGroupId?: string | null) {
  const { supabase, user } = await auth();
  let query = supabase.from("personal_movements").update({ status: completed ? "completed" : "planned" }).eq("owner_id", user.id);
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
    let query = supabase.from("personal_movements").update({ status: "completed" }).eq("owner_id", user.id);
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
      { owner_id: user.id, account_id: recurrence.account_id, category_id: recurrence.category_id, movement_type: "transfer_out", label: recurrence.label, amount, movement_date: occurrenceDate, status: "completed", notes: recurrence.notes, transfer_group_id: group, recurrence_id: recurrenceId },
      { owner_id: user.id, account_id: recurrence.destination_account_id, category_id: recurrence.category_id, movement_type: "transfer_in", label: recurrence.label, amount, movement_date: occurrenceDate, status: "completed", notes: recurrence.notes, transfer_group_id: group, recurrence_id: recurrenceId },
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
      notes: recurrence.notes,
      recurrence_id: recurrenceId,
    });
    if (error) fail(error.message);
  }
  refresh("Échéance pointée et intégrée au solde à date.");
}

export async function updateAccount(fd: FormData) {
  const { supabase, user } = await auth();
  const id = text(fd, "id"); const name = text(fd, "name");
  if (!id || !name) fail("Compte incomplet.");
  const { error } = await supabase.from("personal_accounts").update({ name }).eq("id", id).eq("owner_id", user.id);
  if (error) fail(error.message); refresh("Compte modifié.");
}

export async function updateCategory(fd: FormData) {
  const { supabase, user } = await auth();
  const id = text(fd, "id"); const name = text(fd, "name"); const accountId = optional(fd, "account_id"); const monthlyBudget = Math.max(0, number(fd, "monthly_budget") || 0);
  const isPrimaryIncome = text(fd, "movement_type") === "income" && text(fd, "is_primary_income") === "on";
  const budgetPeriod = text(fd, "budget_period") === "specific_month" ? "specific_month" : "monthly";
  const budgetMonthInput = optional(fd, "budget_month");
  const budgetMonth = budgetPeriod === "specific_month" && budgetMonthInput ? `${budgetMonthInput.slice(0, 7)}-01` : null;
  if (!id || !name) fail("Catégorie incomplète.");
  if (monthlyBudget > 0 && budgetPeriod === "specific_month" && !budgetMonth) fail("Choisis le mois du budget ponctuel.");
  if (isPrimaryIncome) { const { error: resetError } = await supabase.from("personal_categories").update({ is_primary_income: false }).eq("owner_id", user.id).eq("is_primary_income", true).neq("id", id); if (resetError) fail(resetError.message); }
  const { error } = await supabase.from("personal_categories").update({ name, monthly_budget: monthlyBudget, account_id: accountId, budget_period: budgetPeriod, budget_month: budgetMonth, is_primary_income: isPrimaryIncome }).eq("id", id).eq("owner_id", user.id);
  if (error) fail(error.message); revalidatePath(PATH, "page"); redirect(`${PATH}?vue=finances&succes=${encodeURIComponent("Catégorie modifiée et soldes recalculés.")}`);
}

export async function updateRecurrence(fd: FormData) {
  const { supabase, user } = await auth();
  const id = text(fd, "id"); const amount = number(fd, "amount");
  if (!id || !text(fd, "label") || !Number.isFinite(amount) || amount <= 0) fail("Mouvement régulier incomplet.");
  const { error } = await supabase.from("personal_recurrences").update({ label: text(fd, "label"), amount, end_date: optional(fd, "end_date"), is_active: text(fd, "is_active") !== "false" }).eq("id", id).eq("owner_id", user.id);
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
  if (!id || !label || !accountId || !movementDate || !Number.isFinite(amount) || amount <= 0) fail("Mouvement incomplet.");
  const { error } = await supabase
    .from("personal_movements")
    .update({ label, amount, movement_date: movementDate, account_id: accountId, category_id: categoryId })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) fail(error.message);
  refresh("Mouvement modifié.");
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
  const sourceAccountId = optional(fd, sourceKey);
  const destinationAccountId = optional(fd, destinationKey);
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

  const { data: existing, error: readError } = await supabase.from("personal_settings").select("owner_id").eq("owner_id", user.id).maybeSingle();
  if (readError) fail(readError.message);
  const payload = { [sourceKey]: sourceAccountId, [destinationKey]: destinationAccountId, [thresholdKey]: threshold, updated_at: new Date().toISOString() };
  const query = existing
    ? supabase.from("personal_settings").update(payload).eq("owner_id", user.id)
    : supabase.from("personal_settings").insert({ owner_id: user.id, ...payload });
  const { error } = await query;
  if (error) fail(error.message);
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
  return { sourceAccountId, destinationAccountId, sourceMonth, sourceMonthDate: `${sourceMonth}-01` };
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

export async function acceptSavingsProposal(fd: FormData) {
  const { supabase, user } = await auth();
  const key = savingsProposalKey(fd); const amount = number(fd, "amount");
  if (!Number.isFinite(amount) || amount <= 0) fail("Le montant proposé doit être supérieur à zéro.");
  await verifySavingsAccounts(supabase, user.id, key.sourceAccountId, key.destinationAccountId);
  const { data: existing, error: existingError } = await supabase.from("personal_savings_proposals").select("id,status,transfer_group_id").eq("owner_id", user.id).eq("source_account_id", key.sourceAccountId).eq("destination_account_id", key.destinationAccountId).eq("source_month", key.sourceMonthDate).maybeSingle();
  if (existingError) fail(existingError.message);
  if (existing?.status === "accepted" && existing.transfer_group_id) savingsSuccess(fd, "Ce versement d’épargne est déjà accepté.");
  const { data: accountRows, error: accountError } = await supabase.from("personal_accounts").select("id,account_type").eq("owner_id", user.id).in("id", [key.sourceAccountId, key.destinationAccountId]);
  if (accountError) fail(accountError.message);
  const sourceType = accountRows?.find((row: { id: string; account_type: string }) => row.id === key.sourceAccountId)?.account_type;
  const isSavingsUse = sourceType === "savings";
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
  const movementDate = `${key.sourceMonth}-28`; const group = crypto.randomUUID();
  const label = isSavingsUse ? `Utilisation épargne proposée · ${key.sourceMonth}` : `Versement épargne proposé · ${key.sourceMonth}`;
  const { error: movementError } = await supabase.from("personal_movements").insert([
    { owner_id: user.id, account_id: key.sourceAccountId, category_id: isSavingsUse ? null : category?.id ?? null, movement_type: "transfer_out", label, amount, movement_date: movementDate, status: "planned", transfer_group_id: group },
    { owner_id: user.id, account_id: key.destinationAccountId, category_id: null, movement_type: "transfer_in", label, amount, movement_date: movementDate, status: "planned", transfer_group_id: group },
  ]);
  if (movementError) fail(movementError.message);
  const payload = { owner_id: user.id, source_account_id: key.sourceAccountId, destination_account_id: key.destinationAccountId, source_month: key.sourceMonthDate, amount, status: "accepted", transfer_group_id: group, accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { error } = await supabase.from("personal_savings_proposals").upsert(payload, { onConflict: "owner_id,source_account_id,destination_account_id,source_month" });
  if (error) fail(error.message);
  savingsSuccess(fd, "Proposition d’épargne acceptée et ajoutée aux prévisions.");
}

export async function updateSavingsProposalAmount(fd: FormData) {
  const { supabase, user } = await auth();
  const key = savingsProposalKey(fd); const amount = number(fd, "amount"); const calculationBase = number(fd, "calculation_base");
  if (!Number.isFinite(amount) || amount <= 0) fail("Le montant doit être supérieur à zéro.");
  await verifySavingsAccounts(supabase, user.id, key.sourceAccountId, key.destinationAccountId);
  const { data: existing, error: readError } = await supabase.from("personal_savings_proposals").select("status,transfer_group_id").eq("owner_id", user.id).eq("source_account_id", key.sourceAccountId).eq("destination_account_id", key.destinationAccountId).eq("source_month", key.sourceMonthDate).maybeSingle();
  if (readError) fail(readError.message);
  if (existing?.status === "accepted" && existing.transfer_group_id) {
    const { error } = await supabase.from("personal_movements").update({ amount }).eq("owner_id", user.id).eq("transfer_group_id", existing.transfer_group_id);
    if (error) fail(error.message);
  }
  const { error } = await supabase.from("personal_savings_proposals").upsert({ owner_id: user.id, source_account_id: key.sourceAccountId, destination_account_id: key.destinationAccountId, source_month: key.sourceMonthDate, amount, calculation_base: Number.isFinite(calculationBase) ? calculationBase : null, status: existing?.status === "accepted" ? "accepted" : "pending", transfer_group_id: existing?.transfer_group_id ?? null, updated_at: new Date().toISOString() }, { onConflict: "owner_id,source_account_id,destination_account_id,source_month" });
  if (error) fail(error.message);
  savingsSuccess(fd, "Montant du versement d’épargne modifié.");
}

export async function deleteSavingsProposal(fd: FormData) {
  const { supabase, user } = await auth();
  const key = savingsProposalKey(fd);
  const { data: existing, error: readError } = await supabase.from("personal_savings_proposals").select("transfer_group_id").eq("owner_id", user.id).eq("source_account_id", key.sourceAccountId).eq("destination_account_id", key.destinationAccountId).eq("source_month", key.sourceMonthDate).maybeSingle();
  if (readError) fail(readError.message);
  if (existing?.transfer_group_id) {
    const { error } = await supabase.from("personal_movements").delete().eq("owner_id", user.id).eq("transfer_group_id", existing.transfer_group_id);
    if (error) fail(error.message);
  }
  const { error } = await supabase.from("personal_savings_proposals").upsert({ owner_id: user.id, source_account_id: key.sourceAccountId, destination_account_id: key.destinationAccountId, source_month: key.sourceMonthDate, amount: 0, status: "deleted", transfer_group_id: null, accepted_at: null, updated_at: new Date().toISOString() }, { onConflict: "owner_id,source_account_id,destination_account_id,source_month" });
  if (error) fail(error.message);
  savingsSuccess(fd, "Proposition d’épargne supprimée.");
}
