import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";

const SCHOOL_YEAR=2026;
const money=(v:number)=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(v||0);
const N=(v:unknown)=>Number(v??0)||0;

function schoolMonths(year:number){
 return Array.from({length:12},(_,i)=>{
  const monthIndex=(8+i)%12;
  const y=i<4?year:year+1;
  const month=String(monthIndex+1).padStart(2,"0");
  const key=`${y}-${month}`;
  const label=new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(new Date(`${key}-01T12:00:00`));
  return {key,label};
 });
}

function monthsInclusive(start:string,end:string){
 const [sy,sm]=start.split("-").map(Number),[ey,em]=end.split("-").map(Number);
 return Math.max(1,(ey-sy)*12+(em-sm)+1);
}

function pdfEscapeLatin1(input:string){
 const normalized=input
  .replace(/[–—]/g,"-")
  .replace(/œ/g,"oe")
  .replace(/Œ/g,"OE")
  .replace(/[^\x20-\xFF]/g,"?");
 return normalized.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}

function wrap(text:string,max=94){
 const words=text.split(/\s+/),lines:string[]=[];
 let line="";
 for(const word of words){
  const next=line?`${line} ${word}`:word;
  if(next.length>max&&line){lines.push(line);line=word}else line=next;
 }
 if(line)lines.push(line);
 return lines;
}

