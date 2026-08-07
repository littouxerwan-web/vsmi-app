begin;

-- Les tables PERSONNEL historiques ont déjà owner_id + RLS. Cette migration
-- verrouille également personal_savings_proposals si elle existe dans la base.
do $$
begin
  if to_regclass('public.personal_savings_proposals') is not null then
    execute 'alter table public.personal_savings_proposals enable row level security';
    execute 'drop policy if exists personal_savings_proposals_owner_all on public.personal_savings_proposals';
    execute 'create policy personal_savings_proposals_owner_all on public.personal_savings_proposals for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)';
    execute 'create index if not exists personal_savings_proposals_owner_idx on public.personal_savings_proposals(owner_id)';
  end if;
end $$;

commit;
