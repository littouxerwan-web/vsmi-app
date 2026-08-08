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

function esc(input:string){
 const normalized=input.replace(/[–—]/g,"-").replace(/œ/g,"oe").replace(/Œ/g,"OE").replace(/[^\x20-\xFF]/g,"?");
 return normalized.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}

type PdfPage={commands:string[]};

class SimplePdf{
 pages:PdfPage[]=[{commands:[]}];
 pageWidth=595;
 pageHeight=842;
 margin=38;
 y=804;
 get page(){return this.pages[this.pages.length-1]}
 newPage(){this.pages.push({commands:[]});this.y=804}
 text(text:string,x:number,y:number,size=10,bold=false){this.page.commands.push(`BT /${bold?"F2":"F1"} ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET`)}
 line(x1:number,y1:number,x2:number,y2:number,width=.5){this.page.commands.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`)}
 rect(x:number,y:number,w:number,h:number,width=.7){this.page.commands.push(`${width} w ${x} ${y} ${w} ${h} re S`)}
 fillRect(x:number,y:number,w:number,h:number,gray=.96){this.page.commands.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`)}
 ensure(height:number){if(this.y-height<45)this.newPage()}
 title(text:string){this.ensure(40);this.text(text,this.margin,this.y,17,true);this.y-=28}
 sectionTitle(text:string){this.ensure(30);this.text(text,this.margin,this.y,12,true);this.y-=18}
 metricGrid(items:{label:string;value:string;sub?:string}[]){
  const gap=8,width=(this.pageWidth-this.margin*2-gap)/2,height=62;
  for(let i=0;i<items.length;i+=2){
   this.ensure(height+gap);
   items.slice(i,i+2).forEach((item,j)=>{
    const x=this.margin+j*(width+gap),top=this.y;
    this.fillRect(x,top-height,width,height,.965);this.rect(x,top-height,width,height,.45);
    this.text(item.label,x+10,top-17,8);this.text(item.value,x+10,top-38,15,true);
    if(item.sub)this.text(item.sub,x+10,top-53,7.5);
   });
   this.y-=height+gap;
  }
 }
 callout(title:string,value:string,sub?:string){
  const h=sub?72:58;this.ensure(h+10);
  const x=this.margin,w=this.pageWidth-this.margin*2,top=this.y;
  this.fillRect(x,top-h,w,h,.91);this.rect(x,top-h,w,h,.8);
  this.text(title,x+12,top-19,9,true);this.text(value,x+12,top-43,15,true);
  if(sub)this.text(sub,x+12,top-59,8);
  this.y-=h+12;
 }
 expenseBox(row:any,person1:string,person2:string){
  const h=52;this.ensure(h+8);const x=this.margin,w=this.pageWidth-this.margin*2,top=this.y;
  this.rect(x,top-h,w,h,.45);this.text(row.label,x+10,top-16,9,true);
  this.text(`Annuel : ${money(row.annual)}`,x+10,top-33,8);
  this.text(`Mensuel : ${money(row.monthly)}`,x+130,top-33,8);
  this.text(row.smooth_annual?"Lissé sur 12 mois":`Non lissé - ${row.activeMonths} mois`,x+250,top-33,8);
  this.text(`Payé par ${row.paid_by==="person_2"?person2:person1}`,x+390,top-33,8);
  this.y-=h+7;
 }
 monthCard(month:any,person1:string,person2:string){
  const rowCount=Math.max(1,month.active.length),h=122+rowCount*17;
  this.ensure(h+12);
  const x=this.margin,w=this.pageWidth-this.margin*2,top=this.y;
  this.rect(x,top-h,w,h,.8);this.fillRect(x,top-28,w,28,.93);
  this.text(month.label.charAt(0).toUpperCase()+month.label.slice(1),x+10,top-18,11,true);
  this.text(`Charges : ${money(month.total)}`,x+w-145,top-18,10,true);
  const col=(w-30)/2,y1=top-48;
  this.fillRect(x+10,y1-40,col,44,.965);this.rect(x+10,y1-40,col,44,.35);
  this.text(`Payé par ${person1}`,x+18,y1-8,8);this.text(money(month.paid1),x+18,y1-24,11,true);this.text(`Part théorique : ${money(month.due1)}`,x+18,y1-37,7.5);
  this.fillRect(x+20+col,y1-40,col,44,.965);this.rect(x+20+col,y1-40,col,44,.35);
  this.text(`Payé par ${person2}`,x+28+col,y1-8,8);this.text(money(month.paid2),x+28+col,y1-24,11,true);this.text(`Part théorique : ${money(month.due2)}`,x+28+col,y1-37,7.5);
  const regY=top-100;this.line(x+10,regY+12,x+w-10,regY+12,.35);
  this.text("Régularisation",x+10,regY,8,true);
  this.text(month.from&&month.to?`${month.from} -> ${month.to} : ${money(month.transfer)}`:"Aucune",x+105,regY,9,true);
  const detailY=regY-22;this.text("Détail des dépenses",x+10,detailY,8,true);
  if(month.active.length===0){this.text("Aucune charge ce mois.",x+10,detailY-16,8)}
  else month.active.forEach((row:any,idx:number)=>{
   const yy=detailY-16-idx*17,who=row.paid_by==="person_2"?person2:person1,smooth=row.smooth_annual?" - lissé":"";
   this.text(`- ${row.label}`,x+10,yy,8);this.text(`${money(row.monthAmount)} - ${who}${smooth}`,x+w-220,yy,8);
  });
  this.y-=h+12;
 }
 build(){
  const objects:string[]=[];objects[1]="<< /Type /Catalog /Pages 2 0 R >>";const kids:string[]=[];let obj=3;
  const font1=obj++,font2=obj++;
  objects[font1]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[font2]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  for(const page of this.pages){
   const pageObj=obj++,contentObj=obj++;kids.push(`${pageObj} 0 R`);const stream=page.commands.join("\n");
   objects[contentObj]=`<< /Length ${Buffer.byteLength(stream,"latin1")} >>\nstream\n${stream}\nendstream`;
   objects[pageObj]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentObj} 0 R >>`;
  }
  objects[2]=`<< /Type /Pages /Count ${this.pages.length} /Kids [${kids.join(" ")}] >>`;
  let pdf="%PDF-1.4\n";const offsets:number[]=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(pdf,"latin1");pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`}
  const xref=Buffer.byteLength(pdf,"latin1");pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf,"latin1");
 }
}

