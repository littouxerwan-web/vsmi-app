import { accountingDate, occurrenceDate, recurrenceOccurrences, projectionDate } from '../perso/calendar';
import type { RPMovement, RPRecurrence, RPOverride, RPExclusion } from '../perso/reliable-projection-engine';
export type PhotoPayment={wedding_id:string|null;display_name:string;wedding_date:string|null;amount:number;status:string;expected_date:string|null;received_date:string|null};
export type AnnualProfitability={year:number;received:number;expected:number;paidCharges:number;plannedCharges:number;averagePrice:number;weddingCount:number};
const round=(n:number)=>Math.round(n*100)/100;
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function profitability(revenue:number,charges:number,averagePrice:number,rate=21.6){
 const urssaf=round(revenue*rate/100),margin=1-rate/100;
 const breakEven=margin>0?Math.ceil(charges/margin*100)/100:null;
 return {urssaf,profit:round(revenue-charges-urssaf),breakEven,weddingsNeeded:breakEven!==null&&averagePrice>0?Math.ceil(breakEven/averagePrice):null};
}
export function annualPhotoProfitability(input:{today:string;categories:{id:string;name:string;parent_id:string|null}[];movements:RPMovement[];recurrences:(RPRecurrence&{is_active?:boolean})[];overrides:RPOverride[];exclusions:RPExclusion[];payments:PhotoPayment[];weddings:{id:string;wedding_date:string;total_amount:number}[]}){
 const ids=new Set(input.categories.filter(c=>normalize(c.name)==='photographie').map(c=>c.id));
 let grew=true;while(grew){grew=false;for(const c of input.categories)if(c.parent_id&&ids.has(c.parent_id)&&!ids.has(c.id)){ids.add(c.id);grew=true;}}
 const firstYear=Number(input.today.slice(0,4));
 const charges:{date:string;amount:number;paid:boolean}[]=[];
 for(const m of input.movements){if(m.status==='cancelled'||m.movement_type!=='expense'||!m.category_id||!ids.has(m.category_id))continue;charges.push({date:m.status==='completed'?accountingDate(m):projectionDate(m.movement_date,input.today),amount:Number(m.amount),paid:m.status==='completed'});}
 const materialized=new Set(input.movements.filter(m=>m.recurrence_id).map(m=>`${m.recurrence_id}:${occurrenceDate(m)}`));
 const excluded=new Set(input.exclusions.map(e=>`${e.recurrence_id}:${e.occurrence_date}`));
 for(const r of input.recurrences){if(r.is_active===false||r.movement_type!=='expense'||!r.category_id||!ids.has(r.category_id))continue;
  for(const date of recurrenceOccurrences(r,`${input.today.slice(0,7)}-01`,`${firstYear+1}-12-31`)){
   if(materialized.has(`${r.id}:${date}`)||excluded.has(`${r.id}:${date}`))continue;
   const override=input.overrides.find(o=>o.recurrence_id===r.id&&o.occurrence_month.slice(0,7)===date.slice(0,7));
   const years=Math.max(0,Number(date.slice(0,4))-Number(r.start_date.slice(0,4)));
   charges.push({date:projectionDate(date,input.today),amount:round(override?Number(override.amount):Number(r.amount)*Math.pow(1+Number(r.annual_change_percent||0)/100,years)),paid:false});
  }
 }
 const payments=input.payments.filter(p=>p.status!=='cancelled');
 const rows:AnnualProfitability[]=[firstYear,firstYear+1].map(year=>{
  const prefix=String(year),sum=(rows:{amount:number}[])=>round(rows.reduce((n,r)=>n+Number(r.amount),0));
  const weddingAmounts=new Map(input.weddings.filter(w=>w.wedding_date.startsWith(prefix)).map(w=>[`w:${w.id}`,Number(w.total_amount)]));
  const manual=new Map<string,number>();
  for(const p of payments.filter(p=>p.wedding_date?.startsWith(prefix))){const key=p.wedding_id?`w:${p.wedding_id}`:`m:${normalize(p.display_name).replace(/[^a-z0-9]+/g,' ')}:${p.wedding_date}`;if(!weddingAmounts.has(key))manual.set(key,(manual.get(key)??0)+Number(p.amount));}
  for(const [key,value] of manual)weddingAmounts.set(key,value);
  const count=weddingAmounts.size;
  return {year,received:sum(payments.filter(p=>p.status==='received'&&p.received_date?.startsWith(prefix))),expected:sum(payments.filter(p=>p.status==='expected'&&p.expected_date?.startsWith(prefix))),paidCharges:sum(charges.filter(c=>c.paid&&c.date.startsWith(prefix))),plannedCharges:sum(charges.filter(c=>!c.paid&&c.date.startsWith(prefix))),weddingCount:count,averagePrice:count?round([...weddingAmounts.values()].reduce((a,b)=>a+b,0)/count):0};
 });
 return {rows,categoryFound:ids.size>0};
}
