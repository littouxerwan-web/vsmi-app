const {test}=require('node:test');
const assert=require('node:assert/strict');
const {groupMonthlyOperations,isRepeatedSchedule}=require('./helpers/load-typescript.cjs')('src/lib/perso/monthly-operation-groups.ts');
test('regroupe sans perdre de ligne, trie les catégories puis les dates, totalise les montants',()=>{
 const rows=[{id:'late',date:'2026-10-25',categoryId:'c',recurring:true,amount:30.1,content:'late'}, {id:'early',date:'2026-10-01',categoryId:'c',recurring:true,amount:20.2,content:'early'}, {id:'photo',date:'2026-10-03',categoryId:null,recurring:false,amount:100,content:'photo'}, {id:'missing',date:'2026-10-02',categoryId:'deleted',recurring:false,amount:25,content:'missing'}];
 const groups=groupMonthlyOperations(rows,[{id:'c',name:'Courses'}]);
 assert.equal(groups[0].total,50.3);assert.equal(groups[1].total,125);
 assert.equal(groups[0].categories[0].items.map(x=>x.id).join(','),'early,late');
 assert.equal(groups[1].categories[0].name,'Divers');
 assert.equal(groups[1].categories[0].items.map(x=>x.id).join(','),'missing,photo');
 assert.equal(groups.reduce((n,g)=>n+g.count,0),rows.length);
 assert.equal(rows[0].id,'late');
});
test('une programmation unique reste ponctuelle, plusieurs occurrences sont récurrentes',()=>{
 const schedule={start_date:'2026-01-31',frequency:'monthly',interval_count:1};
 assert.equal(isRepeatedSchedule({...schedule,end_date:'2026-02-27'}),false);
 assert.equal(isRepeatedSchedule({...schedule,end_date:'2026-02-28'}),true);
 assert.equal(isRepeatedSchedule({...schedule,end_date:null}),true);
 assert.equal(isRepeatedSchedule({...schedule,frequency:'yearly',interval_count:5,end_date:null}),true);
});
test('les groupes vides restent disponibles avec zéro et aucun élément',()=>{
 const groups=groupMonthlyOperations([],[]);assert.equal(groups.length,2);
 assert.ok(groups.every(g=>g.total===0&&g.count===0&&g.categories.length===0));
});
test('crédits et débits : à venir / total restent complets avec un filtre de pointage',()=>{
 const row=(id,direction,completed,amount)=>({id,date:'2026-10-01',categoryId:null,recurring:true,amount,direction,completed,content:null});
 const all=[row('a','credit',false,100),row('b','credit',true,200),row('c','debit',false,40),row('d','debit',true,60)];
 for(const visible of [all,all.filter(r=>!r.completed),all.filter(r=>r.completed)]){
 const g=groupMonthlyOperations(visible,[],all)[0];
 assert.equal(g.credits.pending,100);assert.equal(g.credits.total,300);
 assert.equal(g.debits.pending,40);assert.equal(g.debits.total,100);
 }
});
