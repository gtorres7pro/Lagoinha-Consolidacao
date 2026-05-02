-- Persistent lead workflow task flags used by Jornada cards and KPIs.

alter table if exists public.leads
  add column if not exists task_start boolean not null default false,
  add column if not exists task_gc boolean not null default false,
  add column if not exists task_batismo boolean not null default false,
  add column if not exists task_cafe boolean not null default false,
  add column if not exists task_followup boolean not null default false;

