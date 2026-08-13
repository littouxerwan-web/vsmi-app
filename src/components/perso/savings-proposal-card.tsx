import { ArrowRight, Check, Pencil, Sparkles, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { acceptSavingsProposal, deleteSavingsProposal, updateSavingsProposalAmount } from "@/app/(app)/perso/actions";

const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const dateLabel=(date:string)=>new Intl.DateTimeFormat("fr-FR",{day:"numeric",month:"long",year:"numeric"}).format(new Date(`${date}T12:00:00`));

type Props={sourceAccountId:string;destinationAccountId:string;sourceName:string;destinationName:string;sourceMonth:string;proposalDate:string|null;proposedAmount:number;mode?:"deposit"|"recovery";lowestBalance?:number|null;lowestBalanceDate?:string|null;overdraftDate?:string|null};

export async function SavingsProposalCard({sourceAccountId,destinationAccountId,sourceName,destinationName,sourceMonth,proposalDate,proposedAmount,mode="deposit",lowestBalance,lowestBalanceDate,overdraftDate}:Props){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return null;
 const {data:proposal}=await supabase.from("personal_savings_proposals").select("id,amount,status,transfer_group_id").eq("owner_id",user.id).eq("source_account_id",sourceAccountId).eq("destination_account_id",destinationAccountId).eq("source_month",`${sourceMonth}-01`).maybeSingle();
 if(proposal?.status==="deleted"||(!proposal&&proposedAmount<=0))return null;
 const recovery=mode==="recovery";
 const monthStart=`${sourceMonth}-01`;
 const nextMonth=(()=>{const d=new Date(`${monthStart}T12:00:00`);d.setMonth(d.getMonth()+1);return d.toISOString().slice(0,10)})();
 const prefix=recovery?"Utilisation d'épargne conseillée":"Versement épargne proposé";
 const {data:materializedTransfers=[]}=await supabase.from("personal_movements").select("transfer_group_id,status,movement_date").eq("owner_id",user.id).eq("account_id",sourceAccountId).eq("movement_type","transfer_out").gte("movement_date",monthStart).lt("movement_date",nextMonth).like("label",`${prefix}%`).not("transfer_group_id","is",null);
 const materializedGroups=new Set((materializedTransfers??[]).map((m:any)=>m.transfer_group_id).filter(Boolean));
 const previousAcceptedMaterialized=proposal?.status==="accepted"&&proposal.transfer_group_id&&materializedGroups.has(proposal.transfer_group_id);
 const showingSecondProposal=!recovery&&Boolean(previousAcceptedMaterialized)&&materializedGroups.size<2&&proposedAmount>0;
 const accepted=proposal?.status==="accepted"&&!showingSecondProposal;
 const amount=accepted?Number(proposal?.amount??proposedAmount):proposal?.status==="pending"?Number(proposal.amount):Number(proposedAmount);
 const transferDate=proposalDate??`${sourceMonth}-28`;
 const pendingTitle=recovery?"Utilisation de l’épargne conseillée":"Versement épargne proposé";
 const acceptedTitle=recovery?"Utilisation de l’épargne acceptée":"Versement épargne accepté";
 const common=<><input type="hidden" name="source_account_id" value={sourceAccountId}/><input type="hidden" name="destination_account_id" value={destinationAccountId}/><input type="hidden" name="source_month" value={sourceMonth}/><input type="hidden" name="proposal_date" value={transferDate}/>{showingSecondProposal&&proposal?.transfer_group_id?<input type="hidden" name="previous_transfer_group_id" value={proposal.transfer_group_id}/>:null}</>;
 return <section className={`mt-5 rounded-3xl border p-5 ${recovery?"border-red-200 bg-red-50":accepted?"border-emerald-300 bg-emerald-50":"border-violet-200 bg-violet-50"}`}>
  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className={`flex items-center gap-2 font-semibold ${accepted?"text-emerald-950":recovery?"text-red-950":"text-violet-950"}`}><Sparkles size={18}/>{accepted?acceptedTitle:pendingTitle}</p><p className={`mt-1 text-sm ${accepted?"text-emerald-800":recovery?"text-red-800":"text-violet-800"}`}>Le {dateLabel(transferDate)} · {sourceName} <ArrowRight className="inline" size={14}/> {destinationName}</p></div><p className={`text-2xl font-semibold ${accepted?"text-emerald-950":recovery?"text-red-950":"text-violet-950"}`}>{money(amount)}</p></div>
  <p className={`mt-3 text-xs ${recovery?"text-red-800":accepted?"text-emerald-800":"text-violet-800"}`}>{accepted?(recovery?"Le transfert vers le compte courant est enregistré avant la tension de trésorerie.":"Le débit et le crédit sont maintenant enregistrés en prévision à la date du revenu choisie."):(recovery?`Le point bas prévu est de ${money(Number(lowestBalance??0))}${lowestBalanceDate?` le ${dateLabel(lowestBalanceDate)}`:""}${overdraftDate?`. Un découvert est prévu le ${dateLabel(overdraftDate)}`:""}. Le transfert est proposé 2 jours avant le besoin réel, sauf protection immédiate nécessaire du compte.`:null)}</p>
  <div className="mt-4 flex flex-wrap items-start gap-3">
   {!accepted?<form action={acceptSavingsProposal}>{common}<input type="hidden" name="amount" value={amount}/><button className="flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white"><Check size={15}/>Accepter</button></form>:null}
   <details className="relative inline-block"><summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black shadow-sm [&::-webkit-details-marker]:hidden"><Pencil size={15}/>Modifier</summary><div className="absolute left-0 z-30 mt-2 rounded-2xl border border-black/10 bg-white p-3 shadow-xl"><form action={updateSavingsProposalAmount} className="flex items-center gap-2">{common}<input name="amount" type="number" step="0.01" min="0.01" defaultValue={amount} className="w-36 rounded-xl border border-black/15 bg-white px-3 py-2 text-black"/><button className="rounded-xl bg-black px-3 py-2 text-sm text-white">Enregistrer</button></form></div></details>
   <form action={deleteSavingsProposal}>{common}<button className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700"><Trash2 size={15}/>Supprimer</button></form>
  </div>
 </section>;
}
