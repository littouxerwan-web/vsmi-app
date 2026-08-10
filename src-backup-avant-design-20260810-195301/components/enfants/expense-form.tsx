"use client";

import { useMemo, useState } from "react";

type Option=[string,string];

type Props={
  action:(formData:FormData)=>void|Promise<void>;
  schoolYear:number;
  monthOptions:Option[];
  payerOptions:Option[];
  initial?:{
    id?:string;
    label?:string;
    monthlyAmount?:number;
    annualAmount?:number;
    startMonth?:string;
    endMonth?:string;
    paidBy?:string;
    notes?:string;
    smoothAnnual?:boolean;
  };
  submitLabel:string;
};

const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;

function monthCount(start:string,end:string){
  if(!start||!end)return 1;
  const [sy,sm]=start.split("-").map(Number);
  const [ey,em]=end.split("-").map(Number);
  return Math.max(1,(ey-sy)*12+(em-sm)+1);
}

export function ChildrenExpenseForm({
  action,schoolYear,monthOptions,payerOptions,initial,submitLabel
}:Props){
  const [startMonth,setStartMonth]=useState(initial?.startMonth??monthOptions[0]?.[0]??"");
  const [endMonth,setEndMonth]=useState(initial?.endMonth??monthOptions[0]?.[0]??"");
  const [smooth,setSmooth]=useState(Boolean(initial?.smoothAnnual));
  const activeMonths=useMemo(()=>monthCount(startMonth,endMonth),[startMonth,endMonth]);
  const divisor=smooth?12:activeMonths;

  const initialAnnual=Number(initial?.annualAmount??0);
  const initialMonthly=Number(initial?.monthlyAmount??0);
  const [annual,setAnnual]=useState(
    initialAnnual>0 ? initialAnnual : round2(initialMonthly*(initial?.smoothAnnual?12:activeMonths))
  );
  const [monthly,setMonthly]=useState(
    initialMonthly>0 ? initialMonthly : round2((initialAnnual||0)/(initial?.smoothAnnual?12:activeMonths))
  );

  const recalcUsingAnnual=(nextStart:string,nextEnd:string,nextSmooth:boolean)=>{
    const d=nextSmooth?12:monthCount(nextStart,nextEnd);
    if(annual>0)setMonthly(round2(annual/d));
    else if(monthly>0)setAnnual(round2(monthly*d));
  };

  return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <input type="hidden" name="school_year_start" value={schoolYear}/>
    {initial?.id?<input type="hidden" name="id" value={initial.id}/>:null}

    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-neutral-600">Dépense</span>
      <input
        name="label"
        defaultValue={initial?.label??""}
        required
        className="rounded-xl border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-black"
      />
    </label>

    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-neutral-600">Du mois</span>
      <select
        name="start_month"
        value={startMonth}
        onChange={e=>{
          const v=e.target.value;
          const nextEnd=v>endMonth?v:endMonth;
          setStartMonth(v);
          setEndMonth(nextEnd);
          recalcUsingAnnual(v,nextEnd,smooth);
        }}
        className="rounded-xl border border-black/15 bg-white px-3 py-2.5"
      >
        {monthOptions.map(o=><option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
    </label>

    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-neutral-600">Au mois</span>
      <select
        name="end_month"
        value={endMonth}
        onChange={e=>{
          const v=e.target.value;
          setEndMonth(v);
          recalcUsingAnnual(startMonth,v,smooth);
        }}
        className="rounded-xl border border-black/15 bg-white px-3 py-2.5"
      >
        {monthOptions.map(o=><option key={o[0]} value={o[0]} disabled={o[0]<startMonth}>{o[1]}</option>)}
      </select>
    </label>

    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-neutral-600">Payé par</span>
      <select
        name="paid_by"
        defaultValue={initial?.paidBy??"person_1"}
        className="rounded-xl border border-black/15 bg-white px-3 py-2.5"
      >
        {payerOptions.map(o=><option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
    </label>

    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-neutral-600">Montant mensuel</span>
      <input
        name="amount"
        type="number"
        min=".01"
        step=".01"
        value={monthly || ""}
        onChange={e=>{
          const m=Number(e.target.value.replace(",","."));
          const safe=Number.isFinite(m)?m:0;
          setMonthly(safe);
          setAnnual(round2(safe*divisor));
        }}
        required
        className="rounded-xl border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-black"
      />
    </label>

    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-neutral-600">Montant annuel</span>
      <input
        name="annual_amount"
        type="number"
        min=".01"
        step=".01"
        value={annual || ""}
        onChange={e=>{
          const a=Number(e.target.value.replace(",","."));
          const safe=Number.isFinite(a)?a:0;
          setAnnual(safe);
          setMonthly(round2(safe/divisor));
        }}
        required
        className="rounded-xl border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-black"
      />
    </label>

    <label className="flex items-center gap-3 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2.5 text-sm">
      <input
        name="smooth_annual"
        type="checkbox"
        checked={smooth}
        onChange={e=>{
          const checked=e.target.checked;
          setSmooth(checked);
          recalcUsingAnnual(startMonth,endMonth,checked);
        }}
        className="size-4"
      />
      <span>
        <span className="block font-medium">Lissage annuel</span>
        <span className="block text-xs text-neutral-500">
          {smooth
            ? `Montant annuel réparti sur 12 mois`
            : `Montant annuel réparti sur ${activeMonths} mois`}
        </span>
      </span>
    </label>

    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-neutral-600">Note (facultatif)</span>
      <input
        name="notes"
        defaultValue={initial?.notes??""}
        className="rounded-xl border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-black"
      />
    </label>

    <div className="rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-600 sm:col-span-2 lg:col-span-4">
      {smooth
        ? <>Lissé : <b>{annual?`${annual.toFixed(2)} €`:"0,00 €"}</b> ÷ 12 = <b>{monthly?`${monthly.toFixed(2)} €`:"0,00 €"}</b> par mois de septembre à août.</>
        : <>Non lissé : <b>{annual?`${annual.toFixed(2)} €`:"0,00 €"}</b> ÷ {activeMonths} = <b>{monthly?`${monthly.toFixed(2)} €`:"0,00 €"}</b> uniquement sur la période choisie.</>
      }
    </div>

    <button className="vsmi-press rounded-xl bg-black px-4 py-3 text-sm font-medium text-white sm:col-span-2 lg:col-span-4">
      {submitLabel}
    </button>
  </form>
}
