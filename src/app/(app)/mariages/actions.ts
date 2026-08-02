"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MOMENTS = [
  ["preparation", "Préparation", 1],
  ["town_hall", "Mairie", 2],
  ["ceremony", "Église / cérémonie", 3],
  ["couple_photos", "Photos des mariés", 4],
  ["cocktail", "Vin d’honneur", 5],
  ["dinner", "Repas", 6],
  ["first_dance", "Première danse", 7],
] as const;

type MomentType = (typeof MOMENTS)[number][0];

type PaymentInsert = {
  owner_id: string;
  wedding_id: string;
  display_name: string;
  wedding_date: string;
  payment_type: "deposit" | "balance";
  amount: number;
  expected_date: string;
  received_date: string | null;
  status: "received" | "expected";
  source: "automatic";
  notes: string;
};

function optionalText(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  return value || null;
}

function requiredText(formData: FormData, field: string) {
  return String(formData.get(field) ?? "").trim();
}

function amount(formData: FormData, field: string) {
  return Number(String(formData.get(field) ?? "").replace(",", "."));
}

function checked(formData: FormData, field: string) {
  return formData.get(field) === "on";
}

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  return { supabase, user };
}

function displayName(values: {
  partner1First: string | null;
  partner1Last: string | null;
  partner2First: string | null;
  partner2Last: string | null;
}) {
  const one = [values.partner1First, values.partner1Last].filter(Boolean).join(" ");
  const two = [values.partner2First, values.partner2Last].filter(Boolean).join(" ");
  return one && two ? `${one} & ${two}` : one || two || "Mariage sans nom";
}

function paymentRows(args: {
  ownerId: string;
  weddingId: string;
  name: string;
  weddingDate: string;
  totalAmount: number;
  depositDate: string;
  splitBalance: boolean;
  balanceDate1: string | null;
  balanceDate2: string | null;
}) {
  const deposit = Math.round(args.totalAmount * 20) / 100;
  const balance = Math.round((args.totalAmount - deposit) * 100) / 100;
  const rows: PaymentInsert[] = [
    {
      owner_id: args.ownerId,
      wedding_id: args.weddingId,
      display_name: args.name,
      wedding_date: args.weddingDate,
      payment_type: "deposit",
      amount: deposit,
      expected_date: args.depositDate,
      received_date: args.depositDate,
      status: "received",
      source: "automatic",
      notes: "Acompte automatique de 20 % à la création du mariage.",
    },
  ];

  if (args.splitBalance) {
    const first = Math.round((balance / 2) * 100) / 100;
    const second = Math.round((balance - first) * 100) / 100;
    rows.push(
      {
        owner_id: args.ownerId,
        wedding_id: args.weddingId,
        display_name: args.name,
        wedding_date: args.weddingDate,
        payment_type: "balance",
        amount: first,
        expected_date: args.balanceDate1!,
        received_date: null,
        status: "expected",
        source: "automatic",
        notes: "Première échéance du solde.",
      },
      {
        owner_id: args.ownerId,
        wedding_id: args.weddingId,
        display_name: args.name,
        wedding_date: args.weddingDate,
        payment_type: "balance",
        amount: second,
        expected_date: args.balanceDate2!,
        received_date: null,
        status: "expected",
        source: "automatic",
        notes: "Deuxième échéance du solde.",
      },
    );
  } else {
    rows.push({
      owner_id: args.ownerId,
      wedding_id: args.weddingId,
      display_name: args.name,
      wedding_date: args.weddingDate,
      payment_type: "balance",
      amount: balance,
      expected_date: args.weddingDate,
      received_date: null,
      status: "expected",
      source: "automatic",
      notes: "Solde prévu par défaut à la date du mariage.",
    });
  }

  return rows;
}

function validateCore(formData: FormData, returnPath: string) {
  const partner1First = optionalText(formData, "partner1_first_name");
  const partner1Last = optionalText(formData, "partner1_last_name");
  const partner2First = optionalText(formData, "partner2_first_name");
  const partner2Last = optionalText(formData, "partner2_last_name");
  const weddingDate = requiredText(formData, "wedding_date");
  const totalAmount = amount(formData, "total_amount");
  const splitBalance = checked(formData, "split_balance");
  const balanceDate1 = optionalText(formData, "balance_date_1");
  const balanceDate2 = optionalText(formData, "balance_date_2");

  if (!partner1First && !partner1Last && !partner2First && !partner2Last) {
    redirect(`${returnPath}?erreur=${encodeURIComponent("Indique au moins un nom ou un prénom.")}`);
  }
  if (!weddingDate) {
    redirect(`${returnPath}?erreur=${encodeURIComponent("La date du mariage est obligatoire.")}`);
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    redirect(`${returnPath}?erreur=${encodeURIComponent("Le budget total doit être supérieur à zéro.")}`);
  }
  if (splitBalance && (!balanceDate1 || !balanceDate2)) {
    redirect(`${returnPath}?erreur=${encodeURIComponent("Indique les deux dates du solde échelonné.")}`);
  }

  return {
    partner1First,
    partner1Last,
    partner2First,
    partner2Last,
    weddingDate,
    totalAmount,
    splitBalance,
    balanceDate1,
    balanceDate2,
  };
}

function momentRows(formData: FormData, ownerId: string, weddingId: string) {
  return MOMENTS.map(([type, label, position]) => ({
    owner_id: ownerId,
    wedding_id: weddingId,
    moment_type: type,
    label,
    location: optionalText(formData, `${type}_location`),
    scheduled_time: optionalText(formData, `${type}_time`),
    photographer_present: checked(formData, `${type}_present`),
    position,
  }));
}

