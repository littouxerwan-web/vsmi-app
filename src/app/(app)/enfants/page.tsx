import { redirect } from "next/navigation";
import { Baby, Calculator, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createChildrenExpense, deleteChildrenExpense, saveChildrenSettings, updateChildrenExpense } from "./actions";

export const dynamic="force-dynamic";
export const revalidate=0;

const money=(n:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n||0);
const n=(v:unknown)=>Number(v??0)||0;
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

function Field({label,name,type="text",defaultValue,...props}:any){
 return <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-neutral-600">{label}</span><input name={name} type={type} defaultValue={defaultValue} {...props} className="rounded-xl border border-black/15 bg-white px-3 py-2.5 outline-none focus:border-black"/></label>
}

export default async function ChildrenPage({searchParams}:{searchParams:Promise<any>}){
 const supabase=await createClient();
 const {data,error}=await supabase.auth.getClaims();
 const claims=data?.claims as {sub?:string;app_metadata?:{role?:string;photo_access?:boolean}}|undefined;
 if(error||!claims?.sub) redirect("/connexion");
 if(claims.app_metadata?.photo_access!==true||claims.app_metadata?.role==="personal") redirect("/perso?vue=finances");

 const params=await searchParams;
 const [{data:settings},{data:expenses=[]}]=await Promise.all([
  supabase.from("children_settings").select("*").eq("owner_id",claims.sub).maybeSingle(),
  supabase.from("children_expenses").select("*").eq("owner_id",claims.sub).order("expense_date",{ascending:false}).order("created_at",{ascending:false})
 ]);

 const income1=n(settings?.income_person_1),income2=n(settings?.income_person_2),incomeTotal=income1+income2;
 const share1=incomeTotal>0?income1/incomeTotal:.5,share2=1-share1;
 const rows=(expenses as any[]).map(x=>({...x,amount:n(x.amount)}));
 const total=rows.reduce((a,x)=>a+x.amount,0);
 const due1=total*share1,due2=total*share2;
 const month=today.slice(0,7);
 const monthRows=rows.filter(x=>String(x.expense_date).slice(0,7)===month);
 const monthTotal=monthRows.reduce((a,x)=>a+x.amount,0);

 return <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
  <header className="flex items-center gap-3">
   <div className="grid size-11 place-items-center rounded-2xl bg-[#C7A45A]/15 text-[#8B6929]"><Baby size={22}/></div>
   <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#9A7530]">PERSO</p><h1 className="text-2xl font-semibold">Enfants</h1><p className="text-sm text-neutral-500">Répartition indépendante des frais liés aux enfants.</p></div>
  </header>

  {params?.succes?<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{params.succes}</div>:null}

  <section className="rounded-2xl border bg-white p-5">
   <div className="flex items-center gap-2"><Calculator size={18}/><h2 className="font-semibold">Prorata selon les revenus</h2></div>
   <p className="mt-1 text-sm text-neutral-500">Ces revenus servent uniquement à calculer la clé de répartition des dépenses de cette page.</p>
   <form action={saveChildrenSettings} className="mt-4 grid gap-3 sm:grid-cols-2">
    <Field label="Nom 1" name="person_1_name" defaultValue={settings?.person_1_name??"Moi"}/>
    <Field label="Revenu 1" name="income_person_1" type="number" min="0" step=".01" defaultValue={income1}/>
    <Field label="Nom 2" name="person_2_name" defaultValue={settings?.person_2_name??"Autre parent"}/>
    <Field label="Revenu 2" name="income_person_2" type="number" min="0" step=".01" defaultValue={income2}/>
    <button className="vsmi-press rounded-xl bg-black px-4 py-3 text-sm font-medium text-white sm:col-span-2">Enregistrer et recalculer</button>
   </form>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{settings?.person_1_name??"Moi"}</p><b className="text-xl">{(share1*100).toFixed(2)} %</b></div>
    <div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{settings?.person_2_name??"Autre parent"}</p><b className="text-xl">{(share2*100).toFixed(2)} %</b></div>
   </div>
  </section>

  <section className="rounded-2xl border bg-white p-5">
   <div className="flex items-center gap-2"><Plus size={18}/><h2 className="font-semibold">Ajouter une dépense</h2></div>
   <form action={createChildrenExpense} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Field label="Dépense" name="label" placeholder="Cantine, vêtements…" required/>
    <Field label="Montant" name="amount" type="number" min=".01" step=".01" required/>
    <Field label="Date" name="expense_date" type="date" defaultValue={today} required/>
    <Field label="Note (facultatif)" name="notes"/>
    <button className="vsmi-press rounded-xl bg-black px-4 py-3 text-sm font-medium text-white sm:col-span-2 lg:col-span-4">Ajouter la dépense</button>
   </form>
  </section>

  <div className="grid gap-3 sm:grid-cols-3">
   <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-neutral-500">Dépenses ce mois</p><b className="text-xl">{money(monthTotal)}</b></div>
   <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-neutral-500">Total enregistré</p><b className="text-xl">{money(total)}</b></div>
   <div className="rounded-2xl bg-black p-4 text-white"><p className="text-xs text-neutral-400">Nombre de dépenses</p><b className="text-xl">{rows.length}</b></div>
  </div>

  <section className="rounded-2xl border-2 border-black bg-white p-5">
   <h2 className="font-semibold">Répartition des dépenses enregistrées</h2>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{settings?.person_1_name??"Moi"} · {(share1*100).toFixed(2)} %</p><b className="text-2xl">{money(due1)}</b></div>
    <div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{settings?.person_2_name??"Autre parent"} · {(share2*100).toFixed(2)} %</p><b className="text-2xl">{money(due2)}</b></div>
   </div>
  </section>

  <section className="overflow-hidden rounded-2xl border bg-white">
   <div className="border-b px-4 py-3"><h2 className="font-semibold">Dépenses</h2><p className="text-xs text-neutral-500">Chaque dépense est répartie selon le prorata ci-dessus.</p></div>
   {rows.length?rows.map(x=><div key={x.id} className="border-b p-4 last:border-0">
    <div className="flex items-start justify-between gap-4">
     <div className="min-w-0"><p className="font-medium">{x.label}</p><p className="text-xs text-neutral-500">{new Intl.DateTimeFormat("fr-FR").format(new Date(`${x.expense_date}T12:00:00`))}{x.notes?` · ${x.notes}`:""}</p></div>
     <b className="shrink-0">{money(x.amount)}</b>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-500"><span>{settings?.person_1_name??"Moi"} : <b className="text-neutral-800">{money(x.amount*share1)}</b></span><span>{settings?.person_2_name??"Autre parent"} : <b className="text-neutral-800">{money(x.amount*share2)}</b></span></div>
    <details className="mt-3"><summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-600"><Pencil size={14}/>Modifier / Supprimer</summary>
     <form action={updateChildrenExpense} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="id" value={x.id}/>
      <Field label="Dépense" name="label" defaultValue={x.label}/>
      <Field label="Montant" name="amount" type="number" min=".01" step=".01" defaultValue={x.amount}/>
      <Field label="Date" name="expense_date" type="date" defaultValue={x.expense_date}/>
      <Field label="Note" name="notes" defaultValue={x.notes??""}/>
      <button className="rounded-xl bg-black px-3 py-2 text-sm text-white sm:col-span-2 lg:col-span-4">Enregistrer</button>
     </form>
     <form action={deleteChildrenExpense.bind(null,x.id)} className="mt-2"><button className="flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><Trash2 size={14}/>Supprimer cette dépense</button></form>
    </details>
   </div>):<p className="p-5 text-sm text-neutral-500">Aucune dépense enregistrée.</p>}
  </section>
 </main>
}
