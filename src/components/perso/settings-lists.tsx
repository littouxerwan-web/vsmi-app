"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Tags, Settings2, Trash2 } from "lucide-react";
import { deleteCategoryFromSettings, deleteRecurrenceFromSettings, updateCategory, updateRecurrence } from "@/app/(app)/perso/actions";

type Account={id:string;name:string};
type Category={
 id:string;name:string;parent_id:string|null;monthly_budget:number;account_id?:string|null;movement_type?:string;
 budget_period?:"monthly"|"specific_month";budget_month?:string|null;budget_start_date?:string|null;budget_end_date?:string|null;
 is_primary_income?:boolean;is_essential?:boolean;exclude_from_analysis?:boolean;
};
type Recurrence={
 id:string;label:string;amount:number;end_date:string|null;start_date?:string|null;is_active:boolean;movement_type:string;
 frequency:string;interval_count?:number;account_id:string;destination_account_id?:string|null;category_id?:string|null;
 is_essential?:boolean;exclude_from_analysis?:boolean;
};

const money=(n:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
const frequencyLabel=(r:Recurrence)=>{
 const n=Math.max(1,Number(r.interval_count)||1);
 const base=r.frequency==="weekly"?"semaine":r.frequency==="quarterly"?"trimestre":r.frequency==="yearly"?"an":"mois";
 return n===1?`Chaque ${base}`:`Tous les ${n} ${base}${base==="mois"?"":"s"}`;
};
function BudgetPeriodFields({category}:{category:Category}){
 const [withoutEnd,setWithoutEnd]=useState(!category.budget_end_date);
 return <>
  <input type="hidden" name="budget_period" value="monthly"/><input type="hidden" name="budget_month" value=""/>
  <label className="text-xs text-neutral-500"><span className="mb-1 block">Début du budget</span><input name="budget_start_date" type="date" defaultValue={category.budget_start_date??""} className="w-full rounded-xl border px-3 py-2 text-sm"/></label>
  <div className="grid gap-2"><label className="flex min-h-10 items-center gap-2 rounded-xl border bg-neutral-50 px-3 text-sm"><input name="budget_no_end" type="checkbox" checked={withoutEnd} onChange={e=>setWithoutEnd(e.target.checked)} className="size-4"/><span>Sans date de fin</span></label><label className="text-xs text-neutral-500"><span className="mb-1 block">Fin du budget</span><input name="budget_end_date" type="date" defaultValue={category.budget_end_date??""} disabled={withoutEnd} className="w-full rounded-xl border px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-400"/></label></div>
 </>;
}
function Pill({children}:{children:any}){return <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">{children}</span>}

export function SettingsLists({accounts,categories,recurrences}:{accounts:Account[];categories:Category[];recurrences:Recurrence[]}){
 const [categoryQuery,setCategoryQuery]=useState("");const [categoryType,setCategoryType]=useState("all");const [categorySort,setCategorySort]=useState("name");
 const [recurrenceQuery,setRecurrenceQuery]=useState("");const [recurrenceStatus,setRecurrenceStatus]=useState("all");const [recurrenceType,setRecurrenceType]=useState("all");const [recurrenceSort,setRecurrenceSort]=useState("name");
 const filteredCategories=useMemo(()=>{const q=categoryQuery.trim().toLocaleLowerCase("fr");return [...categories].filter(c=>(!q||`${c.name} ${accounts.find(a=>a.id===c.account_id)?.name??""}`.toLocaleLowerCase("fr").includes(q))&&(categoryType==="all"||c.movement_type===categoryType)).sort((a,b)=>categorySort==="budget-desc"?Number(b.monthly_budget)-Number(a.monthly_budget):categorySort==="budget-asc"?Number(a.monthly_budget)-Number(b.monthly_budget):a.name.localeCompare(b.name,"fr"));},[accounts,categories,categoryQuery,categoryType,categorySort]);
 const filteredRecurrences=useMemo(()=>{const q=recurrenceQuery.trim().toLocaleLowerCase("fr");return [...recurrences].filter(r=>(!q||`${r.label} ${accounts.find(a=>a.id===r.account_id)?.name??""}`.toLocaleLowerCase("fr").includes(q))&&(recurrenceStatus==="all"||(recurrenceStatus==="active"&&r.is_active)||(recurrenceStatus==="paused"&&!r.is_active))&&(recurrenceType==="all"||r.movement_type===recurrenceType)).sort((a,b)=>recurrenceSort==="amount-desc"?Number(b.amount)-Number(a.amount):recurrenceSort==="amount-asc"?Number(a.amount)-Number(b.amount):a.label.localeCompare(b.label,"fr"));},[accounts,recurrences,recurrenceQuery,recurrenceStatus,recurrenceType,recurrenceSort]);
 const accountName=(id?:string|null)=>accounts.find(a=>a.id===id)?.name??"Compte par défaut";
 return <div className="grid gap-5">
  <details className="group rounded-3xl border border-black/10 bg-white px-6 shadow-sm">
   <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6"><Header icon={Tags} title="Catégories et budgets"/><span className="grid size-8 place-items-center rounded-full bg-neutral-100 text-lg transition group-open:rotate-45">+</span></summary>
   <div className="pb-6">
    <Toolbar query={categoryQuery} setQuery={setCategoryQuery} placeholder="Rechercher une catégorie…"><select value={categoryType} onChange={e=>setCategoryType(e.target.value)} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="all">Tous les types</option><option value="expense">Dépenses</option><option value="income">Revenus</option></select><Sort value={categorySort} onChange={setCategorySort} options={[["name","Nom A–Z"],["budget-desc","Budget décroissant"],["budget-asc","Budget croissant"]]}/></Toolbar>
    <p className="mb-3 text-xs text-neutral-500">{filteredCategories.length} catégorie(s)</p>
    {filteredCategories.map(c=>{const isBudget=Number(c.monthly_budget||0)>0;return <details key={c.id} className="group border-t border-black/10">
     <summary className="cursor-pointer list-none py-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.name}</span><Pill>{c.movement_type==="income"?"Revenu":"Dépense"}</Pill>{isBudget?<Pill>Budget {money(c.monthly_budget)}/mois</Pill>:null}{c.is_essential&&c.movement_type!=="income"?<Pill>Essentielle</Pill>:null}{c.exclude_from_analysis?<Pill>Hors analyse</Pill>:null}</div><p className="mt-2 text-xs leading-5 text-neutral-500">{isBudget?`${accountName(c.account_id)} · ${c.budget_start_date?`du ${new Date(c.budget_start_date+"T12:00:00").toLocaleDateString("fr-FR")}`:"début non défini"}${c.budget_end_date?` au ${new Date(c.budget_end_date+"T12:00:00").toLocaleDateString("fr-FR")}`:" · sans fin"}`:`${c.parent_id?"Sous-catégorie":"Catégorie principale"} · ${accountName(c.account_id)}`}</p></div><span className="text-xl text-neutral-400 transition group-open:rotate-45">+</span></div>
     </summary>
     <form action={updateCategory} className="grid gap-3 pb-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={c.id}/>{isBudget?<label className="text-xs text-neutral-500"><span className="mb-1 block">Type de budget</span><select name="movement_type" defaultValue={c.movement_type??"expense"} className="w-full rounded-xl border px-3 py-2 text-sm"><option value="expense">Débit</option><option value="income">Crédit</option></select></label>:<input type="hidden" name="movement_type" value={c.movement_type??"expense"}/>}
      <label className="text-xs text-neutral-500"><span className="mb-1 block">Nom</span><input name="name" defaultValue={c.name} className="w-full rounded-xl border px-3 py-2 text-sm"/></label>
      <label className="text-xs text-neutral-500"><span className="mb-1 block">Budget mensuel</span><input name="monthly_budget" type="number" step="0.01" min="0" defaultValue={c.monthly_budget??0} className="w-full rounded-xl border px-3 py-2 text-sm"/></label>
      {isBudget?<BudgetPeriodFields category={c}/>:<><input type="hidden" name="budget_period" value="monthly"/><input type="hidden" name="budget_month" value=""/><input type="hidden" name="budget_start_date" value=""/><input type="hidden" name="budget_end_date" value=""/></>}
      <label className="text-xs text-neutral-500"><span className="mb-1 block">Compte</span><select name="account_id" defaultValue={c.account_id??""} className="w-full rounded-xl border px-3 py-2 text-sm"><option value="">Compte par défaut des mouvements</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      {c.movement_type!=="income"?<label className="flex items-center gap-3 rounded-xl border bg-neutral-50 px-3 py-3 text-sm"><input name="is_essential" type="checkbox" defaultChecked={Boolean(c.is_essential)} className="size-4"/><span><strong>Essentielle</strong><span className="block text-xs text-neutral-500">Classe les dépenses rattachées comme contraintes.</span></span></label>:null}
      <label className="flex items-center gap-3 rounded-xl border bg-neutral-50 px-3 py-3 text-sm"><input name="exclude_from_analysis" type="checkbox" defaultChecked={Boolean(c.exclude_from_analysis)} className="size-4"/><span><strong>Exclure de l’analyse</strong><span className="block text-xs text-neutral-500">N’affecte ni En cours ni Projection.</span></span></label>
      <button className="rounded-xl bg-black px-4 py-2.5 text-sm text-white sm:col-span-2">Enregistrer les modifications</button>
     </form>
     <form action={deleteCategoryFromSettings.bind(null,c.id)} className="pb-4"><button className="flex items-center gap-2 text-xs text-red-700"><Trash2 size={13}/>Supprimer</button></form>
    </details>})}
   </div>
  </details>

  <details className="group rounded-3xl border border-black/10 bg-white px-6 shadow-sm">
   <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6"><Header icon={Settings2} title="Mouvements réguliers"/><span className="grid size-8 place-items-center rounded-full bg-neutral-100 text-lg transition group-open:rotate-45">+</span></summary>
   <div className="pb-6">
    <Toolbar query={recurrenceQuery} setQuery={setRecurrenceQuery} placeholder="Rechercher un mouvement régulier…"><select value={recurrenceStatus} onChange={e=>setRecurrenceStatus(e.target.value)} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="all">Tous les états</option><option value="active">Actifs</option><option value="paused">Suspendus</option></select><select value={recurrenceType} onChange={e=>setRecurrenceType(e.target.value)} className="h-10 rounded-xl border bg-white px-3 text-sm"><option value="all">Tous les types</option><option value="expense">Débits</option><option value="income">Crédits</option><option value="transfer">Virements</option></select><Sort value={recurrenceSort} onChange={setRecurrenceSort} options={[["name","Libellé A–Z"],["amount-desc","Montant décroissant"],["amount-asc","Montant croissant"]]}/></Toolbar>
    <p className="mb-3 text-xs text-neutral-500">{filteredRecurrences.length} mouvement(s)</p>
    {filteredRecurrences.map(r=>{const category=categories.find(c=>c.id===r.category_id);let root=category;while(root?.parent_id)root=categories.find(x=>x.id===root?.parent_id);const budgetName=root&&Number(root.monthly_budget||0)>0?root.name:null;const typeLabel=r.movement_type==="income"?"Crédit":r.movement_type==="expense"?"Débit":"Virement";return <details key={r.id} className="group border-t border-black/10">
     <summary className="cursor-pointer list-none py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.label}</span><Pill>{typeLabel}</Pill><Pill>{money(r.amount)}</Pill><Pill>{r.is_active?"Actif":"Suspendu"}</Pill>{r.is_essential&&r.movement_type==="expense"?<Pill>Essentielle</Pill>:null}{r.exclude_from_analysis?<Pill>Hors analyse</Pill>:null}</div><p className="mt-2 text-xs leading-5 text-neutral-500">{accountName(r.account_id)} · {frequencyLabel(r)}{r.start_date?` · début ${new Date(r.start_date+"T12:00:00").toLocaleDateString("fr-FR")}`:""}{r.end_date?` · fin ${new Date(r.end_date+"T12:00:00").toLocaleDateString("fr-FR")}`:" · sans fin"}{budgetName?` · Budget ${budgetName}`:category?` · Catégorie ${category.name}`:" · Sans budget/catégorie"}</p></div><span className="text-xl text-neutral-400 transition group-open:rotate-45">+</span></div></summary>
     <form action={updateRecurrence} className="grid gap-3 pb-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={r.id}/>
      <label className="text-xs text-neutral-500"><span className="mb-1 block">Libellé</span><input name="label" defaultValue={r.label} className="w-full rounded-xl border px-3 py-2 text-sm"/></label>
      <label className="text-xs text-neutral-500"><span className="mb-1 block">Montant</span><input name="amount" type="number" step="0.01" min="0.01" defaultValue={r.amount} className="w-full rounded-xl border px-3 py-2 text-sm"/></label>
      <label className="text-xs text-neutral-500"><span className="mb-1 block">Type</span><select name="movement_type" defaultValue={r.movement_type} className="w-full rounded-xl border px-3 py-2 text-sm"><option value="expense">Débit</option><option value="income">Crédit</option><option value="transfer">Virement</option></select></label>
      <label className="text-xs text-neutral-500"><span className="mb-1 block">Compte</span><select name="account_id" defaultValue={r.account_id} className="w-full rounded-xl border px-3 py-2 text-sm">{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="text-xs text-neutral-500 sm:col-span-2"><span className="mb-1 block">Budget / catégorie</span><select name="category_id" defaultValue={r.category_id??""} className="w-full rounded-xl border px-3 py-2 text-sm"><option value="">Sans budget / catégorie</option>{categories.map(c=><option key={c.id} value={c.id}>{Number(c.monthly_budget||0)>0?`Budget · ${c.name} · ${c.movement_type==="income"?"Crédit":"Débit"}`:`${c.name} · ${c.movement_type==="income"?"Crédit":"Débit"}`}</option>)}</select></label>
      <label className="text-xs text-neutral-500"><span className="mb-1 block">Date de fin</span><input name="end_date" type="date" defaultValue={r.end_date??""} className="w-full rounded-xl border px-3 py-2 text-sm"/></label>
      <label className="text-xs text-neutral-500"><span className="mb-1 block">État</span><select name="is_active" defaultValue={String(r.is_active)} className="w-full rounded-xl border px-3 py-2 text-sm"><option value="true">Actif</option><option value="false">Suspendu</option></select></label>
      {r.movement_type==="expense"?<label className="flex items-center gap-3 rounded-xl border bg-neutral-50 px-3 py-3 text-sm"><input name="is_essential" type="checkbox" defaultChecked={Boolean(r.is_essential)} className="size-4"/><span><strong>Essentielle</strong><span className="block text-xs text-neutral-500">Non cochée = non essentielle.</span></span></label>:null}
      <label className="flex items-center gap-3 rounded-xl border bg-neutral-50 px-3 py-3 text-sm"><input name="exclude_from_analysis" type="checkbox" defaultChecked={Boolean(r.exclude_from_analysis)} className="size-4"/><span><strong>Exclure de l’analyse</strong><span className="block text-xs text-neutral-500">La série reste active dans les projections.</span></span></label>
      <button className="rounded-xl bg-black px-4 py-2.5 text-sm text-white sm:col-span-2">Enregistrer les modifications</button>
     </form>
     <form action={deleteRecurrenceFromSettings.bind(null,r.id)} className="pb-4"><button className="flex items-center gap-2 text-xs text-red-700"><Trash2 size={13}/>Supprimer définitivement la série future</button></form>
    </details>})}
   </div>
  </details>
 </div>;
}
function Header({icon:Icon,title}:{icon:any;title:string}){return <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-neutral-100"><Icon size={19}/></span><h2 className="text-xl font-semibold">{title}</h2></div>}
function Toolbar({query,setQuery,placeholder,children}:{query:string;setQuery:(v:string)=>void;placeholder:string;children:any}){return <div className="mb-3 grid gap-2 rounded-2xl bg-neutral-50 p-3"><label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm"/></label><div className="grid gap-2 sm:grid-cols-2">{children}</div></div>}
function Sort({value,onChange,options}:{value:string;onChange:(v:string)=>void;options:string[][]}){return <label className="relative"><SlidersHorizontal size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/><select value={value} onChange={e=>onChange(e.target.value)} className="h-10 w-full rounded-xl border bg-white pl-9 pr-3 text-sm">{options.map(o=><option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></label>}
