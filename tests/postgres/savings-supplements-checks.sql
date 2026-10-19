-- Run after the synthetic fixture and the new migration, never on production.
create function public.test_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is not true then raise exception 'FAIL: %',label; end if;end$$;
create function public.test_refusal(decision uuid,previous uuid,action text,amount numeric) returns void language plpgsql as $$begin
 begin perform public.mutate_personal_savings_supplement(decision,previous,action,amount); exception when others then return; end;
 raise exception 'FAIL: expected refusal';
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false);
select mutate_personal_savings_supplement('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','update',20);
select test_assert((select status='pending' and amount=20 from personal_savings_supplements),'pending persisted');
select mutate_personal_savings_supplement('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','accept',20);
select mutate_personal_savings_supplement('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','accept',20);
select test_assert((select count(*)=18 from personal_movements),'idempotent acceptance');
select test_refusal('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','update',30);
select test_refusal('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','delete',0);
select mutate_personal_savings_supplement('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','delete',0);
select test_refusal('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','accept',10);
select test_refusal('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004','accept',10);
select test_refusal('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','accept',100000);
-- A second independent supplement follows the first accepted supplement.
select mutate_personal_savings_supplement(decision_id,transfer_group_id,'accept',5) from personal_savings_supplements where status='accepted';
select test_assert((select count(*)=20 from personal_movements),'second supplement independent');
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',false);
select test_assert((select count(*)=0 from personal_savings_supplements),'RLS hides other owners');
select test_refusal('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','accept',10);
reset role;
-- Force a failure on the credit: the debit and the decision must roll back together.
create function reject_test_credit() returns trigger language plpgsql as $$begin if new.movement_type='transfer_in' and new.amount=13 then raise exception 'Synthetic invalid credit'; end if;return new;end$$;
create trigger reject_test_credit before insert on personal_movements for each row execute function reject_test_credit();
set role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false);
select test_refusal('00000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000007','accept',13);
select test_assert((select count(*)=20 from personal_movements),'second-leg failure rollback');
select test_assert(not exists(select 1 from personal_savings_supplements where decision_id='00000000-0000-0000-0000-000000000007'),'decision rollback');
reset role;
select test_assert(not exists((select * from baseline_decisions except select * from personal_savings_proposals) union all (select * from personal_savings_proposals except select * from baseline_decisions)),'old decisions unchanged');
select test_assert(not exists(select * from baseline_movements except select * from personal_movements),'old movements unchanged');
select test_assert(not has_table_privilege('anon','personal_savings_supplements','SELECT'),'anon denied');
select test_assert(not has_function_privilege('anon','mutate_personal_savings_supplement(uuid,uuid,text,numeric)','EXECUTE'),'anon RPC denied');
select 'SQL CHECKS PASSED' as result;
