"use client";
import { useState } from 'react';
type Props={baselineLabel?:string;dates:string[];onSelect:(index:number)=>void;values:number[];savingsValues:number[];mobilizableValues:number[];savingsLabel?:string;mobilizableLabel?:string;baselineValues?:number[];cursor:number;color?:string|null;series?:{id:string;label:string;color:string;values:number[]}[]};
function lineColor(color:string) {
 const match=/^#([0-9a-f]{6})$/i.exec(color);if(!match)return color;
 const rgb=[0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16));
 const lum=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 const light=lum>155?rgb.map(v=>Math.round(v*.65)):rgb;
 const dark=lum<135?rgb.map(v=>Math.round(v+(255-v)*.45)):rgb;
 return `light-dark(rgb(${light.join(' ')}),rgb(${dark.join(' ')}))`;
}
const money=(n:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
export function ProjectionChart({baselineLabel,dates,onSelect,values,savingsValues,mobilizableValues,savingsLabel,mobilizableLabel,baselineValues,cursor,color,series}:Props){
 const [showSavings,setShowSavings]=useState(false);
 if(values.length<2)return null;
 const lines=series?.length?series:[{id:'selected',label:'Compte sélectionné',color:color??'#5898ed',values}];
 const extras=showSavings?[{id:'savings',label:savingsLabel??'Épargne totale',color:'#af85f5',values:savingsValues},{id:'available',label:mobilizableLabel??'Épargne mobilisable',color:'#3cae9c',values:mobilizableValues}]:[];
 const plotted=[...lines,...extras];
 const data=[0,...plotted.flatMap(l=>l.values),...(baselineValues??[])];
 const min=Math.min(...data),max=Math.max(...data),span=Math.max(100,max-min);
 const step=Math.pow(10,Math.floor(Math.log10(span/5)))*([1,2,5,10].find(n=>n*Math.pow(10,Math.floor(Math.log10(span/5)))>=span/5)??10);
 const low=Math.floor(min/step)*step,high=Math.ceil(max/step)*step||step;
 const W=1000,H=300,L=95,R=25,T=25,B=55;
 const x=(i:number)=>L+i/(values.length-1)*(W-L-R),y=(v:number)=>H-B-(v-low)/Math.max(step,high-low)*(H-T-B);
 const ticks=Array.from({length:Math.round((high-low)/step)+1},(_,i)=>low+i*step);
 const dateLabel=(d:string)=>new Intl.DateTimeFormat('fr-FR',{month:'short',year:'2-digit'}).format(new Date(`${d}T12:00:00`));
 const pointString=(v:number[])=>v.map((n,i)=>`${x(i)},${y(n)}`).join(' ');
 return <div className="projection-chart-surface mt-6 rounded-2xl border p-3 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Évolution des soldes</h3><p className="text-xs text-neutral-500">Soldes en fin de mois · sélectionnez un mois dans le graphique</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showSavings} onChange={e=>setShowSavings(e.target.checked)}/>Afficher aussi l’épargne</label></div>
  <div className="mt-4 overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="block h-[260px] sm:h-[300px] min-w-[680px] w-full" role="img" aria-label="Graphique des soldes mensuels avec axes en euros et dates">
   {low<0?<rect x={L} y={y(0)} width={W-L-R} height={y(low)-y(0)} fill="#e56464" opacity=".09"/>:null}
   {ticks.map(v=><g key={v}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke={v===0?'#e56464':'currentColor'} opacity={v===0?.9:.15} strokeDasharray={v===0?undefined:'4 5'}/><text x={L-12} y={y(v)+5} textAnchor="end" fill="currentColor" fontSize="13">{money(v)}</text></g>)}
   {baselineValues?<polyline points={pointString(baselineValues)} fill="none" stroke="currentColor" strokeWidth="2" opacity=".55" strokeDasharray="7 5"/>:null}
   {plotted.map(l=><g key={l.id}><polyline points={pointString(l.values)} fill="none" stroke={lineColor(l.color)} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx={x(cursor)} cy={y(l.values[cursor]??0)} r="5" fill={lineColor(l.color)} stroke="var(--p-surface,#fff)" strokeWidth="2"/></g>)}
   <line x1={x(cursor)} x2={x(cursor)} y1={T} y2={H-B} stroke="currentColor" opacity=".45" strokeDasharray="4 4"/>
   {dates.map((d,i)=>i===0||i===dates.length-1||i%Math.ceil(dates.length/6)===0?<text key={d} x={x(i)} y={H-20} textAnchor={i===0?'start':i===dates.length-1?'end':'middle'} fill="currentColor" fontSize="13">{dateLabel(d)}</text>:null)}
   {dates.map((d,i)=><rect key={d} x={Math.max(L,x(i)-(W-L-R)/(values.length-1)/2)} y={T} width={(W-L-R)/(values.length-1)} height={H-T-B} fill="transparent" onClick={()=>onSelect(i)}><title>{`${dateLabel(d)} : ${plotted.map(l=>`${l.label} ${money(l.values[i])}`).join(' · ')}`}</title></rect>)}
  </svg></div>
  <div className="mt-3 flex flex-wrap gap-3">{plotted.map(l=><span key={l.id} className="flex items-center gap-2 text-xs"><span className="h-1 w-5 rounded" style={{background:lineColor(l.color)}}/>{l.label} : <strong>{money(l.values[cursor]??0)}</strong></span>)}{baselineValues?<span className="text-xs">Pointillés : sans simulation {baselineLabel?`(${baselineLabel})`:''}</span>:null}</div>
  <p className="mt-3 text-xs text-neutral-500">{dateLabel(dates[cursor])} · Ligne rouge : découvert à 0 €. Le résumé des risques analyse aussi les creux entre deux fins de mois.</p>
 </div>;
}
