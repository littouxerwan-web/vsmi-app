import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {createCommonCategory,createCommonMovement,createCommonRecurrence,createCommonSnapshot,deleteCommonCategory,deleteCommonMovement,deleteCommonRecurrence,deleteCommonRecurrenceOccurrence,deleteCommonRecurrenceSeriesFrom,saveCommonSettings,toggleCommonProrata,toggleCommonMovement,toggleCommonRecurrenceOccurrence,updateCommonMovement,updateCommonRecurrenceOccurrence,updateCommonRecurrenceSeries} from "./actions";
import {AlertTriangle,Check,Equal,Landmark,Percent,Pencil,Trash2,TrendingUp} from "lucide-react";
export const dynamic="force-dynamic";
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const money=(x:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(x),N=(x:any)=>Number(x??0)||0;
function F({label,...p}:any){return <label className="grid gap-1 text-sm"><span className="font-medium">{label}</span><input {...p} className="rounded-xl border border-black/10 px-3 py-2.5"/></label>}
function S({label,options,...p}:any){return <label className="grid gap-1 text-sm"><span className="font-medium">{label}</span><select {...p} className="rounded-xl border border-black/10 px-3 py-2.5">{options.map((o:any)=><option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></label>}
function Notice({text,danger=false}:any){return <div className={`mx-3 mt-4 rounded-xl px-4 py-3 text-sm sm:mx-5 lg:mx-6 ${danger?"bg-red-50 text-red-800":"bg-emerald-50 text-emerald-800"}`}>{text}</div>}
function monthly(r:any){const a=N(r.amount),i=Math.max(1,N(r.interval_count));return r.frequency==="weekly"?a*52/12/i:r.frequency==="quarterly"?a/(3*i):r.frequency==="yearly"?a/(12*i):a/i}
function addMonths(d:Date,m:number){const x=new Date(d),day=x.getUTCDate();x.setUTCDate(1);x.setUTCMonth(x.getUTCMonth()+m);x.setUTCDate(Math.min(day,new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth()+1,0)).getUTCDate()));return x}
function occDates(r:any,from:string,to:string){let d=new Date(`${r.start_date}T12:00:00Z`),end=new Date(`${to}T12:00:00Z`),out:string[]=[],g=0;while(d<=end&&g++<1000){const iso=d.toISOString().slice(0,10);if(iso>=from&&(!r.end_date||iso<=r.end_date))out.push(iso);if(r.frequency==="weekly")d=new Date(d.getTime()+7*86400000*Math.max(1,N(r.interval_count)));else d=addMonths(d,(r.frequency==="quarterly"?3:r.frequency==="yearly"?12:1)*Math.max(1,N(r.interval_count)))}return out}

function CommonDeleteChoices({m}:{m:any}){
 if(m.kind==="recurrence"){
  return <div className="grid gap-2 border-t border-black/10 pt-3">
   <p className="text-xs font-medium text-neutral-500">Supprimer</p>
   <div className="flex flex-wrap gap-2">
    <form action={deleteCommonRecurrenceOccurrence.bind(null,m.recurrence_id,m.movement_date)}>
     <button className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50">Ce mois-ci uniquement</button>
    </form>
    <form action={deleteCommonRecurrenceSeriesFrom.bind(null,m.recurrence_id,m.movement_date)}>
     <button className="rounded-xl bg-red-700 px-3 py-2 text-xs font-medium text-white hover:bg-red-800">Toute la série</button>
    </form>
   </div>
   <p className="text-[11px] leading-4 text-neutral-500">Toute la série conserve les échéances antérieures et arrête la récurrence à partir de celle-ci.</p>
  </div>
 }
 if(!m.id)return null;
 return <div className="border-t border-black/10 pt-3">
  <form action={deleteCommonMovement.bind(null,m.id)}>
   <button className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"><Trash2 size={14}/>Supprimer ce mouvement</button>
  </form>
 </div>
}

function MovementEditor({m,categories}:{m:any;categories:any[]}){
 if(m.kind==="recurrence"&&m.status!=="completed"){
  return <details className="mt-3">
   <summary className="cursor-pointer text-xs font-medium text-neutral-600">Modifier / Gérer l’échéance</summary>
   <form action={updateCommonRecurrenceOccurrence} className="mt-2 flex flex-col gap-2 sm:flex-row">
    <input type="hidden" name="recurrence_id" value={m.recurrence_id}/>
    <input type="hidden" name="occurrence_date" value={m.movement_date}/>
    <input type="hidden" name="movement_type" value={m.movement_type}/>
    <input type="hidden" name="category_id" value={m.category_id??""}/>
    <input type="hidden" name="label" value={m.label}/>
    <input name="amount" type="number" step="0.01" min="0.01" defaultValue={m.amount} className="rounded-xl border px-3 py-2"/>
    <button className="rounded-xl bg-black px-3 py-2 text-sm text-white">Enregistrer</button>
   </form>
   <div className="mt-3"><CommonDeleteChoices m={m}/></div>
  </details>
 }

 return <details className="mt-3">
  <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-600"><span className="inline-flex items-center gap-2"><Pencil size={14}/>Modifier / Supprimer</span></summary>
  <form action={updateCommonMovement} className="mt-3 grid gap-2 sm:grid-cols-2">
   <input type="hidden" name="id" value={m.id}/>
   <input type="hidden" name="movement_type" value={m.movement_type}/>
   <input name="label" defaultValue={m.label} className="rounded-xl border px-3 py-2"/>
   <input name="amount" type="number" step="0.01" min="0.01" defaultValue={m.amount} className="rounded-xl border px-3 py-2"/>
   <input name="movement_date" type="date" defaultValue={m.movement_date} className="rounded-xl border px-3 py-2"/>
   <select name="category_id" defaultValue={m.category_id??""} className="rounded-xl border px-3 py-2"><option value="">Sans catégorie</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
   <button className="rounded-xl bg-black px-4 py-2 text-sm text-white">Enregistrer</button>
  </form>
  {m.kind==="recurrence"?<details className="mt-3 rounded-xl border border-black/10 p-3">
   <summary className="cursor-pointer text-xs font-medium text-neutral-600">Modifier toute la série</summary>
   <form action={updateCommonRecurrenceSeries} className="mt-3 grid gap-2 sm:grid-cols-2">
    <input type="hidden" name="id" value={m.recurrence.id}/>
    <S label="Type" name="movement_type" defaultValue={m.recurrence.movement_type} options={[["expense","Dépense"],["income","Revenu"]]}/>
    <F label="Libellé" name="label" defaultValue={m.recurrence.label}/>
    <F label="Montant" name="amount" type="number" min=".01" step=".01" defaultValue={m.recurrence.amount}/>
    <S label="Fréquence" name="frequency" defaultValue={m.recurrence.frequency} options={[["monthly","Mensuelle"],["weekly","Hebdomadaire"],["quarterly","Trimestrielle"],["yearly","Annuelle"]]}/>
    <F label="Tous les…" name="interval_count" type="number" min="1" defaultValue={m.recurrence.interval_count}/>
    <F label="Début" name="start_date" type="date" defaultValue={m.recurrence.start_date}/>
    <F label="Fin" name="end_date" type="date" defaultValue={m.recurrence.end_date??""}/>
    <S label="Catégorie" name="category_id" defaultValue={m.recurrence.category_id??""} options={[["","Sans catégorie"],...categories.map(c=>[c.id,c.name])]}/>
    <button className="rounded-xl bg-black px-4 py-2 text-sm text-white sm:col-span-2">Enregistrer toute la série</button>
   </form>
  </details>:null}
  <div className="mt-3"><CommonDeleteChoices m={m}/></div>
 </details>
}

export default async function Page({searchParams}:{searchParams:Promise<any>}){
 const p=await searchParams,vue=p.vue==="budget"?"budget":"encours",supa=await createClient();
 const [{data:settings},{data:cats=[]},{data:snaps=[]},{data:movs=[]},{data:recs=[]},{data:overrides=[]},{data:exclusions=[]}]=await Promise.all([supa.from("common_settings").select("*").eq("singleton",true).maybeSingle(),supa.from("common_categories").select("*").eq("is_active",true).order("name"),supa.from("common_balance_snapshots").select("*").order("snapshot_date",{ascending:false}),supa.from("common_movements").select("*").neq("status","cancelled").order("movement_date",{ascending:false}),supa.from("common_recurrences").select("*").eq("is_active",true).order("start_date"),supa.from("common_recurrence_overrides").select("*"),supa.from("common_recurrence_exclusions").select("*")]);
 const st:any=settings??{},C:any[]=cats as any[],M:any[]=(movs as any[]).map(x=>({...x,amount:N(x.amount)})),R:any[]=(recs as any[]).map(x=>({...x,amount:N(x.amount)})),snap:any=(snaps as any[])[0];
 const snapDate=snap?.snapshot_date??today,snapCreated=snap?.created_at?new Date(snap.created_at).getTime():NaN;
 const completedAfterSnapshot=M.filter(x=>{
   if(x.status!=="completed")return false;
   if(x.completed_at&&Number.isFinite(snapCreated))return new Date(x.completed_at).getTime()>snapCreated;
   return (x.completed_date??x.movement_date)>snapDate;
 });
 const cur=N(snap?.balance)+completedAfterSnapshot.reduce((a,x)=>a+(x.movement_type==="income"?x.amount:-x.amount),0);
 const monthStart=`${today.slice(0,7)}-01`,monthEnd=new Date(Date.UTC(+today.slice(0,4),+today.slice(5,7),0)).toISOString().slice(0,10);
 const occurrenceMovement=new Map(M.filter(x=>x.recurrence_id).map(x=>[`${x.recurrence_id}:${x.movement_date}`,x]));
 const overrideMap=new Map((overrides as any[]).map(x=>[`${x.recurrence_id}:${x.occurrence_date}`,x]));
 const exclusionSet=new Set((exclusions as any[]).map(x=>`${x.recurrence_id}:${x.occurrence_date}`));
 const recurringEntries=R.flatMap(r=>occDates(r,monthStart,monthEnd).filter(date=>!exclusionSet.has(`${r.id}:${date}`)).map(date=>{const materialized:any=occurrenceMovement.get(`${r.id}:${date}`),override:any=overrideMap.get(`${r.id}:${date}`);return {key:`r:${r.id}:${date}`,kind:"recurrence",id:materialized?.id??null,recurrence_id:r.id,label:override?.label??r.label,amount:N(override?.amount??r.amount),movement_type:override?.movement_type??r.movement_type,category_id:override?.category_id??r.category_id,movement_date:date,status:materialized?.status==="completed"?"completed":"planned",recurrence:r}}));
 const oneOffEntries=M.filter(x=>!x.recurrence_id&&x.movement_date>=monthStart&&x.movement_date<=monthEnd).map(x=>({key:`m:${x.id}`,kind:"movement",...x}));
 const monthEntries=[...recurringEntries,...oneOffEntries].sort((a:any,b:any)=>a.movement_date.localeCompare(b.movement_date)||a.label.localeCompare(b.label));
 const pendingMonth=monthEntries.filter((x:any)=>x.status!=="completed");
 const forecast=cur+pendingMonth.reduce((a:any,x:any)=>a+(x.movement_type==="income"?N(x.amount):-N(x.amount)),0);
 const shortfall=Math.max(0,-forecast),shortfallEach=shortfall/2;
 const pendingByDate=new Map<string,number>();
 for(const x of pendingMonth as any[]) pendingByDate.set(x.movement_date,(pendingByDate.get(x.movement_date)??0)+(x.movement_type==="income"?N(x.amount):-N(x.amount)));
 let projectedRunning=cur,firstOverdraftDate:string|null=null;
 for(const [date,delta] of [...pendingByDate.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
   projectedRunning+=delta;
   if(projectedRunning<0&&!firstOverdraftDate){firstOverdraftDate=date;break}
 }
 const overdraftDateLabel=firstOverdraftDate?new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric"}).format(new Date(`${firstOverdraftDate}T12:00:00`)):null;

 const r1=N(st.income_n1_person_1),r2=N(st.income_n1_person_2),rt=r1+r2,p1=rt?r1/rt:.5,p2=1-p1;
 // BUDGET = simulateur d'un mois type basé uniquement sur les dépenses régulières.
 // Aucune notion de crédit n'entre dans ce calcul.
 const expenses=R.filter(r=>r.movement_type==="expense");
 const dep=expenses.reduce((a,r)=>a+monthly(r),0);
 const pro=expenses.filter(r=>r.prorate_by_income).reduce((a,r)=>a+monthly(r),0);
 const half=expenses.filter(r=>!r.prorate_by_income).reduce((a,r)=>a+monthly(r),0);
 const baseA1=half*.5+pro*p1;
 const baseA2=half*.5+pro*p2;
 const caf=N(st.caf_credit_amount),caf1=N(st.caf_person_1_amount),caf2=N(st.caf_person_2_amount);
 const cafAllocated=caf1+caf2,cafUnallocated=Math.max(0,caf-cafAllocated);
 const a1=Math.max(0,baseA1-caf1);
 const a2=Math.max(0,baseA2-caf2);
 return <main className="py-4 lg:py-6"><div>{p.erreur?<Notice danger text={p.erreur}/>:p.succes?<Notice text={p.succes}/>:null}
 <header className="border-b border-black/10 bg-white px-3 py-4 sm:px-5 lg:px-6"><p className="text-xs font-semibold uppercase tracking-[.18em] text-neutral-400">Espace partagé</p><h1 className="mt-1 text-2xl font-semibold">COMMUN</h1><p className="text-sm text-neutral-500">Indépendant des espaces PERSO.</p></header>
 <nav className="flex gap-2 border-b bg-neutral-100 px-3 py-1 sm:px-5 lg:px-6">{[["encours","En cours"],["budget","Budget"]].map(([id,l])=><Link key={id} href={`/commun?vue=${id}`} className={`px-4 py-2.5 text-sm font-medium ${vue===id?"bg-black text-white":"text-neutral-600"}`}>{l}</Link>)}</nav>
 {vue==="encours"?<div className="space-y-5 px-3 py-5 sm:px-5 lg:px-6">
  <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-black p-5 text-white"><Landmark size={20}/><p className="mt-4 text-xs text-neutral-400">{st.account_name??"Compte commun"} · aujourd’hui</p><p className="text-2xl font-semibold">{money(cur)}</p></div><div className="rounded-2xl border bg-white p-5"><TrendingUp size={20}/><p className="mt-4 text-xs text-neutral-500">Prévision fin de mois</p><p className={`text-2xl font-semibold ${forecast<0?"text-red-700":""}`}>{money(forecast)}</p></div></div>
  <details className="rounded-2xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Paramètres du compte et solde</summary><div className="mt-4 grid gap-5 md:grid-cols-2"><form action={saveCommonSettings} className="grid gap-3"><input type="hidden" name="return_view" value="encours"/><F label="Nom du compte" name="account_name" defaultValue={st.account_name??"Compte commun"}/><input type="hidden" name="person_1_name" value={st.person_1_name??"Personne 1"}/><input type="hidden" name="person_2_name" value={st.person_2_name??"Personne 2"}/><input type="hidden" name="income_n1_person_1" value={r1}/><input type="hidden" name="income_n1_person_2" value={r2}/><input type="hidden" name="caf_credit_amount" value={caf}/><input type="hidden" name="caf_person_1_amount" value={caf1}/><input type="hidden" name="caf_person_2_amount" value={caf2}/><button className="rounded-xl bg-black p-3 text-white">Enregistrer</button></form><form action={createCommonSnapshot} className="grid gap-3"><F label="Solde constaté" name="balance" type="number" step=".01" defaultValue={cur}/><F label="Date" name="snapshot_date" type="date" defaultValue={today}/><button className="rounded-xl bg-black p-3 text-white">Mettre à jour le solde</button></form></div></details>
  <div className="grid gap-4 lg:grid-cols-3">
   <details className="rounded-2xl border bg-white p-4"><summary className="cursor-pointer font-semibold">+ Débit / crédit</summary><form action={createCommonMovement} className="mt-4 grid gap-3"><S label="Type" name="movement_type" options={[["expense","Dépense"],["income","Revenu"]]}/><F label="Libellé" name="label" required/><F label="Montant" name="amount" type="number" min=".01" step=".01" required/><F label="Date" name="movement_date" type="date" defaultValue={today}/><S label="État" name="status" options={[["planned","Prévu"],["completed","Déjà passé"]]}/><S label="Catégorie" name="category_id" options={[["","Sans catégorie"],...C.map(c=>[c.id,c.name])]}/><button className="rounded-xl bg-black p-3 text-white">Ajouter</button></form></details>
   <details className="rounded-2xl border bg-white p-4"><summary className="cursor-pointer font-semibold">+ Mouvement récurrent</summary><form action={createCommonRecurrence} className="mt-4 grid gap-3"><S label="Type" name="movement_type" options={[["expense","Dépense"],["income","Revenu"]]}/><F label="Libellé" name="label" required/><F label="Montant" name="amount" type="number" min=".01" step=".01"/><S label="Fréquence" name="frequency" options={[["monthly","Mensuelle"],["weekly","Hebdomadaire"],["quarterly","Trimestrielle"],["yearly","Annuelle"]]}/><F label="Tous les…" name="interval_count" type="number" min="1" defaultValue="1"/><F label="Début" name="start_date" type="date" defaultValue={today}/><F label="Fin (optionnelle)" name="end_date" type="date"/><S label="Catégorie" name="category_id" options={[["","Sans catégorie"],...C.map(c=>[c.id,c.name])]}/><button className="rounded-xl bg-black p-3 text-white">Ajouter</button></form></details>
   <details className="rounded-2xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Catégories</summary><form action={createCommonCategory} className="mt-4 grid gap-3"><F label="Nom" name="name"/><S label="Type" name="movement_type" options={[["expense","Dépense"],["income","Revenu"]]}/><button className="rounded-xl bg-black p-3 text-white">Ajouter</button></form><div className="mt-3 divide-y">{C.map(c=><div key={c.id} className="flex justify-between py-2 text-sm"><span>{c.name}</span><form action={deleteCommonCategory.bind(null,c.id)}><button><Trash2 size={16}/></button></form></div>)}</div></details>
  </div>
  {shortfall>0?<section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={20}/><div><h2 className="font-semibold">Solde projeté insuffisant</h2><p className="mt-1 text-sm">{overdraftDateLabel?<>Le compte risque de passer sous 0 € à partir du <b>{overdraftDateLabel}</b>. </>:null}La projection de fin de mois est de <b>{money(forecast)}</b>. Pour revenir au minimum à 0 €, il faut créditer le compte commun de <b>{money(shortfall)}</b>.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-red-700">{st.person_1_name??"Personne 1"} · 50 %</p><p className="font-semibold">{money(shortfallEach)}</p></div><div className="rounded-xl bg-white/80 p-3"><p className="text-xs text-red-700">{st.person_2_name??"Personne 2"} · 50 %</p><p className="font-semibold">{money(shortfallEach)}</p></div></div></div></div></section>:null}
  <section className="rounded-2xl border bg-white"><div className="border-b px-4 py-3"><h2 className="font-semibold">Mouvements du mois</h2><p className="text-xs text-neutral-500">Coche une opération lorsqu’elle est réellement débitée ou créditée : elle est alors intégrée au solde actuel.</p></div><div>{monthEntries.length?monthEntries.map((m:any)=><div key={m.key} className={`border-b border-black/10 p-3 last:border-0 ${m.status==="completed"?"bg-neutral-50":""}`}><div className="flex items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><form action={m.kind==="recurrence"?toggleCommonRecurrenceOccurrence.bind(null,m.recurrence_id,m.movement_date,m.status!=="completed"):toggleCommonMovement.bind(null,m.id,m.status!=="completed")}><button aria-label={m.status==="completed"?"Décocher":"Pointer"} className={`grid size-7 place-items-center rounded-md border-2 ${m.status==="completed"?"border-black bg-black text-white":"border-black/30 bg-white"}`}>{m.status==="completed"?<Check size={16}/>:null}</button></form><div className="min-w-0"><p className="truncate font-medium">{m.label}</p><p className="text-xs text-neutral-500">{new Intl.DateTimeFormat("fr-FR").format(new Date(`${m.movement_date}T12:00:00`))} · {m.kind==="recurrence"?"Échéance périodique":"Mouvement ponctuel"} · {m.status==="completed"?"intégré au disponible":"prévision"}</p></div></div><span className={`shrink-0 font-semibold ${m.movement_type==="expense"?"text-red-700":"text-emerald-700"}`}>{m.movement_type==="expense"?"−":"+"}{money(N(m.amount))}</span></div><MovementEditor m={m} categories={C}/></div>):<p className="p-4 text-sm text-neutral-500">Aucun mouvement prévu ce mois-ci.</p>}</div></section>
  <details className="rounded-2xl border bg-white"><summary className="cursor-pointer px-4 py-3 font-semibold">Mouvements récurrents enregistrés</summary><div className="border-t">{R.length?R.map(r=><div key={r.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0"><div className="min-w-0 flex-1"><p className="truncate font-medium">{r.label}</p><p className="text-xs text-neutral-500">{r.frequency==="monthly"?"Mensuel":r.frequency==="weekly"?"Hebdomadaire":r.frequency==="quarterly"?"Trimestriel":"Annuel"} · début {r.start_date}{r.end_date?` · fin ${r.end_date}`:""}</p></div><b className={r.movement_type==="expense"?"text-red-700":"text-emerald-700"}>{r.movement_type==="expense"?"−":"+"}{money(r.amount)}</b><form action={deleteCommonRecurrence.bind(null,r.id)}><button aria-label="Supprimer la récurrence"><Trash2 size={16}/></button></form></div>):<p className="p-4 text-sm text-neutral-500">Aucun mouvement récurrent.</p>}</div></details>
 </div>:null}
 {vue==="budget"?<div className="space-y-5 px-3 py-5 sm:px-5 lg:px-6">
  <section className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-semibold">Revenus N-1 et crédit CAF</h2><p className="text-sm text-neutral-500">Les revenus N-1 servent uniquement aux dépenses proratisées. Le crédit CAF est ensuite déduit manuellement de la part de chacun.</p><form action={saveCommonSettings} className="mt-4 grid gap-3 sm:grid-cols-2"><input type="hidden" name="return_view" value="budget"/><input type="hidden" name="account_name" value={st.account_name??"Compte commun"}/><F label="Nom personne 1" name="person_1_name" defaultValue={st.person_1_name??"Personne 1"}/><F label="Revenu N-1 personne 1" name="income_n1_person_1" type="number" min="0" step=".01" defaultValue={r1}/><F label="Nom personne 2" name="person_2_name" defaultValue={st.person_2_name??"Personne 2"}/><F label="Revenu N-1 personne 2" name="income_n1_person_2" type="number" min="0" step=".01" defaultValue={r2}/><div className="sm:col-span-2 mt-2 rounded-xl border border-black/10 bg-neutral-50 p-4"><h3 className="font-semibold">Crédit CAF mensuel</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><F label="Montant total CAF" name="caf_credit_amount" type="number" min="0" step=".01" defaultValue={caf}/><F label={`CAF affectée à ${st.person_1_name??"Personne 1"}`} name="caf_person_1_amount" type="number" min="0" step=".01" defaultValue={caf1}/><F label={`CAF affectée à ${st.person_2_name??"Personne 2"}`} name="caf_person_2_amount" type="number" min="0" step=".01" defaultValue={caf2}/></div><p className="mt-2 text-xs text-neutral-500">Total affecté : {money(cafAllocated)} sur {money(caf)}{cafUnallocated>0?` · non affecté : ${money(cafUnallocated)}`:""}.</p></div><button className="rounded-xl bg-black p-3 text-white sm:col-span-2">Enregistrer et recalculer</button></form><div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-xl bg-neutral-100 p-3">{st.person_1_name??"Personne 1"} : <b>{(p1*100).toFixed(2)} %</b></div><div className="rounded-xl bg-neutral-100 p-3">{st.person_2_name??"Personne 2"} : <b>{(p2*100).toFixed(2)} %</b></div></div></section>
  <section className="rounded-2xl border bg-white"><div className="border-b p-4"><h2 className="font-semibold">Dépenses régulières d’un mois type</h2><p className="text-xs text-neutral-500">Cochée = prorata des revenus N-1. Non cochée = 50/50. Le simulateur utilise l’équivalent mensuel de toutes les récurrences enregistrées.</p></div>{expenses.length?expenses.map(r=><div key={r.id} className="flex items-center gap-3 border-b p-4 last:border-0"><form action={toggleCommonProrata}><input type="hidden" name="id" value={r.id}/><input type="hidden" name="value" value={String(!r.prorate_by_income)}/><button aria-label={r.prorate_by_income?"Passer cette dépense à 50/50":"Proratiser cette dépense selon les revenus"} className={`grid size-7 shrink-0 place-items-center rounded-md border ${r.prorate_by_income?"border-black bg-black text-white":"border-black/25 bg-white"}`}>{r.prorate_by_income?<Check size={16}/>:null}</button></form><div className="min-w-0 flex-1"><p className="font-medium">{r.label}</p><p className="text-xs text-neutral-500">{r.prorate_by_income?`Prorata revenus · ${(p1*100).toFixed(2)} % / ${(p2*100).toFixed(2)} %`:"Répartition 50 / 50"}</p></div><b>{money(monthly(r))}/mois</b><form action={deleteCommonRecurrence.bind(null,r.id)}><button><Trash2 size={16}/></button></form></div>):<p className="p-4 text-sm text-neutral-500">Aucune dépense régulière enregistrée.</p>}</section>
  <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-4"><p className="text-xs text-neutral-500">Dépenses à 50/50</p><b className="text-xl">{money(half)}</b></div><div className="rounded-2xl border bg-white p-4"><p className="text-xs text-neutral-500">Dépenses au prorata</p><b className="text-xl">{money(pro)}</b></div><div className="rounded-2xl bg-black p-4 text-white"><p className="text-xs text-neutral-400">Total dépenses du mois type</p><b className="text-xl">{money(dep)}</b></div></div>
  <section className="rounded-2xl border-2 border-black bg-white p-5"><h2 className="text-lg font-semibold">À verser chacun chaque mois</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{st.person_1_name??"Personne 1"}</p><b className="text-2xl">{money(a1)}</b><div className="mt-2 space-y-1 text-xs text-neutral-500"><p>Part avant CAF : {money(baseA1)}</p><p>CAF affectée : −{money(caf1)}</p><p>50/50 : {money(half*.5)} · prorata : {money(pro*p1)}</p></div></div><div className="rounded-xl bg-neutral-100 p-4"><p className="text-sm text-neutral-500">{st.person_2_name??"Personne 2"}</p><b className="text-2xl">{money(a2)}</b><div className="mt-2 space-y-1 text-xs text-neutral-500"><p>Part avant CAF : {money(baseA2)}</p><p>CAF affectée : −{money(caf2)}</p><p>50/50 : {money(half*.5)} · prorata : {money(pro*p2)}</p></div></div></div><p className="mt-3 text-xs text-neutral-500">Calcul du mois type : dépenses non cochées à 50/50 + dépenses cochées au prorata des revenus N-1, puis déduction de la part de crédit CAF affectée manuellement à chacun.</p></section>
 </div>:null}</div></main>
}