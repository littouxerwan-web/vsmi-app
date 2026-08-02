begin;

alter table public.weddings
  add column if not exists archived_at timestamptz,
  add column if not exists quote_path text;

insert into storage.buckets (id, name, public)
values ('wedding-documents', 'wedding-documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Wedding documents read own" on storage.objects;
create policy "Wedding documents read own"
on storage.objects for select to authenticated
using (
  bucket_id = 'wedding-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Wedding documents insert own" on storage.objects;
create policy "Wedding documents insert own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'wedding-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Wedding documents update own" on storage.objects;
create policy "Wedding documents update own"
on storage.objects for update to authenticated
using (
  bucket_id = 'wedding-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'wedding-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Wedding documents delete own" on storage.objects;
create policy "Wedding documents delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'wedding-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
