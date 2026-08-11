import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const LAURE_USER_ID = "791eda92-4159-4db2-b132-1be129f56027";
const N = (v: unknown) => Number(v ?? 0) || 0;
const money = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[–—]/g, "-").replace(/€/g, "EUR").replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/[^\x20-\xFF]/g, " ");
const monthNums = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const monthLabels = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
const core: [string, string][] = [
  ["loyer", "Loyer saint pere"], ["assurance_local", "Assurance Local"], ["frais_bancaires", "Frais banquier"],
  ["cotisations_trimestrielles", "Cotisation trimestrielle banque"], ["urssaf", "URSSAF"], ["care", "CARE"],
  ["agipi", "AGIPI"], ["rcp", "AXA RCP"], ["cfe", "CFE"], ["doctolib", "Doctolib Pro"], ["formation", "Formation"],
  ["gants_masques_blouse", "Gants, masques, blouse"], ["restauration", "Restauration"], ["frais_de_transport", "Frais de transport"],
  ["materiel_de_bureau", "Materiel de bureau"], ["blanchisserie", "Blanchisserie"], ["comptable", "Comptable"], ["per", "PER"], ["telephone", "Telephone"],
];

type RGB = [number, number, number];
const C = { red:[1,.45,.45] as RGB, paleRed:[1,.88,.88] as RGB, yellow:[1,.94,.2] as RGB, paleYellow:[1,.97,.70] as RGB, paleGreen:[.90,.95,.78] as RGB, white:[1,1,1] as RGB, black:[0,0,0] as RGB, grid:[1,.25,.25] as RGB };

class Pdf {
  pages: string[][] = [[]]; pageW = 1191; pageH = 842;
  get p(){ return this.pages[this.pages.length - 1]; }
  color(c:RGB){ return `${c[0]} ${c[1]} ${c[2]}`; }
  rect(x:number,y:number,w:number,h:number,fill?:RGB,stroke?:RGB){ if(fill) this.p.push(`${this.color(fill)} rg ${x} ${y} ${w} ${h} re f`); if(stroke) this.p.push(`${this.color(stroke)} RG 0.5 w ${x} ${y} ${w} ${h} re S`); }
  text(t:string,x:number,y:number,s=8,b=false,c:RGB=C.black,align:"left"|"right"|"center"="left",w=0){ let tx=x; const clean=esc(t); if(align!=="left"&&w){ const approx=clean.length*s*.46; tx=align==="right"?x+w-approx-3:x+(w-approx)/2; } this.p.push(`BT ${this.color(c)} rg /${b?"F2":"F1"} ${s} Tf ${tx.toFixed(1)} ${y.toFixed(1)} Td (${clean}) Tj ET`); }
  cell(t:string,x:number,y:number,w:number,h:number,o:{fill?:RGB;stroke?:RGB;bold?:boolean;color?:RGB;align?:"left"|"right"|"center";size?:number}={}){ this.rect(x,y-h,w,h,o.fill,o.stroke??C.grid); this.text(t,x+3,y-h+5,o.size??7,o.bold??false,o.color??C.black,o.align??"left",w-6); }
  build(){ const objs:string[]=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Kids [${this.pages.map((_,i)=>`${5+i*2} 0 R`).join(" ")}] /Count ${this.pages.length} >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`]; this.pages.forEach((p,i)=>{ const content=p.join("\n"); objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageW} ${this.pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+i*2} 0 R >>`,`<< /Length ${Buffer.byteLength(content,"latin1")} >>\nstream\n${content}\nendstream`); }); let out="%PDF-1.4\n"; const offs=[0]; objs.forEach((o,i)=>{ offs.push(Buffer.byteLength(out,"latin1")); out+=`${i+1} 0 obj\n${o}\nendobj\n`; }); const x=Buffer.byteLength(out,"latin1"); out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`; for(let i=1;i<offs.length;i++) out+=`${String(offs[i]).padStart(10,"0")} 00000 n \n`; out+=`trailer << /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`; return Buffer.from(out,"latin1"); }
}

export async function GET(req: NextRequest){
  const supabase = await createClient(); const { data:{ user } } = await supabase.auth.getUser(); if(!user || user.id !== LAURE_USER_ID) return new Response("Acces refuse", { status:403 });
  const u = new URL(req.url), scope = u.searchParams.get("scope") === "year" ? "year" : "month"; const now = new Date(); const year = Number(u.searchParams.get("year")) || now.getFullYear(); const month = (u.searchParams.get("month") || `${year}-${String(now.getMonth()+1).padStart(2,"0")}`).slice(0,7);
  const from = scope === "year" ? `${year}-01-01` : `${month}-01`; const to = scope === "year" ? `${year}-12-31` : `${month}-31`;
  const [{data:fees=[]},{data:charges=[]},{data:settings=[]}] = await Promise.all([
    supabase.from("osteo_fees").select("fee_date,payment_method,amount").eq("owner_id",user.id).gte("fee_date",from).lte("fee_date",to).order("fee_date",{ascending:false}),
    supabase.from("osteo_charges").select("month,due_day,category_key,label,amount").eq("owner_id",user.id).gte("month",scope==="year"?`${year}-01-01`:`${month}-01`).lte("month",scope==="year"?`${year}-12-01`:`${month}-01`).order("month").order("sort_order"),
    supabase.from("osteo_monthly_settings").select("month,sublease_income,km_per_day,benefit_previous_year").eq("owner_id",user.id).gte("month",scope==="year"?`${year}-01-01`:`${month}-01`).lte("month",scope==="year"?`${year}-12-01`:`${month}-01`),
  ]);
  const pdf = new Pdf(); if(scope === "year") draw2035(pdf,year,fees as any[],charges as any[],settings as any[]); else drawMonth(pdf,month,fees as any[],charges as any[],settings as any[]);
  const body = pdf.build(); return new Response(body,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="OSTEO-${scope==="year"?`2035-${year}`:month}.pdf"`}});
}

