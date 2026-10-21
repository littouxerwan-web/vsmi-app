-- Preserve the current CAF deduction unless explicitly disabled.
alter table public.common_settings
  add column if not exists include_caf_in_budget boolean not null default true;
