-- Autorise un troisième type de compte PERSO : crypto.
alter table public.personal_accounts
  drop constraint if exists personal_accounts_account_type_check;

alter table public.personal_accounts
  add constraint personal_accounts_account_type_check
  check (account_type in ('checking','savings','crypto'));
