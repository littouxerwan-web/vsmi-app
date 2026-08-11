"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PATH = "/osteo";
const todayParis = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const num = (fd: FormData, key: string) => Number(String(fd.get(key) ?? "0").replace(",", "."));
const opt = (fd: FormData, key: string) => text(fd, key) || null;

async function auth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.osteo_access !== true) redirect("/aujourd-hui");
  return { supabase, user };
}

function dueDate(month: string, day: number) {
  const [y, m] = month.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(Math.max(1, day), last)).padStart(2, "0")}`;
}

async function deletePersonalMovement(supabase: any, ownerId: string, movementId?: string | null) {
  if (!movementId) return;
  await supabase.from("personal_movements").delete().eq("id", movementId).eq("owner_id", ownerId);
}

async function syncFee(supabase: any, userId: string, fee: any, bankAccountId: string | null) {
  if (!bankAccountId || fee.payment_method === "cash") {
    await deletePersonalMovement(supabase, userId, fee.personal_movement_id);
    if (fee.personal_movement_id) await supabase.from("osteo_fees").update({ personal_movement_id: null }).eq("id", fee.id).eq("owner_id", userId);
    return;
  }
  const label = `OSTEO • Honoraires ${fee.payment_method === "cb" ? "CB" : "Chèque"}`;
  const payload = { owner_id: userId, account_id: bankAccountId, category_id: null, movement_type: "income", label, amount: Number(fee.amount), movement_date: fee.fee_date, status: "planned", notes: `Synchronisé depuis OSTEO • honoraire ${fee.id}` };
  if (fee.personal_movement_id) {
    const { error } = await supabase.from("personal_movements").update(payload).eq("id", fee.personal_movement_id).eq("owner_id", userId);
    if (!error) return;
  }
  const { data, error } = await supabase.from("personal_movements").insert(payload).select("id").single();
  if (!error && data?.id) await supabase.from("osteo_fees").update({ personal_movement_id: data.id }).eq("id", fee.id).eq("owner_id", userId);
}

async function syncCharge(supabase: any, userId: string, charge: any, bankAccountId: string | null) {
  const date = dueDate(charge.month, Number(charge.due_day));
  const shouldProject = Boolean(bankAccountId && charge.project_to_personal && Number(charge.amount) > 0 && date >= todayParis());
  if (!shouldProject) {
    await deletePersonalMovement(supabase, userId, charge.personal_movement_id);
    if (charge.personal_movement_id) await supabase.from("osteo_charges").update({ personal_movement_id: null }).eq("id", charge.id).eq("owner_id", userId);
    return;
  }
  const payload = { owner_id: userId, account_id: bankAccountId, category_id: null, movement_type: "expense", label: `OSTEO • ${charge.label}`, amount: Number(charge.amount), movement_date: date, status: charge.paid ? "completed" : "planned", completed_date: charge.paid ? date : null, completed_at: charge.paid ? new Date().toISOString() : null, notes: `Synchronisé depuis OSTEO • charge ${charge.id}` };
  if (charge.personal_movement_id) {
    const { error } = await supabase.from("personal_movements").update(payload).eq("id", charge.personal_movement_id).eq("owner_id", userId);
    if (!error) return;
  }
  const { data, error } = await supabase.from("personal_movements").insert(payload).select("id").single();
  if (!error && data?.id) await supabase.from("osteo_charges").update({ personal_movement_id: data.id }).eq("id", charge.id).eq("owner_id", userId);
}

async function bankAccountId(supabase: any, userId: string) {
  const { data } = await supabase.from("osteo_settings").select("bank_account_id").eq("owner_id", userId).maybeSingle();
  return data?.bank_account_id ?? null;
}

export async function saveOsteoSettings(fd: FormData) {
  const { supabase, user } = await auth();
  const accountId = opt(fd, "bank_account_id");
  const { error } = await supabase.from("osteo_settings").upsert({ owner_id: user.id, bank_account_id: accountId }, { onConflict: "owner_id" });
  if (error) throw new Error(error.message);
  const [{ data: fees = [] }, { data: charges = [] }] = await Promise.all([
    supabase.from("osteo_fees").select("*").eq("owner_id", user.id).gte("fee_date", todayParis()),
    supabase.from("osteo_charges").select("*").eq("owner_id", user.id).gte("month", `${todayParis().slice(0,7)}-01`),
  ]);
  for (const fee of fees as any[]) await syncFee(supabase, user.id, fee, accountId);
  for (const charge of charges as any[]) await syncCharge(supabase, user.id, charge, accountId);
  revalidatePath(PATH); revalidatePath("/perso");
}

export async function createFee(fd: FormData) {
  const { supabase, user } = await auth();
  const feeDate = text(fd, "fee_date"); const method = text(fd, "payment_method"); const amount = num(fd, "amount");
  if (!feeDate || !["cb","cash","cheque"].includes(method) || !Number.isFinite(amount) || amount <= 0) throw new Error("Honoraire incomplet.");
  const { data, error } = await supabase.from("osteo_fees").insert({ owner_id: user.id, fee_date: feeDate, payment_method: method, amount }).select("*").single();
  if (error) throw new Error(error.message);
  await syncFee(supabase, user.id, data, await bankAccountId(supabase, user.id));
  revalidatePath(PATH); revalidatePath("/perso");
}

export async function updateFee(fd: FormData) {
  const { supabase, user } = await auth(); const id=text(fd,"id");
  const payload={ fee_date:text(fd,"fee_date"), payment_method:text(fd,"payment_method"), amount:num(fd,"amount") };
  const { data, error } = await supabase.from("osteo_fees").update(payload).eq("id",id).eq("owner_id",user.id).select("*").single();
  if (error) throw new Error(error.message);
  await syncFee(supabase,user.id,data,await bankAccountId(supabase,user.id));
  revalidatePath(PATH); revalidatePath("/perso");
}

export async function deleteFee(fd: FormData) {
  const { supabase, user } = await auth(); const id=text(fd,"id");
  const { data } = await supabase.from("osteo_fees").select("personal_movement_id").eq("id",id).eq("owner_id",user.id).maybeSingle();
  await deletePersonalMovement(supabase,user.id,data?.personal_movement_id);
  const { error } = await supabase.from("osteo_fees").delete().eq("id",id).eq("owner_id",user.id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH); revalidatePath("/perso");
}

export async function saveMonthlySettings(fd: FormData) {
  const { supabase, user } = await auth(); const month=`${text(fd,"month").slice(0,7)}-01`;
  const payload={ owner_id:user.id, month, sublease_income:num(fd,"sublease_income")||0, km_per_day:num(fd,"km_per_day")||0, benefit_previous_year:num(fd,"benefit_previous_year")||0 };
  const { error }=await supabase.from("osteo_monthly_settings").upsert(payload,{onConflict:"owner_id,month"}); if(error) throw new Error(error.message);
  revalidatePath(PATH);
}

export async function updateCharge(fd: FormData) {
  const { supabase, user } = await auth(); const id=text(fd,"id");
  const payload={ due_day:Math.min(31,Math.max(1,Math.trunc(num(fd,"due_day")||1))), label:text(fd,"label"), amount:Math.max(0,num(fd,"amount")||0), paid:text(fd,"paid")==="on", project_to_personal:text(fd,"project_to_personal")==="on" };
  const { data,error }=await supabase.from("osteo_charges").update(payload).eq("id",id).eq("owner_id",user.id).select("*").single(); if(error) throw new Error(error.message);
  await syncCharge(supabase,user.id,data,await bankAccountId(supabase,user.id));
  revalidatePath(PATH); revalidatePath("/perso");
}

export async function createCharge(fd: FormData) {
  const { supabase,user }=await auth(); const month=`${text(fd,"month").slice(0,7)}-01`; const label=text(fd,"label");
  const categoryKey=`custom_${crypto.randomUUID().slice(0,8)}`;
  const payload={owner_id:user.id,month,due_day:Math.min(31,Math.max(1,Math.trunc(num(fd,"due_day")||1))),category_key:categoryKey,label,amount:Math.max(0,num(fd,"amount")||0),paid:false,project_to_personal:text(fd,"project_to_personal")==="on",sort_order:999};
  if(!label) throw new Error("Nom de charge obligatoire.");
  const {data,error}=await supabase.from("osteo_charges").insert(payload).select("*").single(); if(error) throw new Error(error.message);
  await syncCharge(supabase,user.id,data,await bankAccountId(supabase,user.id)); revalidatePath(PATH); revalidatePath("/perso");
}
