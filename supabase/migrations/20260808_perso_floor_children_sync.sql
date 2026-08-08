-- PERSO : intégration ENFANTS dans les projections et traçabilité des mouvements générés.
alter table public.personal_settings
  add column if not exists children_sync_enabled boolean not null default false,
  add column if not exists children_sync_account_id uuid references public.personal_accounts(id) on delete set null,
  add column if not exists children_sync_day integer not null default 5 check (children_sync_day between 1 and 28),
  add column if not exists children_sync_person text not null default 'person_2' check (children_sync_person in ('person_1','person_2'));

alter table public.personal_movements
  add column if not exists source_type text,
  add column if not exists source_key text;

create unique index if not exists personal_movements_source_uidx
  on public.personal_movements(owner_id, source_type, source_key)
  where source_type is not null and source_key is not null;

comment on column public.personal_movements.source_type is
  'Origine technique éventuelle du mouvement, par exemple children.';
comment on column public.personal_movements.source_key is
  'Clé stable de l''occurrence générée afin d''éviter les doublons et de figer les mouvements pointés.';