function drawMonth(pdf:Pdf,month:string,fees:any[],charges:any[],settings:any[]){
  // Le mensuel reste volontairement simple ; le changement demandé concerne surtout l'export 2035 annuel.
  const cb=fees.filter(f=>f.payment_method==="cb").reduce((s,f)=>s+N(f.amount),0), ch=fees.filter(f=>f.payment_method==="cheque").reduce((s,f)=>s+N(f.amount),0), cash=fees.filter(f=>f.payment_method==="cash").reduce((s,f)=>s+N(f.amount),0), sub=N(settings[0]?.sublease_income), exp=charges.reduce((s,c)=>s+N(c.amount),0);
  pdf.text(`OSTEO - ${month}`,35,805,18,true); pdf.text(`Cheque + CB : ${money(cb+ch)}   Especes : ${money(cash)}   Sous-location : ${money(sub)}   Depenses : ${money(exp)}   Benefice : ${money(cb+ch+cash+sub-exp)}`,35,780,10,true);
  let y=750; const widths=[110,190,110]; pdf.cell("Date",35,y,widths[0],20,{fill:C.paleYellow,bold:true}); pdf.cell("Reglement",145,y,widths[1],20,{fill:C.paleYellow,bold:true}); pdf.cell("Montant",335,y,widths[2],20,{fill:C.paleYellow,bold:true,align:"right"}); y-=20;
  for(const f of fees){ pdf.cell(f.fee_date,35,y,widths[0],18); pdf.cell(f.payment_method==="cb"?"CB":f.payment_method==="cash"?"Especes":"Cheque",145,y,widths[1],18); pdf.cell(money(N(f.amount)),335,y,widths[2],18,{align:"right"}); y-=18; }
  y-=18; pdf.cell("Jour",35,y,70,20,{fill:C.paleRed,bold:true}); pdf.cell("Charge",105,y,230,20,{fill:C.paleRed,bold:true}); pdf.cell("Montant",335,y,110,20,{fill:C.paleRed,bold:true,align:"right"}); y-=20; for(const c of charges){ pdf.cell(String(c.due_day),35,y,70,18); pdf.cell(c.label,105,y,230,18); pdf.cell(money(N(c.amount)),335,y,110,18,{align:"right"}); y-=18; }
}

