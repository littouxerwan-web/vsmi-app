alter table public.personal_accounts
  add column if not exists display_order integer;

with ranked as (
  select id,
         row_number() over (
           partition by owner_id
           order by account_type, name, created_at, id
         ) - 1 as position
  from public.personal_accounts
)
update public.personal_accounts a
set display_order = ranked.position
from ranked
where a.id = ranked.id
  and a.display_order is null;

alter table public.personal_accounts
  alter column display_order set default 0;
