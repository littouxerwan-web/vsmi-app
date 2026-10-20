import type { SupabaseClient } from '@supabase/supabase-js';
import { annualPhotoProfitability } from './profitability';
// Read every page: an annual financial total must not silently stop at 1,000 rows.
export async function loadPhotoProfitability(db:SupabaseClient,today:string){
 const {data:{user}}=await db.auth.getUser();
 if(!user)throw new Error('Session absente');
 async function read(table:string,columns:string,order='id'){
  const rows:any[]=[];
  for(let offset=0;;offset+=500){const {data,error}=await db.from(table).select(columns).eq('owner_id',user!.id).order(order).order(table==='personal_recurrence_overrides'?'occurrence_month':table==='personal_recurrence_exclusions'?'occurrence_date':order).range(offset,offset+499);if(error)throw new Error(`Lecture impossible : ${table}`);rows.push(...(data??[]));if((data?.length??0)<500)return rows;}
 }
 const [categories,movements,recurrences,overrides,exclusions,payments,weddings]=await Promise.all([
  read('personal_categories','id,name,parent_id'),
  read('personal_movements','id,account_id,category_id,movement_type,label,amount,movement_date,status,completed_date,completed_at,occurrence_date,recurrence_id'),
  read('personal_recurrences','id,account_id,destination_account_id,category_id,movement_type,label,amount,frequency,interval_count,start_date,end_date,annual_change_percent,is_active'),
  read('personal_recurrence_overrides','recurrence_id,occurrence_month,amount','recurrence_id'),
  read('personal_recurrence_exclusions','recurrence_id,occurrence_date','recurrence_id'),
  read('wedding_payments','id,wedding_id,display_name,wedding_date,amount,status,expected_date,received_date'),
  read('weddings','id,wedding_date,total_amount'),
 ]);
 return annualPhotoProfitability({today,categories,movements,recurrences,overrides,exclusions,payments,weddings});
}
