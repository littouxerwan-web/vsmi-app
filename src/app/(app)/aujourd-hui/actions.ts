"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function value(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function amount(fd: FormData) {
  return Number(value(fd, "amount").replace(",", "."));
}

function todayParis() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Session expirée.");
  return { supabase, user };
}

export async function saveDashboardOrder(order: string[]) {
  const { supabase } = await session();
  const safeOrder = Array.isArray(order)
    ? order.filter((key) => typeof key === "string" && (key === "common" || key.startsWith("personal:"))).slice(0, 50)
    : [];
  const { error } = await supabase.auth.updateUser({ data: { dashboard_account_order: safeOrder } });
  if (error) throw new Error(error.message);
  revalidatePath("/aujourd-hui");
  return { ok: true };
}


export async function saveDashboardColors(colors: Record<string, string>) {
  const { supabase } = await session();
  const allowed = new Set(["black", "gold", "silver"]);
  const safeColors = Object.fromEntries(
    Object.entries(colors ?? {})
      .filter(([key, color]) => (key === "common" || key.startsWith("personal:")) && allowed.has(String(color)))
      .slice(0, 50),
  );
  const { error } = await supabase.auth.updateUser({ data: { dashboard_account_colors: safeColors } });
  if (error) throw new Error(error.message);
  revalidatePath("/aujourd-hui");
  return { ok: true };
}

export async function createTodayPersonalMovement(fd: FormData) {
  const { supabase, user } = await session();
  const accountId = value(fd, "account_id");
  const movementType = value(fd, "movement_type");
  const movementAmount = amount(fd);
  const label = value(fd, "label");
  const movementDate = value(fd, "movement_date");
  const status = value(fd, "status") === "completed" ? "completed" : "planned";
  const categoryId = value(fd, "category_id") || null;

  if (!accountId || !label || !movementDate || !["expense", "income"].includes(movementType) || !Number.isFinite(movementAmount) || movementAmount <= 0) {
    throw new Error("Mouvement incomplet.");
  }

  const { data: account, error: accountError } = await supabase
    .from("personal_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (accountError || !account) throw new Error(accountError?.message ?? "Compte introuvable.");

  const completed = status === "completed";
  const { error } = await supabase.from("personal_movements").insert({
    owner_id: user.id,
    account_id: accountId,
    category_id: categoryId,
    movement_type: movementType,
    label,
    amount: movementAmount,
    movement_date: movementDate,
    status,
    completed_date: completed ? todayParis() : null,
    completed_at: completed ? new Date().toISOString() : null,
    exclude_from_analysis: false,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/aujourd-hui");
  revalidatePath("/perso");
  return { ok: true };
}

export async function createTodayCommonMovement(fd: FormData) {
  const { supabase, user } = await session();
  const movementType = value(fd, "movement_type");
  const movementAmount = amount(fd);
  const label = value(fd, "label");
  const movementDate = value(fd, "movement_date");
  const status = value(fd, "status") === "completed" ? "completed" : "planned";
  const categoryId = value(fd, "category_id") || null;

  if (!label || !movementDate || !["expense", "income"].includes(movementType) || !Number.isFinite(movementAmount) || movementAmount <= 0) {
    throw new Error("Mouvement incomplet.");
  }

  const completed = status === "completed";
  const { error } = await supabase.from("common_movements").insert({
    category_id: categoryId,
    movement_type: movementType,
    label,
    amount: movementAmount,
    movement_date: movementDate,
    status,
    completed_date: completed ? todayParis() : null,
    completed_at: completed ? new Date().toISOString() : null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/aujourd-hui");
  revalidatePath("/commun");
  return { ok: true };
}
