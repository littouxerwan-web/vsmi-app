import { recurrenceOccurrences } from './calendar';

type Schedule = Parameters<typeof recurrenceOccurrences>[0];
export function isRepeatedSchedule(schedule: Schedule) {
  const end = new Date(`${schedule.start_date}T12:00:00Z`);
  end.setUTCFullYear(end.getUTCFullYear() + Math.max(1, schedule.interval_count || 1) * 2 + 1);
  return recurrenceOccurrences(schedule, schedule.start_date, end.toISOString().slice(0, 10)).length > 1;
}

export type MonthlyGroupEntry<T> = { id: string; date: string; categoryId: string | null; recurring: boolean; amount: number; direction?: "credit" | "debit"; completed?: boolean; content: T };
/** Presentation only: amounts are transaction volumes, not projected balances. */
export function groupMonthlyOperations<T>(entries: MonthlyGroupEntry<T>[], categories: {id:string;name:string}[], totalsEntries = entries) {
  const names = new Map(categories.map(c => [c.id, c.name]));
  return [true, false].map(recurring => {
    const rows = entries.filter(row => row.recurring === recurring);
    const totalRows = totalsEntries.filter(row => row.recurring === recurring);
    const sum = (direction: "credit" | "debit", pending: boolean) => Math.round(totalRows.filter(row => row.direction === direction && (!pending || !row.completed)).reduce((n,row)=>n+Math.abs(row.amount),0)*100)/100;
    const groups = new Map<string, MonthlyGroupEntry<T>[]>();
    for (const row of rows) {
      const key = row.categoryId && names.has(row.categoryId) ? row.categoryId : '';
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return { recurring, credits: {pending:sum("credit",true),total:sum("credit",false)}, debits: {pending:sum("debit",true),total:sum("debit",false)}, count: rows.length, total: Math.round(rows.reduce((sum,row)=>sum+Math.abs(row.amount),0)*100)/100,
      categories: [...groups].map(([id, items])=>({id, name:names.get(id)??'Divers', items:[...items].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))}))
        .sort((a,b)=>a.id===''?1:b.id===''?-1:a.name.localeCompare(b.name,'fr')) };
  });
}
