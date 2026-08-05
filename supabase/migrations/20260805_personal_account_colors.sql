alter table public.personal_accounts
  add column if not exists color text not null default '#dbeafe';

update public.personal_accounts
set color = '#dbeafe'
where color is null or color = '';
