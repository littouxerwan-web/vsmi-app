import type { SupabaseClient } from "@supabase/supabase-js";

/** Optional until the dedicated migration is installed. Other errors must not hide overrides. */
export async function loadMonthlyBudgetOverrides(supabase: SupabaseClient, ownerId: string) {
  const rows: { category_id: string; budget_month: string; amount: number }[] = [];
  const pageSize = 500;
  for (let offset = 0; ;) {
    const { data, error } = await supabase.from("personal_budget_month_overrides")
      .select("category_id,budget_month,amount").eq("owner_id", ownerId)
      .order("category_id").order("budget_month").range(offset, offset + pageSize - 1);
    if (error) {
      if (offset === 0 && ["42P01", "PGRST205"].includes(error.code)) return { rows, available: false };
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
    if (!data?.length) return { rows, available: true };
    // Advance by the actual count if the API applies a lower server-side cap.
    offset += data.length;
  }
}
