"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const number=(f:FormData,k:string)=>Number(String(f.get(k)??"0").replace(",","."));
const monthValue=(f:FormData,k:string)=>{const v=text(f,k);return /^\d{4}-\d{2}$/.test(v)?`${v}-01`:""};

async function db(){
  const supabase=await createClient();
  const {data,error}=await supabase.auth.getClaims();
  const claims=data?.claims as {sub?:string;app_metadata?:{role?:string;photo_access?:boolean}}|undefined;
  if(error||!claims?.sub) redirect("/connexion");
  if(claims.app_metadata?.photo_access!==true||claims.app_metadata?.role==="personal") redirect("/perso?vue=finances");
  return {supabase,userId:claims.sub};
}

function done(message:string){
  redirect(`/enfants?succes=${encodeURIComponent(message)}`);
}

export async function saveChildrenSettings(f:FormData){
  const {supabase,userId}=await db();
  const income1=number(f,"income_person_1"),income2=number(f,"income_person_2");
  if(!Number.isFinite(income1)||income1<0||!Number.isFinite(income2)||income2<0) throw new Error("Revenus incorrects.");
  const {error}=await supabase.from("children_settings").upsert({
    owner_id:userId,
    person_1_name:text(f,"person_1_name")||"Moi",
    person_2_name:text(f,"person_2_name")||"Autre parent",
    income_person_1:income1,
    income_person_2:income2,
    updated_at:new Date().toISOString()
  },{onConflict:"owner_id"});
  if(error) throw new Error(error.message);
  done("Revenus et prorata mis à jour.");
}

export async function createChildrenExpense(f:FormData){
  const {supabase,userId}=await db();
  const amount=number(f,"amount");
  const annualAmount=number(f,"annual_amount");
  const smoothAnnual=text(f,"smooth_annual")==="on";
  const startMonth=monthValue(f,"start_month"),endMonth=monthValue(f,"end_month");
  const schoolYearStart=Math.trunc(number(f,"school_year_start"));
  const minMonth=`${schoolYearStart}-09-01`,maxMonth=`${schoolYearStart+1}-08-01`;

  if(
    !text(f,"label") || !startMonth || !endMonth ||
    endMonth<startMonth || startMonth<minMonth || endMonth>maxMonth ||
    !Number.isFinite(amount) || amount<=0 ||
    !Number.isFinite(annualAmount) || annualAmount<=0
  ) throw new Error("Dépense ou période mensuelle incomplète.");

  const paidBy=text(f,"paid_by")==="person_2"?"person_2":"person_1";
  const {error}=await supabase.from("children_expenses").insert({
    owner_id:userId,
    label:text(f,"label"),
    amount,
    annual_amount:annualAmount,
    smooth_annual:smoothAnnual,
    start_month:startMonth,
    end_month:endMonth,
    school_year_start:schoolYearStart,
    expense_date:null,
    notes:text(f,"notes")||null,
    paid_by:paidBy
  });
  if(error) throw new Error(error.message);
  done("Dépense ajoutée.");
}

export async function updateChildrenExpense(f:FormData){
  const {supabase,userId}=await db();
  const id=text(f,"id"),amount=number(f,"amount"),annualAmount=number(f,"annual_amount");
  const smoothAnnual=text(f,"smooth_annual")==="on";
  const startMonth=monthValue(f,"start_month"),endMonth=monthValue(f,"end_month");
  const schoolYearStart=Math.trunc(number(f,"school_year_start"));
  const minMonth=`${schoolYearStart}-09-01`,maxMonth=`${schoolYearStart+1}-08-01`;

  if(
    !id || !text(f,"label") || !startMonth || !endMonth ||
    endMonth<startMonth || startMonth<minMonth || endMonth>maxMonth ||
    !Number.isFinite(amount) || amount<=0 ||
    !Number.isFinite(annualAmount) || annualAmount<=0
  ) throw new Error("Dépense ou période mensuelle incomplète.");

  const paidBy=text(f,"paid_by")==="person_2"?"person_2":"person_1";
  const {error}=await supabase.from("children_expenses").update({
    label:text(f,"label"),
    amount,
    annual_amount:annualAmount,
    smooth_annual:smoothAnnual,
    start_month:startMonth,
    end_month:endMonth,
    school_year_start:schoolYearStart,
    expense_date:null,
    notes:text(f,"notes")||null,
    paid_by:paidBy,
    updated_at:new Date().toISOString()
  }).eq("id",id).eq("owner_id",userId);

  if(error) throw new Error(error.message);
  done("Dépense modifiée.");
}

export async function deleteChildrenExpense(id:string){
  const {supabase,userId}=await db();
  const {error}=await supabase.from("children_expenses").delete().eq("id",id).eq("owner_id",userId);
  if(error) throw new Error(error.message);
  done("Dépense supprimée.");
}