export async function createWedding(formData: FormData) {
  const { supabase, user } = await auth();
  const values = validateCore(formData, "/mariages/nouveau");
  const name = displayName(values);
  const depositDate = optionalText(formData, "deposit_received_date") ?? new Date().toISOString().slice(0, 10);

  const { data: wedding, error } = await supabase
    .from("weddings")
    .insert({
      owner_id: user.id,
      partner1_first_name: values.partner1First,
      partner1_last_name: values.partner1Last,
      partner2_first_name: values.partner2First,
      partner2_last_name: values.partner2Last,
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      postal_code: optionalText(formData, "postal_code"),
      city: optionalText(formData, "city"),
      wedding_date: values.weddingDate,
      formula: optionalText(formData, "formula"),
      total_amount: values.totalAmount,
      color_delivery: checked(formData, "color_delivery"),
      black_white_delivery: checked(formData, "black_white_delivery"),
      notes: optionalText(formData, "notes"),
    })
    .select("id")
    .single();

  if (error || !wedding) {
    redirect(`/mariages/nouveau?erreur=${encodeURIComponent(error?.message ?? "Création impossible.")}`);
  }

  const [momentsResult, paymentsResult] = await Promise.all([
    supabase.from("wedding_moments").insert(momentRows(formData, user.id, wedding.id)),
    supabase.from("wedding_payments").insert(
      paymentRows({
        ownerId: user.id,
        weddingId: wedding.id,
        name,
        weddingDate: values.weddingDate,
        totalAmount: values.totalAmount,
        depositDate,
        splitBalance: values.splitBalance,
        balanceDate1: values.balanceDate1,
        balanceDate2: values.balanceDate2,
      }),
    ),
  ]);

  if (momentsResult.error || paymentsResult.error) {
    await supabase.from("weddings").delete().eq("id", wedding.id).eq("owner_id", user.id);
    redirect(`/mariages/nouveau?erreur=${encodeURIComponent(momentsResult.error?.message ?? paymentsResult.error?.message ?? "Enregistrement incomplet.")}`);
  }

  revalidatePath("/mariages");
  revalidatePath("/comptabilite");
  revalidatePath("/agenda");
  revalidatePath("/aujourd-hui");
  redirect(`/mariages/${wedding.id}?creation=ok`);
}

export async function updateWedding(weddingId: string, formData: FormData) {
  const { supabase, user } = await auth();
  const values = validateCore(formData, `/mariages/${weddingId}`);
  const name = displayName(values);

  const { error } = await supabase
    .from("weddings")
    .update({
      partner1_first_name: values.partner1First,
      partner1_last_name: values.partner1Last,
      partner2_first_name: values.partner2First,
      partner2_last_name: values.partner2Last,
      email: optionalText(formData, "email"),
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      postal_code: optionalText(formData, "postal_code"),
      city: optionalText(formData, "city"),
      wedding_date: values.weddingDate,
      formula: optionalText(formData, "formula"),
      total_amount: values.totalAmount,
      color_delivery: checked(formData, "color_delivery"),
      black_white_delivery: checked(formData, "black_white_delivery"),
      notes: optionalText(formData, "notes"),
    })
    .eq("id", weddingId)
    .eq("owner_id", user.id);

  if (error) redirect(`/mariages/${weddingId}?erreur=${encodeURIComponent(error.message)}`);

  const rows = momentRows(formData, user.id, weddingId);
  const { error: momentError } = await supabase.from("wedding_moments").upsert(rows, { onConflict: "wedding_id,moment_type" });
  if (momentError) redirect(`/mariages/${weddingId}?erreur=${encodeURIComponent(momentError.message)}`);

  const { data: deposit } = await supabase
    .from("wedding_payments")
    .select("id, received_date")
    .eq("wedding_id", weddingId)
    .eq("payment_type", "deposit")
    .neq("status", "cancelled")
    .maybeSingle();

  await supabase
    .from("wedding_payments")
    .delete()
    .eq("wedding_id", weddingId)
    .eq("owner_id", user.id)
    .eq("payment_type", "balance")
    .eq("status", "expected");

  const depositDate = deposit?.received_date ?? new Date().toISOString().slice(0, 10);
  const rowsPayments = paymentRows({
    ownerId: user.id,
    weddingId,
    name,
    weddingDate: values.weddingDate,
    totalAmount: values.totalAmount,
    depositDate,
    splitBalance: values.splitBalance,
    balanceDate1: values.balanceDate1,
    balanceDate2: values.balanceDate2,
  });

  if (deposit?.id) {
    const depositRow = rowsPayments[0];
    await supabase
      .from("wedding_payments")
      .update({
        display_name: name,
        wedding_date: values.weddingDate,
        amount: depositRow.amount,
        expected_date: depositDate,
        received_date: depositDate,
      })
      .eq("id", deposit.id)
      .eq("owner_id", user.id);
  }

  const { error: paymentError } = await supabase.from("wedding_payments").insert(rowsPayments.slice(1));
  if (paymentError) redirect(`/mariages/${weddingId}?erreur=${encodeURIComponent(paymentError.message)}`);

  revalidatePath("/mariages");
  revalidatePath(`/mariages/${weddingId}`);
  revalidatePath("/comptabilite");
  revalidatePath("/agenda");
  revalidatePath("/aujourd-hui");
  redirect(`/mariages/${weddingId}?modification=ok`);
}

export async function deleteWedding(weddingId: string) {
  const { supabase, user } = await auth();
  const { error } = await supabase.from("weddings").delete().eq("id", weddingId).eq("owner_id", user.id);
  if (error) redirect(`/mariages/${weddingId}?erreur=${encodeURIComponent(error.message)}`);
  revalidatePath("/mariages");
  revalidatePath("/comptabilite");
  revalidatePath("/agenda");
  revalidatePath("/aujourd-hui");
  redirect("/mariages?suppression=ok");
}
