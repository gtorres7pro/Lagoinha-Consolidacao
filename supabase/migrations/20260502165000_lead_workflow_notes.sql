-- Lead workflow collaboration for Visitantes / Consolidação cards.
-- Adds durable task completion metadata, task activity, and threaded notes.

alter table if exists public.leads
  add column if not exists task_meta jsonb not null default '{}'::jsonb;

create table if not exists public.lead_task_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  task_key text not null,
  action text not null check (action in ('completed', 'reopened')),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_task_activity_lead_created
  on public.lead_task_activity (lead_id, created_at desc);

create index if not exists idx_lead_task_activity_workspace_created
  on public.lead_task_activity (workspace_id, created_at desc);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  parent_id uuid references public.lead_notes(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  body text not null check (length(trim(body)) > 0),
  liked_by uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lead_notes_lead_created
  on public.lead_notes (lead_id, created_at);

create index if not exists idx_lead_notes_parent
  on public.lead_notes (parent_id);

create index if not exists idx_lead_notes_workspace_created
  on public.lead_notes (workspace_id, created_at desc);

alter table public.lead_task_activity enable row level security;
alter table public.lead_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_task_activity'
      and policyname = 'lead_task_activity_workspace_select'
  ) then
    create policy lead_task_activity_workspace_select
      on public.lead_task_activity for select to authenticated
      using (
        exists (
          select 1
          from public.users u
          where u.id = (select auth.uid())
            and (u.workspace_id = lead_task_activity.workspace_id or u.role = 'master_admin')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_task_activity'
      and policyname = 'lead_task_activity_workspace_insert'
  ) then
    create policy lead_task_activity_workspace_insert
      on public.lead_task_activity for insert to authenticated
      with check (
        exists (
          select 1
          from public.users u
          where u.id = (select auth.uid())
            and (u.workspace_id = lead_task_activity.workspace_id or u.role = 'master_admin')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_notes'
      and policyname = 'lead_notes_workspace_select'
  ) then
    create policy lead_notes_workspace_select
      on public.lead_notes for select to authenticated
      using (
        exists (
          select 1
          from public.users u
          where u.id = (select auth.uid())
            and (u.workspace_id = lead_notes.workspace_id or u.role = 'master_admin')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_notes'
      and policyname = 'lead_notes_workspace_insert'
  ) then
    create policy lead_notes_workspace_insert
      on public.lead_notes for insert to authenticated
      with check (
        exists (
          select 1
          from public.users u
          where u.id = (select auth.uid())
            and (u.workspace_id = lead_notes.workspace_id or u.role = 'master_admin')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_notes'
      and policyname = 'lead_notes_workspace_update'
  ) then
    create policy lead_notes_workspace_update
      on public.lead_notes for update to authenticated
      using (
        exists (
          select 1
          from public.users u
          where u.id = (select auth.uid())
            and (u.workspace_id = lead_notes.workspace_id or u.role = 'master_admin')
        )
      )
      with check (
        exists (
          select 1
          from public.users u
          where u.id = (select auth.uid())
            and (u.workspace_id = lead_notes.workspace_id or u.role = 'master_admin')
        )
      );
  end if;
end $$;
