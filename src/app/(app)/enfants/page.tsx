import Link from "next/link";
import { redirect } from "next/navigation";
import { Baby, Calculator, ChevronLeft, ChevronRight, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createChildrenExpense, deleteChildrenExpense, saveChildrenSettings, updateChildrenExpense } from "./actions";

export const dynamic="force-dynamic";
export const revalidate=0;

const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(v||0);
const N=(v:unknown)=>Number(v??0)||0;
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

function Field({label,name,type="text",defaultValue,...props}:any){
 return <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-neutral-600">{label}</span><input name={name} type={type} defaultValue={defaultValue} {...props} className="rounded-xl border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-black"/></label>
}
function SelectField({label,name,defaultValue,options}:any){
 return <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-neutral-600">{label}</span><select name={name} defaultValue={defaultValue} className="rounded-xl border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-black">{options.map((o:any)=><option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></label>
}
function schoolMonths(year:number){
 return Array.from({length:12},(_,i)=>{
  const monthIndex=(8+i)%12;
  const y=i<4?year:year+1;
  const month=String(monthIndex+1).padStart(2,"0");
  const key=`${y}-${month}`;
  const date=new Date(`${key}-01T12:00:00`);
  return {key,label:new Intl.DateTimeFormat("fr-FR",{month:"long"}).format(date),short:new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(date)};
 });
}
function monthsInclusive(start:string,end:string){
 const [sy,sm]=start.split("-").map(Number),[ey,em]=end.split("-").map(Number);
 return (ey-sy)*12+(em-sm)+1;
}