export async function GET(_request:NextRequest){
 const supabase=await createClient();
 const {data,error}=await supabase.auth.getClaims();
 const claims=data?.claims as {sub?:string;app_metadata?:{role?:string;photo_access?:boolean}}|undefined;
 if(error||!claims?.sub)return new Response("Non autorisé",{status:401});
 if(claims.app_metadata?.photo_access!==true||claims.app_metadata?.role==="personal")return new Response("Accès refusé",{status:403});
 const months=schoolMonths(SCHOOL_YEAR);
 const [{data:settings},{data:expenses=[]}]=await Promise.all([
  supabase.from("children_settings").select("*").eq("owner_id",claims.sub).maybeSingle(),
  supabase.from("children_expenses").select("label,amount,annual_amount,smooth_annual,start_month,end_month,notes,paid_by").eq("owner_id",claims.sub).eq("school_year_start",SCHOOL_YEAR).order("start_month")
 ]);
 const person1=settings?.person_1_name??"Moi",person2=settings?.person_2_name??"Autre parent";
 const i1=N(settings?.income_person_1),i2=N(settings?.income_person_2),it=i1+i2,s1=it?i1/it:.5,s2=1-s1;
 const rows=(expenses as any[]).map(x=>{
  const startKey=String(x.start_month).slice(0,7),endKey=String(x.end_month).slice(0,7),activeMonths=monthsInclusive(startKey,endKey);
  const annual=N(x.annual_amount)||N(x.amount)*(x.smooth_annual?12:activeMonths),monthly=annual/(x.smooth_annual?12:activeMonths);
  return {...x,startKey,endKey,activeMonths,annual,monthly};
 });
 const monthly=months.map(m=>{
  const active=rows.filter(x=>x.smooth_annual||(x.startKey<=m.key&&x.endKey>=m.key)).map(x=>({...x,monthAmount:x.monthly}));
  const total=active.reduce((a,x)=>a+x.monthAmount,0),paid1=active.filter(x=>x.paid_by!=="person_2").reduce((a,x)=>a+x.monthAmount,0),paid2=active.filter(x=>x.paid_by==="person_2").reduce((a,x)=>a+x.monthAmount,0);
  const due1=total*s1,due2=total*s2,balance=paid1-due1;
  return {...m,active,total,paid1,paid2,due1,due2,transfer:Math.abs(balance),from:balance<-.005?person1:balance>.005?person2:null,to:balance<-.005?person2:balance>.005?person1:null};
 });
 const total=rows.reduce((a,x)=>a+x.annual,0),paid1=rows.filter(x=>x.paid_by!=="person_2").reduce((a,x)=>a+x.annual,0),paid2=rows.filter(x=>x.paid_by==="person_2").reduce((a,x)=>a+x.annual,0);
 const due1=total*s1,due2=total*s2,balance=paid1-due1,from=balance<-.005?person1:balance>.005?person2:null,to=balance<-.005?person2:balance>.005?person1:null;
 const pdf=new SimplePdf();
 pdf.title("ENFANTS - Synthèse 2026-2027");
 pdf.sectionTitle("Synthèse annuelle");
 pdf.metricGrid([
  {label:"Total des charges",value:money(total),sub:"Septembre 2026 - août 2027"},
  {label:"Prorata des revenus",value:`${(s1*100).toFixed(2)} % / ${(s2*100).toFixed(2)} %`,sub:`${person1} / ${person2}`},
  {label:`Payé directement par ${person1}`,value:money(paid1),sub:`Part théorique : ${money(due1)}`},
  {label:`Payé directement par ${person2}`,value:money(paid2),sub:`Part théorique : ${money(due2)}`}
 ]);
 if(from&&to)pdf.callout("Régularisation annuelle",`${from} doit verser ${money(Math.abs(balance))} à ${to}`,"Après ce versement, chacun supporte sa part théorique.");
 else pdf.callout("Régularisation annuelle","Aucune régularisation","Les paiements directs correspondent déjà aux parts théoriques.");
 pdf.sectionTitle("Dépenses paramétrées");
 if(rows.length===0)pdf.callout("Aucune dépense","Aucune charge enregistrée pour 2026-2027.");
 else rows.forEach((row:any)=>pdf.expenseBox(row,person1,person2));
 pdf.newPage();pdf.title("Vue mensuelle 2026-2027");monthly.forEach(m=>pdf.monthCard(m,person1,person2));
 const bytes=pdf.build();
 return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="enfants-2026-2027.pdf"',"Cache-Control":"no-store"}});
}