function draw2035(pdf:Pdf,year:number,fees:any[],charges:any[],settings:any[]){
  pdf.text(`Osteopathie ${year}`,410,814,13,false,[.35,.25,.95]);
  const x0=22,y0=785,rowH=18,groupW=58,labelW=142,monthW=63,totalW=82; let y=y0;
  pdf.cell("",x0,y,groupW,rowH,{fill:C.white}); pdf.cell("",x0+groupW,y,labelW,rowH,{fill:C.white}); let x=x0+groupW+labelW;
  for(const m of monthLabels){ pdf.cell(m,x,y,monthW,rowH,{fill:C.white,bold:true,align:"center",size:6.5}); x+=monthW; } pdf.cell("Total par ligne",x,y,totalW,rowH,{fill:C.white,bold:true,align:"center",size:6.2}); y-=rowH;
  const byMonth = monthNums.map(mm=>{ const key=`${year}-${mm}`; const fs=fees.filter(f=>String(f.fee_date).startsWith(key)); const cs=charges.filter(c=>String(c.month).startsWith(key)); const set=settings.find(s=>String(s.month).startsWith(key)); const cbch=fs.filter(f=>f.payment_method!=="cash").reduce((s,f)=>s+N(f.amount),0), cash=fs.filter(f=>f.payment_method==="cash").reduce((s,f)=>s+N(f.amount),0), sub=N(set?.sublease_income), exp=cs.reduce((s,c)=>s+N(c.amount),0), days=new Set(fs.map(f=>f.fee_date)).size; return {fs,cs,set,cbch,cash,sub,total:cbch+cash+sub,exp,benefit:cbch+cash+sub-exp,patients:fs.length,days,km:days*N(set?.km_per_day),prev:N(set?.benefit_previous_year)}; });
  const row=(group:string,label:string,values:number[],fillLabel:RGB,groupFill?:RGB,bold=false,plain=false)=>{ pdf.cell(group,x0,y,groupW,rowH,{fill:groupFill??fillLabel,bold:true,size:6.5}); pdf.cell(label,x0+groupW,y,labelW,rowH,{fill:fillLabel,bold}); let xx=x0+groupW+labelW; for(const v of values){ pdf.cell(plain?String(Math.round(v)):money(v),xx,y,monthW,rowH,{fill:C.white,align:"right",size:6.2}); xx+=monthW; } pdf.cell(plain?String(Math.round(values.reduce((s,v)=>s+v,0))):money(values.reduce((s,v)=>s+v,0)),xx,y,totalW,rowH,{fill:C.white,align:"right",bold,size:6.2}); y-=rowH; };
  row("Revenus","Cheques et CB",byMonth.map(m=>m.cbch),C.paleYellow,C.yellow); row("","Especes",byMonth.map(m=>m.cash),C.paleYellow,C.yellow); row("","Sous loc",byMonth.map(m=>m.sub),C.paleYellow,C.yellow); y-=4; row("","Total revenus",byMonth.map(m=>m.total),C.paleGreen,C.yellow,true);
  y-=8; core.forEach(([key,label],i)=>row(i===0?"Depenses":"",label,byMonth.map(m=>N(m.cs.find(c=>c.category_key===key)?.amount)),C.paleRed,C.red));
  y-=8; row("","Depenses",byMonth.map(m=>m.exp),C.red,C.red,true); y-=6; row("",`Benefice ${year}`,byMonth.map(m=>m.benefit),C.paleGreen,C.yellow,true); row("","Nbr patients",byMonth.map(m=>m.patients),C.paleYellow,C.yellow,true,true); row("","Nbre de jours",byMonth.map(m=>m.days),C.paleYellow,C.yellow,true,true); row("","Km/mois",byMonth.map(m=>m.km),C.paleYellow,C.yellow,true,true); y-=6; row("",`Benefices ${year-1}`,byMonth.map(m=>m.prev),C.paleYellow,C.yellow,true);
  pdf.text("Presentation 2035 : structure, ordre des lignes, grille et code couleur repris de l'onglet 2035 du fichier fourni.",x0,28,7,false,[.35,.35,.35]);
}
