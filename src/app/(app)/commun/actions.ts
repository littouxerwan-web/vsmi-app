"use server";
import {revalidatePath} from "next/cache"; import {redirect} from "next/navigation"; import {createClient} from "@/lib/supabase/server";
const PATH="/commun",t=(f:FormData,k:string)=>String(f.get(k)??"").trim(),num=(f:FormData,k:string)=>Number(t(f,k).replace(",",".")); function fail(m:string):never{redirect(`${PATH}?erreur=${encodeURIComponent(m)}`)} function ok(m:string,v="encours"):never{revalidatePath(PATH);redirect(`${PATH}?vue=${v}&succes=${encodeURIComponent(m)}`)}
async function db(){const s=await createClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/connexion");return {s,user}}
export async function saveCommonSettings(f:FormData){const {s}=await db(),a=num(f,"income_n1_person_1"),b=num(f,"income_n1_person_2");if(!Number.isFinite(a)||a<0||!Number.isFinite(b)||b<0)fail("Revenus incorrects.");const {error}=await s.from("common_settings").upsert({singleton:true,account_name:t(f,"account_name")||"Compte commun",person_1_name:t(f,"person_1_name")||"Personne 1",person_2_name:t(f,"person_2_name")||"Personne 2",income_n1_person_1:a,income_n1_person_2:b,updated_at:new Date().toISOString()},{onConflict:"singleton"});if(error)fail(error.message);ok("Paramètres enregistrés.",t(f,"return_view")||"encours")}
export async function createCommonSnapshot(f:FormData){const {s,user}=await db(),b=num(f,"balance"),d=t(f,"snapshot_date");if(!d||!Number.isFinite(b))fail("Solde incorrect.");const {error}=await s.from("common_balance_snapshots").upsert({balance:b,snapshot_date:d,created_by:user.id},{onConflict:"snapshot_date"});if(error)fail(error.message);ok("Solde mis à jour.")}
export async function createCommonCategory(f:FormData){const {s}=await db(),name=t(f,"name"),type=t(f,"movement_type");if(!name||!["income","expense"].includes(type))fail("Catégorie incomplète.");const {error}=await s.from("common_categories").insert({name,movement_type:type});if(error)fail(error.message);ok("Catégorie ajoutée.")}
export async function createCommonMovement(f:FormData){const {s,user}=await db(),amount=num(f,"amount"),type=t(f,"movement_type"),completed=t(f,"status")==="completed";if(!t(f,"label")||!t(f,"movement_date")||amount<=0)fail("Mouvement incomplet.");const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const {error}=await s.from("common_movements").insert({category_id:t(f,"category_id")||null,movement_type:type,label:t(f,"label"),amount,movement_date:t(f,"movement_date"),status:completed?"completed":"planned",completed_date:completed?day:null,completed_at:completed?new Date().toISOString():null,created_by:user.id});if(error)fail(error.message);ok("Mouvement ajouté.")}
export async function createCommonRecurrence(f:FormData){const {s,user}=await db(),amount=num(f,"amount");if(!t(f,"label")||!t(f,"start_date")||amount<=0)fail("Récurrence incomplète.");const {error}=await s.from("common_recurrences").insert({category_id:t(f,"category_id")||null,movement_type:t(f,"movement_type"),label:t(f,"label"),amount,frequency:t(f,"frequency")||"monthly",interval_count:Math.max(1,Math.trunc(num(f,"interval_count")||1)),start_date:t(f,"start_date"),end_date:t(f,"end_date")||null,created_by:user.id});if(error)fail(error.message);ok("Récurrence ajoutée.")}
export async function deleteCommonMovement(id:string){const {s}=await db();const {error}=await s.from("common_movements").delete().eq("id",id);if(error)fail(error.message);ok("Mouvement supprimé.")}
export async function deleteCommonCategory(id:string){const {s}=await db();const {error}=await s.from("common_categories").delete().eq("id",id);if(error)fail(error.message);ok("Catégorie supprimée.")}
export async function deleteCommonRecurrence(id:string){const {s}=await db();const {error}=await s.from("common_recurrences").delete().eq("id",id);if(error)fail(error.message);ok("Récurrence supprimée.","budget")}
export async function toggleCommonProrata(f:FormData){const {s}=await db();const {error}=await s.from("common_recurrences").update({prorate_by_income:t(f,"value")==="true"}).eq("id",t(f,"id"));if(error)fail(error.message);ok("Répartition mise à jour.","budget")}

export async function toggleCommonMovement(id:string, completed:boolean){
 const {s}=await db();
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const {error}=await s.from("common_movements").update({
   status:completed?"completed":"planned",
   completed_date:completed?day:null,
   completed_at:completed?new Date().toISOString():null
 }).eq("id",id);
 if(error)fail(error.message);
 ok(completed?"Mouvement pointé et intégré au solde.":"Mouvement replacé en prévision.");
}

export async function toggleCommonRecurrenceOccurrence(recurrenceId:string, occurrenceDate:string, completed:boolean){
 const {s,user}=await db();
 if(!recurrenceId||!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) fail("Échéance récurrente incorrecte.");

 const {data:r,error:re}=await s.from("common_recurrences")
   .select("id,category_id,movement_type,label,amount")
   .eq("id",recurrenceId).single();
 if(re||!r) fail(re?.message??"Récurrence introuvable.");

 const {data:existing,error:existingError}=await s.from("common_movements")
   .select("id")
   .eq("recurrence_id",recurrenceId)
   .eq("movement_date",occurrenceDate)
   .maybeSingle();
 if(existingError) fail(existingError.message);

 if(completed){
   const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   const payload={
     recurrence_id:r.id,category_id:r.category_id,movement_type:r.movement_type,label:r.label,
     amount:r.amount,movement_date:occurrenceDate,status:"completed",
     completed_date:day,completed_at:new Date().toISOString(),created_by:user.id
   };
   const result=existing
     ? await s.from("common_movements").update(payload).eq("id",existing.id)
     : await s.from("common_movements").insert(payload);
   if(result.error)fail(result.error.message);
   ok("Échéance pointée et intégrée au solde.");
 } else {
   if(existing){
     const {error}=await s.from("common_movements").delete().eq("id",existing.id);
     if(error)fail(error.message);
   }
   ok("Échéance replacée en prévision.");
 }
}
