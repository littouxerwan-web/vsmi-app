import { createClient } from "@/lib/supabase/server";
import { TodayDashboard } from "@/components/today-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const parisDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function weddingName(wedding: any) {
  const one = [wedding.partner1_first_name, wedding.partner1_last_name].filter(Boolean).join(" ");
  const two = [wedding.partner2_first_name, wedding.partner2_last_name].filter(Boolean).join(" ");
  return one && two ? `${one} & ${two}` : one || two || "Mariage sans nom";
}

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="p-6">Session expirée. Reconnecte-toi.</main>;

  const today = parisDate();
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const photoAccess = user.app_metadata?.photo_access === true;

  const [
    { data: accounts = [] },
    { data: snapshots = [] },
    { data: movements = [] },
    { data: categories = [] },
    { data: personalSettings },
    { data: photoPaymentsRaw = [] },
    { data: photoStates = [] },
    { data: urssafStates = [] },
    { data: commonSettings },
    { data: commonSnapshots = [] },
    { data: commonMovements = [] },
    { data: commonCategories = [] },
    weddingsResult,
    weddingPaymentsResult,
  ] = await Promise.all([
    supabase.from("personal_accounts").select("id,name,account_type,color,display_order").eq("owner_id", user.id).eq("is_active", true).order("display_order", { ascending: true }).order("name"),
    supabase.from("personal_balance_snapshots").select("account_id,balance,snapshot_date,created_at").eq("owner_id", user.id).order("snapshot_date", { ascending: false }),
    supabase.from("personal_movements").select("account_id,movement_type,amount,movement_date,status,completed_date,completed_at").eq("owner_id", user.id).neq("status", "cancelled"),
    supabase.from("personal_categories").select("id,name,movement_type,account_id").eq("owner_id", user.id).eq("is_active", true).order("name"),
    supabase.from("personal_settings").select("photo_default_account_id").eq("owner_id", user.id).maybeSingle(),
    photoAccess ? supabase.from("wedding_payments").select("id,amount,expected_date,received_date,status").eq("owner_id", user.id).neq("status", "cancelled") : Promise.resolve({ data: [] }),
    photoAccess ? supabase.from("personal_photo_payment_states").select("payment_id,account_id,is_completed,completed_date").eq("owner_id", user.id) : Promise.resolve({ data: [] }),
    photoAccess ? supabase.from("personal_urssaf_states").select("contribution_month,account_id,is_completed,completed_date").eq("owner_id", user.id) : Promise.resolve({ data: [] }),
    supabase.from("common_settings").select("account_name").eq("singleton", true).maybeSingle(),
    supabase.from("common_balance_snapshots").select("balance,snapshot_date,created_at").order("snapshot_date", { ascending: false }).limit(1),
    supabase.from("common_movements").select("movement_type,amount,movement_date,status,completed_date,completed_at").neq("status", "cancelled"),
    supabase.from("common_categories").select("id,name,movement_type").eq("is_active", true).order("name"),
    photoAccess ? supabase.from("weddings").select("id,partner1_first_name,partner1_last_name,partner2_first_name,partner2_last_name,wedding_date,city").eq("owner_id", user.id).gte("wedding_date", today).order("wedding_date").limit(6) : Promise.resolve({ data: [] }),
    photoAccess ? supabase.from("wedding_payments").select("amount,expected_date,received_date,status").eq("owner_id", user.id).neq("status", "cancelled") : Promise.resolve({ data: [] }),
  ] as any);

  const latest = new Map<string, any>();
  for (const snapshot of snapshots as any[]) if (!latest.has(snapshot.account_id)) latest.set(snapshot.account_id, snapshot);

  const completedMovements = (movements as any[]).filter((movement) => {
    if (movement.status !== "completed") return false;
    const snapshot = latest.get(movement.account_id);
    const effectiveDate = movement.completed_date ?? movement.movement_date;
    if (effectiveDate > today) return false;
    if (!snapshot) return true;
    if (!movement.completed_at) return effectiveDate > snapshot.snapshot_date;
    const snapshotCreatedAt = snapshot.created_at ? new Date(snapshot.created_at).getTime() : NaN;
    const completedAt = new Date(movement.completed_at).getTime();
    if (Number.isFinite(snapshotCreatedAt) && Number.isFinite(completedAt)) return completedAt > snapshotCreatedAt;
    return effectiveDate > snapshot.snapshot_date;
  });

  const photoStateByPayment = new Map((photoStates as any[]).map((state) => [state.payment_id, state]));
  const photoDefaultAccountId = (personalSettings as any)?.photo_default_account_id ?? null;
  const receivedPhoto = (photoPaymentsRaw as any[]).map((payment) => {
    const state: any = photoStateByPayment.get(payment.id);
    return { ...payment, is_received: Boolean(state?.is_completed), account_id: state?.account_id ?? photoDefaultAccountId, received_date_effective: state?.completed_date ?? payment.received_date };
  }).filter((payment) => payment.is_received && payment.received_date_effective && payment.received_date_effective <= today);

  const shiftMonth = (monthIso: string, delta: number) => {
    const date = new Date(`${monthIso}-01T12:00:00`);
    date.setMonth(date.getMonth() + delta);
    return date.toISOString().slice(0, 7);
  };
  const photoCaForMonth = (monthIso: string) => (photoPaymentsRaw as any[])
    .filter((payment) => payment.status !== "cancelled" && (payment.status === "received" ? (payment.received_date ?? payment.expected_date) : payment.expected_date)?.startsWith(monthIso))
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const urssafForMonth = (monthIso: string) => Math.round(photoCaForMonth(shiftMonth(monthIso, -1)) * 0.216 * 100) / 100;

  const liveBalance = (accountId: string) => {
    const snapshot = latest.get(accountId);
    return Number(snapshot?.balance ?? 0)
      + completedMovements.filter((movement) => movement.account_id === accountId).reduce((sum, movement) => sum + (["income", "transfer_in"].includes(movement.movement_type) ? Number(movement.amount) : -Number(movement.amount)), 0)
      + receivedPhoto.filter((payment) => payment.account_id === accountId && payment.received_date_effective > (snapshot?.snapshot_date ?? "0000-00-00")).reduce((sum, payment) => sum + Number(payment.amount), 0)
      - (urssafStates as any[]).filter((state) => state.is_completed && state.account_id === accountId && (state.completed_date ?? "") > (snapshot?.snapshot_date ?? "0000-00-00") && (state.completed_date ?? "") <= today).reduce((sum, state) => sum + urssafForMonth(String(state.contribution_month).slice(0, 7)), 0);
  };

  const commonSnapshot: any = (commonSnapshots as any[])[0];
  const commonSnapshotCreated = commonSnapshot?.created_at ? new Date(commonSnapshot.created_at).getTime() : NaN;
  const commonCompletedAfterSnapshot = (commonMovements as any[]).filter((movement) => {
    if (movement.status !== "completed") return false;
    if (movement.completed_at && Number.isFinite(commonSnapshotCreated)) return new Date(movement.completed_at).getTime() > commonSnapshotCreated;
    return (movement.completed_date ?? movement.movement_date) > (commonSnapshot?.snapshot_date ?? "0000-00-00");
  });
  const commonBalance = Number(commonSnapshot?.balance ?? 0) + commonCompletedAfterSnapshot.reduce((sum, movement) => sum + (movement.movement_type === "income" ? Number(movement.amount) : -Number(movement.amount)), 0);

  const tiles = [
    ...(accounts as any[]).map((account) => ({
      key: `personal:${account.id}`,
      id: account.id,
      name: account.name,
      type: account.account_type as "checking" | "savings" | "crypto",
      balance: liveBalance(account.id),
      href: account.account_type === "checking" ? `/perso?vue=finances&account=${account.id}` : `/perso?vue=projection&account=${account.id}`,
    })),
    {
      key: "common",
      id: null,
      name: (commonSettings as any)?.account_name || "Compte commun",
      type: "common" as const,
      balance: commonBalance,
      href: "/commun?vue=encours",
    },
  ];

  const order = Array.isArray(user.user_metadata?.dashboard_account_order) ? user.user_metadata.dashboard_account_order : [];
  const weddingRows = ((weddingsResult as any)?.data ?? []) as any[];
  const weddingPaymentRows = ((weddingPaymentsResult as any)?.data ?? []) as any[];
  const receivedMonth = weddingPaymentRows.filter((payment) => payment.status === "received" && payment.received_date?.startsWith(month)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const expectedYear = weddingPaymentRows.filter((payment) => payment.status === "expected" && payment.expected_date?.startsWith(year)).reduce((sum, payment) => sum + Number(payment.amount), 0);

  return (
    <main className="px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[.22em] text-[#9A7530]">VSMI</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Aujourd’hui</h1>
          <p className="mt-2 text-sm text-neutral-500">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${today}T12:00:00`))}</p>
        </div>

        <TodayDashboard
          tiles={tiles}
          personalCategories={categories as any}
          commonCategories={commonCategories as any}
          initialOrder={order}
          weddings={photoAccess ? weddingRows.map((wedding) => ({ id: wedding.id, name: weddingName(wedding), date: wedding.wedding_date, city: wedding.city })) : []}
          weddingStats={photoAccess ? { upcoming: weddingRows.length, receivedMonth, expectedYear } : null}
        />
      </div>
    </main>
  );
}