export default async function ChildrenPage({searchParams}:{searchParams:Promise<any>}){
 const supabase=await createClient();
 const {data,error}=await supabase.auth.getClaims();
 const claims=data?.claims as {sub?:string;app_metadata?:{role?:string;photo_access?:boolean}}|undefined;
 if(error||!claims?.sub) redirect("/connexion");
 if(claims.app_metadata?.photo_access!==true||claims.app_metadata?.role==="personal") redirect("/perso?vue=finances");

 const params=await searchParams;
 const currentYear=Number(today.slice(0,4)),currentMonth=Number(today.slice(5,7));
 const defaultSchoolYear=currentMonth>=9?currentYear:currentYear-1;
 const requestedYear=Number(params?.annee);
 const schoolYear=Number.isInteger(requestedYear)&&requestedYear>=2000&&requestedYear<=2100?requestedYear:defaultSchoolYear;
 const months=schoolMonths(schoolYear);
 const monthOptions=months.map(m=>[m.key,`${m.label.charAt(0).toUpperCase()+m.label.slice(1)} ${m.key.slice(0,4)}`]);

 const [{data:settings},{data:expenses=[]}]=await Promise.all([
  supabase.from("children_settings").select("*").eq("owner_id",claims.sub).maybeSingle(),
  supabase.from("children_expenses").select("id,label,amount,start_month,end_month,school_year_start,notes,paid_by,created_at").eq("owner_id",claims.sub).eq("school_year_start",schoolYear).order("start_month",{ascending:true}).order("created_at",{ascending:true})
 ]);

 const person1=settings?.person_1_name??"Moi",person2=settings?.person_2_name??"Autre parent";
 const income1=N(settings?.income_person_1),income2=N(settings?.income_person_2),incomeTotal=income1+income2;
 const share1=incomeTotal>0?income1/incomeTotal:.5,share2=1-share1;
 const rows=(expenses as any[]).map(x=>({...x,amount:N(x.amount),startKey:String(x.start_month).slice(0,7),endKey:String(x.end_month).slice(0,7)}));

 const calendar=months.map(m=>{
  const active=rows.filter(x=>x.startKey<=m.key&&x.endKey>=m.key);
  const total=active.reduce((a,x)=>a+x.amount,0);
  const paid1=active.filter(x=>x.paid_by!=="person_2").reduce((a,x)=>a+x.amount,0);
  const paid2=active.filter(x=>x.paid_by==="person_2").reduce((a,x)=>a+x.amount,0);
  const due1=total*share1,due2=total*share2;
  const balance1=paid1-due1;
  const transfer=Math.abs(balance1);
  const from=balance1<-.005?person1:balance1>.005?person2:null;
  const to=balance1<-.005?person2:balance1>.005?person1:null;
  return {...m,active,total,paid1,paid2,due1,due2,transfer,from,to};
 });

 const yearTotal=calendar.reduce((a,m)=>a+m.total,0);
 const paid1=calendar.reduce((a,m)=>a+m.paid1,0),paid2=calendar.reduce((a,m)=>a+m.paid2,0);
 const due1=yearTotal*share1,due2=yearTotal*share2;
 const balance1=paid1-due1,transferAmount=Math.abs(balance1);
 const transferFrom=balance1<-.005?person1:balance1>.005?person2:null;
 const transferTo=balance1<-.005?person2:balance1>.005?person1:null;

 return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
  <header className="flex flex-wrap items-center justify-between gap-4">
   <div className="flex items-center gap-3">
    <div className="grid size-11 place-items-center rounded-2xl bg-[#C7A45A]/15 text-[#8B6929]"><Baby size={22}/></div>
    <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#9A7530]">PERSO</p><h1 className="text-2xl font-semibold">Enfants</h1><p className="text-sm text-neutral-500">Frais et régularisation sur une année scolaire de septembre à août.</p></div>
   </div>
   <div className="flex flex-wrap items-center justify-end gap-2">
    <div className="flex items-center gap-2 rounded-2xl border bg-white p-1">
     <Link href={`/enfants?annee=${schoolYear-1}`} className="vsmi-press grid size-9 place-items-center rounded-xl hover:bg-neutral-100" aria-label="Année précédente"><ChevronLeft size={18}/></Link>
     <span className="min-w-28 text-center text-sm font-semibold">{schoolYear} – {schoolYear+1}</span>
     <Link href={`/enfants?annee=${schoolYear+1}`} className="vsmi-press grid size-9 place-items-center rounded-xl hover:bg-neutral-100" aria-label="Année suivante"><ChevronRight size={18}/></Link>
    </div>
    <a href={`/enfants/export?annee=${schoolYear}`} className="vsmi-press inline-flex items-center gap-2 rounded-xl bg-black px-3 py-2.5 text-sm font-medium text-white"><Download size={16}/>PDF annuel</a>
   </div>
  </header>

  {params?.succes?<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{params.succes}</div>:null}

  <section className="rounded-2xl border bg-white p-5">
   <div className="flex items-center gap-2"><Calculator size={18}/><h2 className="font-semibold">Prorata selon les revenus</h2></div>
   <p className="mt-1 text-sm text-neutral-500">La clé de répartition s’applique à toutes les dépenses de l’année scolaire sélectionnée.</p>
   <form action={saveChildrenSettings} className="mt-4 grid gap-3 sm:grid-cols-2">
    <Field label="Nom 1" name="person_1_name" defaultValue={person1}/>
    <Field label="Revenu 1" name="income_person_1" type="number" min="0" step=".01" defaultValue={income1}/>
    <Field label="Nom 2" name="person_2_name" defaultValue={person2}/>
    <Field label="Revenu 2" name="income_person_2" type="number" min="0" step=".01" defaultValue={income2}/>
    <button className="vsmi-press rounded-xl bg-black px-4 py-3 text-sm font-medium text-white sm:col-span-2">Enregistrer et recalculer</button>
   </form>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{person1}</p><b className="text-xl">{(share1*100).toFixed(2)} %</b></div>
    <div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{person2}</p><b className="text-xl">{(share2*100).toFixed(2)} %</b></div>
   </div>
  </section>

  <section className="rounded-2xl border bg-white p-5">
   <div className="flex items-center gap-2"><Plus size={18}/><h2 className="font-semibold">Ajouter une dépense</h2></div>
   <p className="mt-1 text-sm text-neutral-500">Le montant est appliqué à chaque mois compris dans la période sélectionnée.</p>
   <form action={createChildrenExpense} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
    <input type="hidden" name="school_year_start" value={schoolYear}/>
    <Field label="Dépense" name="label" placeholder="Cantine, activité, vêtements…" required/>
    <Field label="Montant mensuel" name="amount" type="number" min=".01" step=".01" required/>
    <SelectField label="Du mois" name="start_month" defaultValue={months[0].key} options={monthOptions}/>
    <SelectField label="Au mois" name="end_month" defaultValue={months[0].key} options={monthOptions}/>
    <SelectField label="Payé par" name="paid_by" defaultValue="person_1" options={[["person_1",person1],["person_2",person2]]}/>
    <Field label="Note (facultatif)" name="notes"/>
    <button className="vsmi-press rounded-xl bg-black px-4 py-3 text-sm font-medium text-white sm:col-span-2 lg:col-span-6">Ajouter la dépense</button>
   </form>
  </section>

  <div className="grid gap-3 sm:grid-cols-3">
   <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-neutral-500">Charges septembre → août</p><b className="text-xl">{money(yearTotal)}</b></div>
   <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-neutral-500">Dépenses paramétrées</p><b className="text-xl">{rows.length}</b></div>
   <div className="rounded-2xl bg-black p-4 text-white"><p className="text-xs text-neutral-400">Année scolaire</p><b className="text-xl">{schoolYear} – {schoolYear+1}</b></div>
  </div>

  <section className="rounded-2xl border-2 border-black bg-white p-5">
   <h2 className="font-semibold">Répartition des dépenses enregistrées</h2>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{person1} · {(share1*100).toFixed(2)} %</p><b className="text-2xl">{money(due1)}</b></div>
    <div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{person2} · {(share2*100).toFixed(2)} %</p><b className="text-2xl">{money(due2)}</b></div>
   </div>
  </section>

  <section className="rounded-2xl bg-black p-5 text-white">
   <h2 className="font-semibold">Régularisation</h2>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <div className="rounded-xl bg-white/10 p-4"><p className="text-xs text-neutral-400">Total payé directement par {person1}</p><p className="mt-1 text-xl font-semibold">{money(paid1)}</p><p className="mt-1 text-xs text-neutral-400">Part théorique : {money(due1)}</p></div>
    <div className="rounded-xl bg-white/10 p-4"><p className="text-xs text-neutral-400">Total payé directement par {person2}</p><p className="mt-1 text-xl font-semibold">{money(paid2)}</p><p className="mt-1 text-xs text-neutral-400">Part théorique : {money(due2)}</p></div>
   </div>
   {transferFrom&&transferTo?<div className="mt-4 border-t border-white/15 pt-4"><p className="text-sm text-neutral-300">{transferFrom} doit verser à {transferTo}</p><p className="mt-1 text-3xl font-semibold">{money(transferAmount)}</p><p className="mt-2 text-xs text-neutral-400">Après ce versement, chacun supporte exactement sa part selon le prorata des revenus.</p></div>:<div className="mt-4 border-t border-white/15 pt-4"><p className="text-xl font-semibold">Aucune régularisation</p><p className="mt-1 text-sm text-neutral-400">Les paiements directs correspondent déjà aux parts théoriques.</p></div>}
  </section>

  <section className="rounded-2xl border bg-white p-5">
   <div><h2 className="font-semibold">Calendrier septembre → août</h2><p className="mt-1 text-sm text-neutral-500">Charges, paiements directs et régularisation mois par mois.</p></div>
   <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {calendar.map(m=><div key={m.key} className="rounded-2xl border border-black/10 p-4">
     <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold capitalize">{m.label}</h3><a href={`/enfants/export?annee=${schoolYear}&mois=${m.key}`} className="vsmi-press mt-1 inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-black"><Download size={13}/>PDF du mois</a></div><span className="text-sm font-semibold">{money(m.total)}</span></div>
     <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-lg bg-neutral-100 p-2"><p className="text-neutral-500">Payé par {person1}</p><b>{money(m.paid1)}</b></div>
      <div className="rounded-lg bg-neutral-100 p-2"><p className="text-neutral-500">Payé par {person2}</p><b>{money(m.paid2)}</b></div>
     </div>
     <div className="mt-2 text-xs text-neutral-500">Parts : {person1} {money(m.due1)} · {person2} {money(m.due2)}</div>
     <div className="mt-3 border-t border-black/10 pt-3">{m.from&&m.to?<><p className="text-xs text-neutral-500">À rétribuer</p><p className="text-sm font-semibold">{m.from} → {m.to} : {money(m.transfer)}</p></>:<p className="text-xs font-medium text-emerald-700">Aucune régularisation</p>}</div>
    </div>)}
   </div>
  </section>

  <section className="overflow-hidden rounded-2xl border bg-white">
   <div className="border-b px-4 py-3"><h2 className="font-semibold">Dépenses paramétrées</h2><p className="text-xs text-neutral-500">Une dépense sur plusieurs mois est répétée au même montant pour chaque mois de sa période.</p></div>
   {rows.length?rows.map(x=>{
    const startLabel=months.find(m=>m.key===x.startKey)?.label??x.startKey;
    const endLabel=months.find(m=>m.key===x.endKey)?.label??x.endKey;
    const count=monthsInclusive(x.startKey,x.endKey);
    const annual=x.amount*count;
    return <div key={x.id} className="border-b p-4 last:border-0">
     <div className="flex items-start justify-between gap-4">
      <div className="min-w-0"><p className="font-medium">{x.label}</p><p className="text-xs text-neutral-500 capitalize">{startLabel}{x.startKey!==x.endKey?` → ${endLabel}`:""} · {count} mois{x.notes?` · ${x.notes}`:""}</p><p className="mt-1 text-xs font-medium text-[#8B6929]">Payé par {x.paid_by==="person_2"?person2:person1}</p></div>
      <div className="shrink-0 text-right"><b>{money(x.amount)}/mois</b>{count>1?<p className="text-xs text-neutral-500">Total {money(annual)}</p>:null}</div>
     </div>
     <details className="mt-3"><summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-600"><Pencil size={14}/>Modifier / Supprimer</summary>
      <form action={updateChildrenExpense} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
       <input type="hidden" name="id" value={x.id}/><input type="hidden" name="school_year_start" value={schoolYear}/>
       <Field label="Dépense" name="label" defaultValue={x.label}/>
       <Field label="Montant mensuel" name="amount" type="number" min=".01" step=".01" defaultValue={x.amount}/>
       <SelectField label="Du mois" name="start_month" defaultValue={x.startKey} options={monthOptions}/>
       <SelectField label="Au mois" name="end_month" defaultValue={x.endKey} options={monthOptions}/>
       <SelectField label="Payé par" name="paid_by" defaultValue={x.paid_by??"person_1"} options={[["person_1",person1],["person_2",person2]]}/>
       <Field label="Note" name="notes" defaultValue={x.notes??""}/>
       <button className="rounded-xl bg-black px-3 py-2 text-sm text-white sm:col-span-2 lg:col-span-6">Enregistrer</button>
      </form>
      <form action={deleteChildrenExpense.bind(null,x.id)} className="mt-2"><button className="flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><Trash2 size={14}/>Supprimer cette dépense</button></form>
     </details>
    </div>
   }):<p className="p-5 text-sm text-neutral-500">Aucune dépense enregistrée pour cette année scolaire.</p>}
  </section>
 </main>
}
