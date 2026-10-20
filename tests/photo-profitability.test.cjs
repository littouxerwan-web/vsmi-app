const {test}=require('node:test');
const assert=require('node:assert/strict');
const {annualPhotoProfitability,profitability}=require('./helpers/load-typescript.cjs')('src/lib/photo/profitability.ts');
const base=()=>({today:'2026-10-20',categories:[{id:'photo',name:'Photographie',parent_id:null},{id:'child',name:'Matériel',parent_id:'photo'}],movements:[],recurrences:[],overrides:[],exclusions:[],payments:[],weddings:[]});
test('rentabilité : seuil, URSSAF, perte et nombre de mariages arrondi au supérieur',()=>{
 const r=profitability(10000,8000,2000);assert.equal(r.urssaf,2160);assert.equal(r.profit,-160);assert.equal(r.breakEven,10204.09);assert.equal(r.weddingsNeeded,6);
 assert.equal(profitability(0,100,0).weddingsNeeded,null);assert.equal(profitability(100,100,10,100).breakEven,null);
});
test('rentabilité : années comptables distinctes du prix moyen des mariages, acompte non doublonné',()=>{
 const b=base();b.weddings=[{id:'w',wedding_date:'2027-05-01',total_amount:2000}];b.payments=[{wedding_id:'w',display_name:'A',wedding_date:'2027-05-01',amount:500,status:'received',received_date:'2026-10-01',expected_date:'2026-09-01'},{wedding_id:'w',display_name:'A',wedding_date:'2027-05-01',amount:1500,status:'expected',received_date:null,expected_date:'2027-05-01'},{wedding_id:null,display_name:'Annulé',wedding_date:'2027-01-01',amount:900,status:'cancelled',expected_date:'2027-01-01'}];
 const {rows}=annualPhotoProfitability(b);assert.equal(rows[0].received,500);assert.equal(rows[1].expected,1500);assert.equal(rows[1].weddingCount,1);assert.equal(rows[1].averagePrice,2000);
});
test('rentabilité : sous-catégories, date réelle, virements exclus, annulations et tous comptes',()=>{
 const b=base();b.movements=[{id:'a',account_id:'one',category_id:'child',movement_type:'expense',amount:100,status:'completed',movement_date:'2026-12-01',completed_date:'2027-01-01'},{id:'b',account_id:'two',category_id:'photo',movement_type:'expense',amount:200,status:'planned',movement_date:'2026-10-25'},{id:'c',category_id:'photo',movement_type:'transfer_out',amount:999,status:'planned',movement_date:'2026-10-25'},{id:'d',category_id:'photo',movement_type:'expense',amount:999,status:'cancelled',movement_date:'2026-10-25'}];
 const {rows}=annualPhotoProfitability(b);assert.equal(rows[0].paidCharges,0);assert.equal(rows[0].plannedCharges,200);assert.equal(rows[1].paidCharges,100);
});
test('rentabilité : récurrences matérialisées déplacées ou annulées non recréées, exclusions et montant modifié',()=>{
 const b=base();b.recurrences=[{id:'r',category_id:'photo',movement_type:'expense',amount:10,frequency:'monthly',interval_count:1,start_date:'2026-10-31',end_date:'2027-01-31',annual_change_percent:0,is_active:true}];
 b.movements=[{id:'m',recurrence_id:'r',occurrence_date:'2026-10-31',category_id:'photo',movement_type:'expense',amount:10,status:'cancelled',movement_date:'2026-11-02'}];b.exclusions=[{recurrence_id:'r',occurrence_date:'2026-11-30'}];b.overrides=[{recurrence_id:'r',occurrence_month:'2026-12-01',amount:25}];
 const {rows}=annualPhotoProfitability(b);assert.equal(rows[0].plannedCharges,25);assert.equal(rows[1].plannedCharges,10);
});
test('rentabilité : paiements manuels groupés et catégorie absente signalée',()=>{
 const b=base();b.categories=[];b.payments=[500,1500].map(amount=>({wedding_id:null,display_name:'Émilie & Paul',wedding_date:'2026-05-01',amount,status:'received',received_date:'2026-05-01'}));const r=annualPhotoProfitability(b);assert.equal(r.categoryFound,false);assert.equal(r.rows[0].weddingCount,1);assert.equal(r.rows[0].averagePrice,2000);
});