function buildPdf(title:string,sections:{heading?:string;lines:string[]}[]){
 const pageWidth=595,pageHeight=842,left=42,top=796,bottom=48,lineHeight=14;
 const pages:string[][]=[[]];
 let y=top;
 const push=(line:string,size=10,bold=false,gap=0)=>{
  if(y<bottom+lineHeight){pages.push([]);y=top}
  pages[pages.length-1].push(`BT /${bold?"F2":"F1"} ${size} Tf ${left} ${y} Td (${pdfEscapeLatin1(line)}) Tj ET`);
  y-=lineHeight+gap;
 };
 push(title,16,true,7);
 for(const section of sections){
  if(section.heading)push(section.heading,12,true,3);
  for(const raw of section.lines){
   for(const line of wrap(raw))push(line,10,false,0);
  }
  y-=7;
 }

 const objects:string[]=[];
 objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
 const kids:string[]=[];
 let obj=3;
 const font1=obj++,font2=obj++;
 objects[font1]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
 objects[font2]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

 for(const contentLines of pages){
  const pageObj=obj++,contentObj=obj++;
  kids.push(`${pageObj} 0 R`);
  const stream=contentLines.join("\n");
  objects[contentObj]=`<< /Length ${Buffer.byteLength(stream,"latin1")} >>\nstream\n${stream}\nendstream`;
  objects[pageObj]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentObj} 0 R >>`;
 }
 objects[2]=`<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(" ")}] >>`;

 let pdf="%PDF-1.4\n";
 const offsets:number[]=[0];
 for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(pdf,"latin1");pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`}
 const xref=Buffer.byteLength(pdf,"latin1");
 pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
 for(let i=1;i<objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`;
 pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf,"latin1");
}

export async function GET(_request:NextRequest){
 const supabase=await createClient();
 const {data,error}=await supabase.auth.getClaims();
 const claims=data?.claims as {sub?:string;app_metadata?:{role?:string;photo_access?:boolean}}|undefined;
 if(error||!claims?.sub)return new Response("Non autorisé",{status:401});
 if(claims.app_metadata?.photo_access!==true||claims.app_metadata?.role==="personal")return new Response("Accès refusé",{status:403});

 const year=SCHOOL_YEAR;
 const months=schoolMonths(year);

 const [{data:settings},{data:expenses=[]}]=await Promise.all([
  supabase.from("children_settings").select("*").eq("owner_id",claims.sub).maybeSingle(),
  supabase.from("children_expenses")
   .select("label,amount,annual_amount,smooth_annual,start_month,end_month,notes,paid_by")
   .eq("owner_id",claims.sub)
   .eq("school_year_start",year)
   .order("start_month")
 ]);

 const person1=settings?.person_1_name??"Moi",person2=settings?.person_2_name??"Autre parent";
 const i1=N(settings?.income_person_1),i2=N(settings?.income_person_2),it=i1+i2,s1=it?i1/it:.5,s2=1-s1;

 const rows=(expenses as any[]).map(x=>{
  const startKey=String(x.start_month).slice(0,7),endKey=String(x.end_month).slice(0,7);
  const activeMonths=monthsInclusive(startKey,endKey);
  const annual=N(x.annual_amount)||N(x.amount)*(x.smooth_annual?12:activeMonths);
  const monthly=annual/(x.smooth_annual?12:activeMonths);
  return {...x,startKey,endKey,activeMonths,annual,monthly};
 });

 const monthly=months.map(m=>{
  const active=rows
   .filter(x=>x.smooth_annual||(x.startKey<=m.key&&x.endKey>=m.key))
   .map(x=>({...x,monthAmount:x.monthly}));
  const total=active.reduce((a,x)=>a+x.monthAmount,0);
  const paid1=active.filter(x=>x.paid_by!=="person_2").reduce((a,x)=>a+x.monthAmount,0);
  const paid2=active.filter(x=>x.paid_by==="person_2").reduce((a,x)=>a+x.monthAmount,0);
  const due1=total*s1,due2=total*s2,balance=paid1-due1;
  return {...m,active,total,paid1,paid2,due1,due2,transfer:Math.abs(balance),from:balance<-.005?person1:balance>.005?person2:null,to:balance<-.005?person2:balance>.005?person1:null};
 });

 const total=rows.reduce((a,x)=>a+x.annual,0);
 const paid1=rows.filter(x=>x.paid_by!=="person_2").reduce((a,x)=>a+x.annual,0);
 const paid2=rows.filter(x=>x.paid_by==="person_2").reduce((a,x)=>a+x.annual,0);
 const due1=total*s1,due2=total*s2,balance=paid1-due1;
 const from=balance<-.005?person1:balance>.005?person2:null,to=balance<-.005?person2:balance>.005?person1:null;

 const sections:{heading?:string;lines:string[]}[]=[
  {heading:"Synthèse annuelle",lines:[
   `Année scolaire : 2026-2027`,
   `Total des charges : ${money(total)}`,
   `Prorata : ${person1} ${(s1*100).toFixed(2)} % - ${person2} ${(s2*100).toFixed(2)} %`,
   `Payé directement par ${person1} : ${money(paid1)} - part théorique : ${money(due1)}`,
   `Payé directement par ${person2} : ${money(paid2)} - part théorique : ${money(due2)}`,
   from&&to?`Régularisation annuelle : ${from} verse ${money(Math.abs(balance))} à ${to}`:"Régularisation annuelle : aucune"
  ]},
  {heading:"Dépenses paramétrées",lines:rows.length?rows.map((x:any)=>{
    const mode=x.smooth_annual?"lissé sur 12 mois":`non lissé sur ${x.activeMonths} mois`;
    return `${x.label} - annuel ${money(x.annual)} - mensuel ${money(x.monthly)} - ${mode} - payé par ${x.paid_by==="person_2"?person2:person1}`;
  }):["Aucune dépense enregistrée."]}
 ];

 for(const m of monthly){
  sections.push({
   heading:m.label.charAt(0).toUpperCase()+m.label.slice(1),
   lines:[
    `Charges du mois : ${money(m.total)}`,
    `Payé directement par ${person1} : ${money(m.paid1)} - part théorique : ${money(m.due1)}`,
    `Payé directement par ${person2} : ${money(m.paid2)} - part théorique : ${money(m.due2)}`,
    m.from&&m.to?`Régularisation : ${m.from} verse ${money(m.transfer)} à ${m.to}`:"Régularisation : aucune",
    ...m.active.map((x:any)=>`• ${x.label} - ${money(x.monthAmount)} - payé par ${x.paid_by==="person_2"?person2:person1}${x.smooth_annual?" - lissé":""}`)
   ]
  });
 }

 const pdf=buildPdf("ENFANTS - Synthèse 2026-2027",sections);
 return new Response(new Uint8Array(pdf),{
  headers:{
   "Content-Type":"application/pdf",
   "Content-Disposition":'attachment; filename="enfants-2026-2027.pdf"',
   "Cache-Control":"no-store"
  }
 });
}
