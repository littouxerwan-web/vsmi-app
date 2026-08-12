"use client";
import {useMemo,useState} from "react";

type Account={id:string;name:string;owner_name:string};
export function CommonTransferForm({accounts,people:configuredPeople,action,today}:{accounts:Account[];people:string[];action:(formData:FormData)=>void|Promise<void>;today:string}){
 const people=useMemo(()=>{
  const source=[...configuredPeople,...accounts.map(a=>a.owner_name)].map(v=>String(v||"").trim()).filter(Boolean);
  return Array.from(new Set(source));
 },[accounts,configuredPeople]);
 const [person,setPerson]=useState(people[0]??"");
 const filtered=accounts.filter(a=>a.owner_name===person);
 return <form action={action} className="mt-4 grid gap-3">
  <label className="grid gap-1 text-sm"><span className="font-medium">Personne</span><select name="person_name" value={person} onChange={e=>setPerson(e.target.value)} className="rounded-xl border border-black/10 px-3 py-2.5">{people.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
  <label className="grid gap-1 text-sm"><span className="font-medium">Compte courant</span><select name="personal_account_id" required className="rounded-xl border border-black/10 px-3 py-2.5">{filtered.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
  <label className="grid gap-1 text-sm"><span className="font-medium">Sens</span><select name="direction" className="rounded-xl border border-black/10 px-3 py-2.5"><option value="to_common">Compte personnel → COMMUN</option><option value="from_common">COMMUN → compte personnel</option></select></label>
  <label className="grid gap-1 text-sm"><span className="font-medium">Montant</span><input name="amount" type="number" min=".01" step=".01" required className="rounded-xl border border-black/10 px-3 py-2.5"/></label>
  <label className="grid gap-1 text-sm"><span className="font-medium">Date</span><input name="movement_date" type="date" defaultValue={today} required className="rounded-xl border border-black/10 px-3 py-2.5"/></label>
  <label className="grid gap-1 text-sm"><span className="font-medium">État</span><select name="status" className="rounded-xl border border-black/10 px-3 py-2.5"><option value="planned">Prévu</option><option value="completed">Déjà passé</option></select></label>
  <p className="text-xs text-neutral-500">Le mouvement COMMUN sera libellé « Virement {person||"Erwan/Laure"} ». La contrepartie est créée automatiquement sur le compte personnel sélectionné.</p>
  <button className="rounded-xl bg-black p-3 text-white" disabled={!filtered.length}>Enregistrer le virement</button>
 </form>
}
