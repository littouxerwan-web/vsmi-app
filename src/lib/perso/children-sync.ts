export type ChildrenExpenseSyncRow={
  label:string; amount:number; annual_amount:number|null; smooth_annual:boolean;
  start_month:string; end_month:string; paid_by:"person_1"|"person_2";
};
export type ChildrenSettingsSync={
  person_1_name:string; person_2_name:string; income_person_1:number; income_person_2:number;
};
export type ChildrenProjectedMovement={
  id:string; account_id:string; category_id:null; movement_type:"income"|"expense";
  label:string; amount:number; movement_date:string; status:"planned";
  recurrence_id:null; transfer_group_id:null; source_type:"children"; source_key:string; virtual_source:true;
};
const round=(v:number)=>Math.round(v*100)/100;
const monthsInclusive=(start:string,end:string)=>{const [sy,sm]=start.slice(0,7).split("-").map(Number),[ey,em]=end.slice(0,7).split("-").map(Number);return Math.max(1,(ey-sy)*12+(em-sm)+1)};
const baseMonths=Array.from({length:12},(_,i)=>{const idx=(8+i)%12;const y=i<4?2026:2027;return `${y}-${String(idx+1).padStart(2,"0")}`});

export function buildChildrenProjectedMovements(input:{
  settings:ChildrenSettingsSync|null;
  expenses:ChildrenExpenseSyncRow[];
  accountId:string|null;
  day:number;
  self:"person_1"|"person_2";
  existingSourceKeys:Set<string>;
  enabled:boolean;
  throughYear?:number;
}){
  if(!input.enabled||!input.accountId||!input.settings)return [] as ChildrenProjectedMovement[];
  const income1=Number(input.settings.income_person_1||0),income2=Number(input.settings.income_person_2||0),sum=income1+income2;
  const share1=sum>0?income1/sum:.5;
  const p1=input.settings.person_1_name||"Personne 1",p2=input.settings.person_2_name||"Personne 2";
  const monthlySettlement=new Map<string,number>(); // positif = personne 1 doit recevoir, négatif = personne 1 doit payer
  for(const month of baseMonths){
    const active=input.expenses.filter(row=>row.smooth_annual||(String(row.start_month).slice(0,7)<=month&&String(row.end_month).slice(0,7)>=month));
    let total=0,paid1=0;
    for(const row of active){
      const activeMonths=monthsInclusive(String(row.start_month),String(row.end_month));
      const annual=Number(row.annual_amount||0)>0?Number(row.annual_amount):Number(row.amount)*(row.smooth_annual?12:activeMonths);
      const monthly=annual/(row.smooth_annual?12:activeMonths);
      total+=monthly;
      if(row.paid_by!=="person_2")paid1+=monthly;
    }
    monthlySettlement.set(month.slice(5,7),round(paid1-total*share1));
  }
  const out:ChildrenProjectedMovement[]=[];
  const through=input.throughYear??2032;
  for(let year=2026;year<=through;year++){
    for(const mm of [...monthlySettlement.keys()]){
      const month=`${year}-${mm}`;
      if(month<"2026-09")continue;
      const balance1=monthlySettlement.get(mm)??0;
      const selfBalance=input.self==="person_1"?balance1:-balance1;
      if(Math.abs(selfBalance)<0.005)continue;
      const key=`children:${month}`;
      if(input.existingSourceKeys.has(key))continue;
      const day=String(Math.min(28,Math.max(1,Math.trunc(input.day||5)))).padStart(2,"0");
      const movementType=selfBalance>0?"income":"expense";
      const other=input.self==="person_1"?p2:p1;
      out.push({
        id:`children-virtual-${month}`,
        account_id:input.accountId,
        category_id:null,
        movement_type:movementType,
        label:`ENFANTS · Régularisation ${other}`,
        amount:round(Math.abs(selfBalance)),
        movement_date:`${month}-${day}`,
        status:"planned",
        recurrence_id:null,
        transfer_group_id:null,
        source_type:"children",
        source_key:key,
        virtual_source:true,
      });
    }
  }
  return out;
}
