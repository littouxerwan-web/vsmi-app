import { createClient } from "@/lib/supabase/server";
import { TodayDashboard } from "@/components/today-dashboard";
import { buildReliableProjection } from "@/lib/perso/reliable-projection-engine";
import { buildChildrenProjectedMovements } from "@/lib/perso/children-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const parisDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const N = (value: unknown) => Number(value ?? 0) || 0;

function weddingName(wedding: any) {
  const one = [wedding.partner1_first_name, wedding.partner1_last_name].filter(Boolean).join(" ");
  const two = [wedding.partner2_first_name, wedding.partner2_last_name].filter(Boolean).join(" ");
  return one && two ? `${one} & ${two}` : one || two || "Mariage sans nom";
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  return next;
}

function occurrenceDates(recurrence: any, from: string, to: string) {
  let date = new Date(`${recurrence.start_date}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  const out: string[] = [];
  let guard = 0;
  while (date <= end && guard++ < 1200) {
    const iso = date.toISOString().slice(0, 10);
    if (iso >= from && (!recurrence.end_date || iso <= recurrence.end_date)) out.push(iso);
    if (recurrence.frequency === "weekly") date = new Date(date.getTime() + 7 * 86400000 * Math.max(1, N(recurrence.interval_count)));
    else date = addMonths(date, (recurrence.frequency === "quarterly" ? 3 : recurrence.frequency === "yearly" ? 12 : 1) * Math.max(1, N(recurrence.interval_count)));
  }
  return out;
}

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="p-6">Session expirée. Reconnecte-toi.</main>;

  const today = parisDate();
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(Number(year), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const photoAccess = user.app_metadata?.photo_access === true;
  const personalOnly = user.app_metadata?.role === "personal";

  const [
    { data: accounts = [] },
    { data: snapshots = [] },
    { data: movements = [] },
    { data: categories = [] },
    { data: recurrences = [] },
    { data: overrides = [] },
    { data: exclusions = [] },
    { data: personalSettings },
    { data: savingsProposals = [] },
    { data: savingsBudgets = [] },
    { data: photoPaymentsRaw = [] },
    { data: photoStates = [] },
    { data: urssafStates = [] },
    { data: commonSettings },
    { data: commonSnapshots = [] },
    { data: commonMovements = [] },
    { data: commonCategories = [] },
    { data: commonRecurrences = [] },
    { data: commonOverrides = [] },
    { data: commonExclusions = [] },
    { data: childrenSettings },
    { data: childrenExpenses = [] },
    weddingsResult,
    weddingPaymentsResult,
  ] = await Promise.all([
    supabase.from("personal_accounts").select("id,name,account_type,is_default,color,display_order").eq("owner_id", user.id).eq("is_active", true).order("display_order", { ascending: true }).order("name"),
    supabase.from("personal_balance_snapshots").select("account_id,balance,snapshot_date,created_at").eq("owner_id", user.id).order("snapshot_date", { ascending: false }),
    supabase.from("personal_movements").select("id,account_id,category_id,movement_type,label,amount,movement_date,status,completed_date,completed_at,recurrence_id,transfer_group_id,source_type,source_key").eq("owner_id", user.id).neq("status", "cancelled"),
    supabase.from("personal_categories").select("id,name,movement_type,parent_id,monthly_budget,account_id,budget_period,budget_month,budget_start_date,budget_end_date").eq("owner_id", user.id).eq("is_active", true).order("name"),
    supabase.from("personal_recurrences").select("id,account_id,destination_account_id,category_id,movement_type,label,amount,frequency,interval_count,start_date,end_date,annual_change_percent,is_active").eq("owner_id", user.id).eq("is_active", true).order("start_date"),
    supabase.from("personal_recurrence_overrides").select("recurrence_id,occurrence_month,amount").eq("owner_id", user.id),
    supabase.from("personal_recurrence_exclusions").select("recurrence_id,occurrence_date").eq("owner_id", user.id),
    supabase.from("personal_settings").select("photo_default_account_id,movement_default_account_id,urssaf_default_account_id,savings_source_account_id,savings_destination_account_id,savings_threshold,savings_source_account_2_id,savings_destination_account_2_id,savings_threshold_2,children_sync_enabled,children_sync_account_id,children_sync_day,children_sync_person").eq("owner_id", user.id).maybeSingle(),
    supabase.from("personal_savings_proposals").select("source_account_id,destination_account_id,source_month,amount,status,transfer_group_id").eq("owner_id", user.id),
    supabase.from("personal_savings_budgets").select("id,account_id,name,kind,allocation_mode,allocation_value,protection,allow_recovery,critical_threshold,target_amount,target_date,priority").eq("owner_id", user.id),
    personalOnly ? Promise.resolve({ data: [] }) : supabase.from("wedding_payments").select("id,display_name,wedding_date,payment_type,amount,expected_date,received_date,status").eq("owner_id", user.id).neq("status", "cancelled").order("expected_date"),
    personalOnly ? Promise.resolve({ data: [] }) : supabase.from("personal_photo_payment_states").select("payment_id,account_id,is_completed,completed_date").eq("owner_id", user.id),
    personalOnly ? Promise.resolve({ data: [] }) : supabase.from("personal_urssaf_states").select("contribution_month,account_id,is_completed,completed_date").eq("owner_id", user.id),
    supabase.from("common_settings").select("account_name").eq("singleton", true).maybeSingle(),
    supabase.from("common_balance_snapshots").select("balance,snapshot_date,created_at").order("snapshot_date", { ascending: false }).limit(1),
    supabase.from("common_movements").select("id,movement_type,amount,movement_date,status,completed_date,completed_at,recurrence_id").neq("status", "cancelled"),
    supabase.from("common_categories").select("id,name,movement_type").eq("is_active", true).order("name"),
    supabase.from("common_recurrences").select("id,movement_type,amount,frequency,interval_count,start_date,end_date,is_active").eq("is_active", true).order("start_date"),
    supabase.from("common_recurrence_overrides").select("recurrence_id,occurrence_date,amount"),
    supabase.from("common_recurrence_exclusions").select("recurrence_id,occurrence_date"),
    personalOnly ? Promise.resolve({ data: null }) : supabase.from("children_settings").select("person_1_name,person_2_name,income_person_1,income_person_2").eq("owner_id", user.id).maybeSingle(),
    personalOnly ? Promise.resolve({ data: [] }) : supabase.from("children_expenses").select("label,amount,annual_amount,smooth_annual,start_month,end_month,paid_by").eq("owner_id", user.id).eq("school_year_start", 2026),
    photoAccess ? supabase.from("weddings").select("id,partner1_first_name,partner1_last_name,partner2_first_name,partner2_last_name,wedding_date,city").eq("owner_id", user.id).gte("wedding_date", today).order("wedding_date").limit(6) : Promise.resolve({ data: [] }),
    photoAccess ? supabase.from("wedding_payments").select("amount,expected_date,received_date,status").eq("owner_id", user.id).neq("status", "cancelled") : Promise.resolve({ data: [] }),
  ] as any);

  const latest = new Map<string, any>();
  for (const snapshot of ((snapshots ?? []) as any[])) if (!latest.has(snapshot.account_id)) latest.set(snapshot.account_id, snapshot);

  const completedMovements = ((movements ?? []) as any[]).filter((movement) => {
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

  const photoStateByPayment = new Map(((photoStates ?? []) as any[]).map((state) => [state.payment_id, state]));
  const photoDefaultAccountId = (personalSettings as any)?.photo_default_account_id ?? null;
  const movementDefaultAccountId = (personalSettings as any)?.movement_default_account_id ?? null;
  const urssafDefaultAccountId = (personalSettings as any)?.urssaf_default_account_id ?? null;
  const savingsSourceAccountId = (personalSettings as any)?.savings_source_account_id ?? null;
  const savingsDestinationAccountId = (personalSettings as any)?.savings_destination_account_id ?? null;
  const savingsThreshold = N((personalSettings as any)?.savings_threshold ?? 500);
  const savingsSourceAccount2Id = (personalSettings as any)?.savings_source_account_2_id ?? null;
  const savingsDestinationAccount2Id = (personalSettings as any)?.savings_destination_account_2_id ?? null;
  const savingsThreshold2 = N((personalSettings as any)?.savings_threshold_2 ?? 500);

  const photoPayments = ((photoPaymentsRaw ?? []) as any[]).map((payment) => {
    const state: any = photoStateByPayment.get(payment.id);
    return {
      ...payment,
      accounting_status: payment.status,
      status: state?.is_completed ? "received" : "expected",
      received_date: state?.completed_date ?? null,
      personal_account_id: state?.account_id ?? null,
    };
  });

  const shiftMonth = (monthIso: string, delta: number) => {
    const date = new Date(`${monthIso}-01T12:00:00`);
    date.setMonth(date.getMonth() + delta);
    return date.toISOString().slice(0, 7);
  };
  const photoAccountingMonth = (payment: any) => (payment.accounting_status === "received" ? (payment.received_date ?? payment.expected_date) : payment.expected_date)?.slice(0, 7) ?? null;
  const photoCaForMonth = (monthIso: string) => photoPayments.filter((payment: any) => payment.accounting_status !== "cancelled" && photoAccountingMonth(payment) === monthIso).reduce((sum: number, payment: any) => sum + N(payment.amount), 0);
  const urssafForMonth = (monthIso: string) => Math.round(photoCaForMonth(shiftMonth(monthIso, -1)) * 0.216 * 100) / 100;

  const receivedPhoto = photoPayments.filter((payment: any) => payment.status === "received" && payment.received_date && payment.received_date <= today);
  const liveBalance = (accountId: string) => {
    const snapshot = latest.get(accountId);
    return N(snapshot?.balance)
      + completedMovements.filter((movement) => movement.account_id === accountId).reduce((sum, movement) => sum + (["income", "transfer_in"].includes(movement.movement_type) ? N(movement.amount) : -N(movement.amount)), 0)
      + receivedPhoto.filter((payment: any) => (payment.personal_account_id ?? photoDefaultAccountId) === accountId && payment.received_date > (snapshot?.snapshot_date ?? "0000-00-00")).reduce((sum: number, payment: any) => sum + N(payment.amount), 0)
      - ((urssafStates ?? []) as any[]).filter((state) => state.is_completed && state.account_id === accountId && (state.completed_date ?? "") > (snapshot?.snapshot_date ?? "0000-00-00") && (state.completed_date ?? "") <= today).reduce((sum, state) => sum + urssafForMonth(String(state.contribution_month).slice(0, 7)), 0);
  };
  const currentBalances = Object.fromEntries(((accounts ?? []) as any[]).map((account) => [account.id, liveBalance(account.id)]));

  const childrenSyncEnabled = !personalOnly && Boolean((personalSettings as any)?.children_sync_enabled);
  const childrenSyncAccountId = (personalSettings as any)?.children_sync_account_id ?? null;
  const childrenSyncDay = Math.min(28, Math.max(1, N((personalSettings as any)?.children_sync_day ?? 5)));
  const childrenSyncPerson = ((personalSettings as any)?.children_sync_person === "person_1" ? "person_1" : "person_2") as "person_1" | "person_2";
  const existingChildrenKeys = new Set(((movements ?? []) as any[]).filter((movement) => movement.source_type === "children" && movement.source_key).map((movement) => String(movement.source_key)));
  const childrenProjected = buildChildrenProjectedMovements({
    settings: childrenSettings as any,
    expenses: childrenExpenses as any,
    accountId: childrenSyncAccountId,
    day: childrenSyncDay,
    self: childrenSyncPerson,
    existingSourceKeys: existingChildrenKeys,
    enabled: childrenSyncEnabled,
    throughYear: 2032,
  });
  const projectionMovements = [...(movements as any[]), ...childrenProjected];

  const projection = buildReliableProjection({
    accounts: accounts as any,
    categories: categories as any,
    movements: projectionMovements as any,
    recurrences: recurrences as any,
    overrides: overrides as any,
    exclusions: exclusions as any,
    photoPayments: photoPayments as any,
    photoDefaultAccountId,
    movementDefaultAccountId,
    urssafDefaultAccountId,
    urssafStates: urssafStates as any,
    savingsProposals: savingsProposals as any,
    savingsBudgets: savingsBudgets as any,
    profiles: [
      { id: "profile-1", label: "Épargne 1", sourceAccountId: savingsSourceAccountId, destinationAccountId: savingsDestinationAccountId, threshold: savingsThreshold },
      { id: "profile-2", label: "Épargne 2", sourceAccountId: savingsSourceAccount2Id, destinationAccountId: savingsDestinationAccount2Id, threshold: savingsThreshold2 },
    ],
    currentBalances,
    todayIso: today,
    months: 60,
  });
  const currentAudit: any = (projection.audits as any[]).find((audit) => audit.month === month) ?? null;
  const savingsUseForAccount = (accountId: string) => (projection.operations as any[])
    .filter((operation) => operation.source === "savings" && operation.savingsProposal?.kind === "use" && operation.movement_type === "transfer_in" && operation.account_id === accountId && operation.movement_date.startsWith(month))
    .reduce((sum, operation) => sum + N(operation.amount), 0);

  const commonSnapshot: any = ((commonSnapshots ?? []) as any[])[0];
  const commonSnapshotCreated = commonSnapshot?.created_at ? new Date(commonSnapshot.created_at).getTime() : NaN;
  const commonCompletedAfterSnapshot = ((commonMovements ?? []) as any[]).filter((movement) => {
    if (movement.status !== "completed") return false;
    if (movement.completed_at && Number.isFinite(commonSnapshotCreated)) return new Date(movement.completed_at).getTime() > commonSnapshotCreated;
    return (movement.completed_date ?? movement.movement_date) > (commonSnapshot?.snapshot_date ?? "0000-00-00");
  });
  const commonBalance = N(commonSnapshot?.balance) + commonCompletedAfterSnapshot.reduce((sum, movement) => sum + (movement.movement_type === "income" ? N(movement.amount) : -N(movement.amount)), 0);
  const commonMaterialized = new Set(((commonMovements ?? []) as any[]).filter((movement) => movement.recurrence_id).map((movement) => `${movement.recurrence_id}:${movement.movement_date}`));
  const commonExcluded = new Set(((commonExclusions ?? []) as any[]).map((row) => `${row.recurrence_id}:${row.occurrence_date}`));
  const commonOverride = new Map(((commonOverrides ?? []) as any[]).map((row) => [`${row.recurrence_id}:${row.occurrence_date}`, row]));
  const commonDirectPlanned = ((commonMovements ?? []) as any[]).filter((movement) => movement.status === "planned" && movement.movement_date >= monthStart && movement.movement_date <= monthEnd).reduce((sum, movement) => sum + (movement.movement_type === "income" ? N(movement.amount) : -N(movement.amount)), 0);
  const commonRecurringMissing = ((commonRecurrences ?? []) as any[]).flatMap((recurrence) => occurrenceDates(recurrence, monthStart, monthEnd).filter((date) => !commonMaterialized.has(`${recurrence.id}:${date}`) && !commonExcluded.has(`${recurrence.id}:${date}`)).map((date) => {
    const override: any = commonOverride.get(`${recurrence.id}:${date}`);
    const amount = N(override?.amount ?? recurrence.amount);
    return recurrence.movement_type === "income" ? amount : -amount;
  })).reduce((sum, amount) => sum + amount, 0);
  const commonMonthEnd = commonBalance + commonDirectPlanned + commonRecurringMissing;

  const tiles = [
    ...((accounts ?? []) as any[]).map((account) => {
      const opening = N(currentAudit?.opening?.[account.id] ?? currentBalances[account.id]);
      const beforeSavings = opening + N(currentAudit?.credits?.[account.id]) - N(currentAudit?.debits?.[account.id]);
      const afterSavings = N(currentAudit?.closing?.[account.id] ?? beforeSavings);
      return {
        key: `personal:${account.id}`,
        id: account.id,
        name: account.name,
        type: account.account_type as "checking" | "savings" | "crypto",
        balance: N(currentBalances[account.id]),
        monthEnd: beforeSavings,
        afterSavings,
        savingsUseProposed: savingsUseForAccount(account.id),
        href: `/perso?vue=finances&account=${account.id}`,
      };
    }),
    {
      key: "common",
      id: null,
      name: (commonSettings as any)?.account_name || "Compte commun",
      type: "common" as const,
      balance: commonBalance,
      monthEnd: commonMonthEnd,
      afterSavings: commonMonthEnd,
      savingsUseProposed: 0,
      href: "/commun?vue=encours",
    },
  ];

  const order = Array.isArray(user.user_metadata?.dashboard_account_order) ? user.user_metadata.dashboard_account_order : [];
  const colorsRaw = user.user_metadata?.dashboard_account_colors;
  const initialColors = colorsRaw && typeof colorsRaw === "object" && !Array.isArray(colorsRaw) ? colorsRaw : {};
  const weddingRows = ((weddingsResult as any)?.data ?? []) as any[];
  const weddingPaymentRows = ((weddingPaymentsResult as any)?.data ?? []) as any[];
  const receivedMonth = weddingPaymentRows.filter((payment) => payment.status === "received" && payment.received_date?.startsWith(month)).reduce((sum, payment) => sum + N(payment.amount), 0);
  const expectedYear = weddingPaymentRows.filter((payment) => payment.status === "expected" && payment.expected_date?.startsWith(year)).reduce((sum, payment) => sum + N(payment.amount), 0);

  return (
    <main className="min-h-screen bg-[#0B0B0B] px-3 pb-24 pt-5 text-white sm:px-5 sm:pt-7 lg:px-8 lg:pb-8 lg:pt-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Aujourd’hui</h1>
            <p className="mt-2 text-sm capitalize text-white/45">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${today}T12:00:00`))}</p>
          </div>
        </div>

        <TodayDashboard
          tiles={tiles}
          personalCategories={categories as any}
          commonCategories={commonCategories as any}
          initialOrder={order}
          initialColors={initialColors as any}
          weddings={photoAccess ? weddingRows.map((wedding) => ({ id: wedding.id, name: weddingName(wedding), date: wedding.wedding_date, city: wedding.city })) : []}
          weddingStats={photoAccess ? { upcoming: weddingRows.length, receivedMonth, expectedYear } : null}
        />
      </div>
    </main>
  );
}
