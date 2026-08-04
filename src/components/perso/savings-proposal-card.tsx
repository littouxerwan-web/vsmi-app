import { ArrowRight, Check, Pencil, Sparkles, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { acceptSavingsProposal, deleteSavingsProposal, updateSavingsProposalAmount } from "@/app/(app)/perso/actions";

const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const nextMonthDate=(month:string)=>{const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,10)};
const monthLabel=(date:string)=>new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(new Date(`${date}T12:00:00`));

type Props={sourceAccountId:string;destinationAccountId:string;sourceName:string;destinationName:string;sourceMonth:string;proposedAmount:number};

export async function SavingsProposalCard({sourceAccountId,destinationAccountId,sourceName,destinationName,sourceMonth,proposedAmount}:Props){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return null;
 const {data:proposal}=await supabase.from("personal_savings_proposals").select("id,amount,status,transfer_group_id,calculation_base").eq("owner_id",user.id).eq("source_account_id",sourceAccountId).eq("destination_account_id",destinationAccountId).eq("source_month",`${sourceMonth}-01`).maybeSingle();
 if(proposal?.status==="deleted"||(!proposal&&proposedAmount<=0))return null;
 const accepted=proposal?.status==="accepted";
 const calculationChanged=proposal?.status==="pending"&&proposal.calculation_base!=null&&Math.abs(Number(proposal.calculation_base)-Number(proposedAmount))>0.005;
 const amount=accepted?Number(proposal?.amount??proposedAmount):calculationChanged||!proposal?Number(proposedAmount):Number(proposal.amount);
 const automaticAmount=Number(proposedAmount);
 const transferDate=nextMonthDate(sourceMonth);
 const common=<><input type="hidden" name="source_account_id" value={sourceAccountId}/><input type="hidden" name="destination_account_id" value={destinationAccountId}/><input type="hidden" name="source_month" value={sourceMonth}/></>;
 return <section className={`mt-5 rounded-3xl border p-5 ${accepted?"border-emerald-300 bg-emerald-50":"border-violet-200 bg-violet-50"}`}>
  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className={`flex items-center gap-2 font-semibold ${accepted?"text-emerald-950":"text-violet-950"}`}><Sparkles size={18}/>{accepted?"Versement épargne accepté":"Versement épargne proposé"}</p><p className={`mt-1 text-sm ${accepted?"text-emerald-800":"text-violet-800"}`}>Le 1er {monthLabel(transferDate)} · {sourceName} <ArrowRight className="inline" size={14}/> {destinationName}</p></div><p className={`text-2xl font-semibold ${accepted?"text-emerald-950":"text-violet-950"}`}>{money(amount)}</p></div>
  <p className={`mt-3 text-xs ${accepted?"text-emerald-800":"text-violet-800"}`}>{accepted?"Le débit et le crédit sont maintenant enregistrés en prévision au 1er du mois suivant.":"Montant recalculé automatiquement après chaque évolution des soldes, mouvements et budgets. Une modification manuelle reste valable jusqu’au prochain changement du calcul automatique."}</p>
  <div className="mt-4 flex flex-wrap items-start gap-3">
   {!accepted?<form action={acceptSavingsProposal}>{common}<input type="hidden" name="amount" value={amount}/><button className="flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"><Check size={15}/>Accepter</button></form>:null}
   <details><summary className="flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium"><Pencil size={15}/>Modifier</summary><form action={updateSavingsProposalAmount} className="mt-2 flex gap-2">{common}<input type="hidden" name="calculation_base" value={automaticAmount}/><input name="amount" type="number" step="0.01" min="0.01" defaultValue={amount} className="w-36 rounded-xl border px-3 py-2"/><button className="rounded-xl bg-black px-3 py-2 text-sm text-white">Enregistrer</button></form></details>
   <form action={deleteSavingsProposal}>{common}<button className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700"><Trash2 size={15}/>Supprimer</button></form>
  </div>
 </section>;
}
