/** Civil dates are ISO days, independent of the browser/server time zone. */
export const todayParis = (now = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);
const parse = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
export function addDays(day: string, count: number) {
  const date = parse(day); date.setUTCDate(date.getUTCDate() + count); return iso(date);
}
export function shiftMonth(month: string, count: number) {
  const date = parse(`${month.slice(0, 7)}-01`); date.setUTCMonth(date.getUTCMonth() + count); return iso(date).slice(0, 7);
}
export function monthEnd(month: string) { return addDays(`${shiftMonth(month, 1)}-01`, -1); }
export function addMonthsClamped(day: string, count: number) {
  const month = shiftMonth(day.slice(0, 7), count);
  return `${month}-${String(Math.min(Number(day.slice(8, 10)), Number(monthEnd(month).slice(8, 10)))).padStart(2, "0")}`;
}
export type RecurrenceCalendar = { start_date: string; end_date?: string | null; frequency: string; interval_count: number };
export function recurrenceOccurrences(recurrence: RecurrenceCalendar, from: string, through: string) {
  const result: string[] = [];
  const interval = Math.max(1, Math.trunc(Number(recurrence.interval_count) || 1));
  // Always advance from the original anchor: Jan 31 -> Feb 28 -> Mar 31.
  for (let index = 0; index < 10000; index++) {
    const count = index * interval;
    const day = recurrence.frequency === "weekly" ? addDays(recurrence.start_date, count * 7)
      : addMonthsClamped(recurrence.start_date, count * (recurrence.frequency === "yearly" ? 12 : recurrence.frequency === "quarterly" ? 3 : 1));
    if (day > through || (recurrence.end_date && day > recurrence.end_date)) break;
    if (day >= from) result.push(day);
  }
  return result;
}
export function occurrenceDate(row: { occurrence_date?: string | null; movement_date: string }) {
  return row.occurrence_date ?? row.movement_date;
}
export function accountingDate(row: { completed_date?: string | null; completed_at?: string | null; movement_date: string }) {
  if (row.completed_date) return row.completed_date;
  if (row.completed_at && Number.isFinite(Date.parse(row.completed_at))) return todayParis(new Date(row.completed_at));
  return row.movement_date; // Explicit fallback for legacy completed rows.
}
export const projectionDate = (date: string, today: string) => date < today ? today : date;
export const decisionSlot = (date: string): 1 | 15 => Number(date.slice(8, 10)) < 15 ? 1 : 15;
