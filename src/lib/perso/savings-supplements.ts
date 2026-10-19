import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavingsProposalDecision, SavingsSupplement } from "./savings-engine";

/** Missing migration keeps the previous behaviour; other errors must not hide decisions. */
export async function withSavingsSupplements(supabase: SupabaseClient, ownerId: string, decisions: SavingsProposalDecision[]) {
  const rows: (SavingsSupplement & { decision_id: string })[] = [];
  for (let offset = 0; ;) {
    const { data, error } = await supabase.from("personal_savings_supplements")
      .select("id,decision_id,previous_transfer_group_id,amount,status,transfer_group_id")
      .eq("owner_id", ownerId).order("id").range(offset, offset + 499);
    if (error) {
      if (!offset && ["42P01", "PGRST205"].includes(error.code)) return decisions;
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
    if (!data?.length) break;
    offset += data.length;
  }
  return decisions.map(decision => ({ ...decision, supplements: rows.filter(row => row.decision_id === decision.id) }));
}
