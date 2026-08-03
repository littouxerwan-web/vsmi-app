begin;

-- Garantit qu’une seule ligne de réglages existe par utilisateur.
create unique index if not exists personal_settings_owner_id_uidx
  on public.personal_settings(owner_id);

-- Réinstalle une politique explicite pour les lectures et écritures personnelles.
alter table public.personal_settings enable row level security;
drop policy if exists personal_settings_owner_all on public.personal_settings;
create policy personal_settings_owner_all on public.personal_settings
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

commit;
