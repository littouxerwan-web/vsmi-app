"use client";

import { useState } from "react";
import { createCategory } from "@/app/(app)/perso/actions";

type Account={id:string;name:string};
type Category={id:string;name:string;parent_id:string|null;movement_type?:string};
type Kind="category"|"budget";

const field="min-h-12 w-full rounded-xl border border-black/10 bg-white px-3";

export function CategoryCreateForm({categories,accounts,today}:{categories:Category[];accounts:Account[];today:string}){
  const [kind,setKind]=useState<Kind>("category");
  return <form action={createCategory} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="creation_kind" value={kind}/>
    <div className="sm:col-span-2 grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1">
      <button type="button" onClick={()=>setKind("category")} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${kind==="category"?"bg-white shadow-sm":"text-neutral-500"}`}>Catégorie</button>
      <button type="button" onClick={()=>setKind("budget")} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${kind==="budget"?"bg-white shadow-sm":"text-neutral-500"}`}>Budget</button>
    </div>
    <label><span className="mb-2 block text-sm font-medium">Nom</span><input name="name" required className={field}/></label>
    {kind==="category"?<label><span className="mb-2 block text-sm font-medium">Type</span><select name="movement_type" defaultValue="expense" className={field}><option value="expense">Dépense</option><option value="income">Revenu</option></select></label>:<><input type="hidden" name="movement_type" value="expense"/><div className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-600">Budget de dépenses mensuel</div></>}
    <label><span className="mb-2 block text-sm font-medium">Catégorie parente</span><select name="parent_id" className={field}><option value="">Aucune</option>{categories.filter(c=>!c.parent_id).map(c=><option key={c.id} value={c.id}>{c.name} · {c.movement_type==="income"?"Crédit":"Débit"}</option>)}</select></label>
    {kind==="budget"?<><label><span className="mb-2 block text-sm font-medium">Budget mensuel</span><input name="monthly_budget" type="number" step="0.01" min="0.01" required className={field}/></label><label><span className="mb-2 block text-sm font-medium">Compte rattaché</span><select name="account_id" className={field}><option value="">Compte par défaut des mouvements</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label><span className="mb-2 block text-sm font-medium">Date de début</span><input name="budget_start_date" type="date" defaultValue={today} className={field}/></label><label><span className="mb-2 block text-sm font-medium">Date de fin (optionnelle)</span><input name="budget_end_date" type="date" className={field}/></label><p className="sm:col-span-2 text-xs leading-5 text-neutral-500">Le montant est reconduit chaque mois entre ces dates. Sans date de fin, le budget reste actif.</p></>:null}
    <button className="rounded-xl bg-black px-4 py-3 font-medium text-white sm:col-span-2">{kind==="budget"?"Ajouter le budget":"Ajouter la catégorie"}</button>
  </form>;
}
