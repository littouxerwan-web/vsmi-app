"""Only the disposable container and synthetic fixture created for these tests."""
import subprocess
from concurrent.futures import ThreadPoolExecutor
CONTAINER = 'vsmi-savings-supplement-test-20261019'
def sql(query):
    return subprocess.run(['docker','exec','-i',CONTAINER,'psql','-h','/tmp','-U','postgres','-d','supplements_v2','-v','ON_ERROR_STOP=1','-At'],input=query,text=True,capture_output=True)
def accept(n, amount):
    return sql("set role authenticated; select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',false); "
        + f"select mutate_personal_savings_supplement('00000000-0000-0000-0000-{n:012d}','10000000-0000-0000-0000-{n:012d}','accept',{amount});")
with ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda _:accept(8,10),range(2)))
assert all(r.returncode==0 for r in results), [r.stderr for r in results]
r=sql("select test_assert((select count(*)=1 from personal_savings_supplements where decision_id='00000000-0000-0000-0000-000000000008'),'one decision under concurrency'); select test_assert((select count(*)=22 from personal_movements),'one transfer pair under concurrency');")
assert r.returncode==0,r.stderr
with ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(lambda n:accept(n,600),(3,4)))
assert sum(r.returncode==0 for r in results)==1,'Only one of the competing withdrawals may succeed'
assert any('insuffisants' in r.stderr for r in results),'Other withdrawal must report insufficient funds'
r=sql("select test_assert(not exists(select * from baseline_movements except select * from personal_movements),'historical movements unchanged'); select test_assert(not exists(select * from baseline_decisions except select * from personal_savings_proposals),'historical decisions unchanged');")
assert r.returncode==0,r.stderr
print('PASS: concurrent replay, competing withdrawals, unchanged history')
