-- CRIE / CRIE Mulheres audit patch
-- Apply this before deploying the matching frontend changes.

alter table if exists public.crie_events
  add column if not exists members_pay boolean not null default false;

alter table if exists public.cm_events
  add column if not exists members_pay boolean not null default false;

alter table if exists public.crie_app_users
  add column if not exists gender text;

create index if not exists idx_crie_member_bills_workspace_status
  on public.crie_member_bills (workspace_id, status);

create index if not exists idx_cm_member_bills_workspace_status
  on public.cm_member_bills (workspace_id, status);
