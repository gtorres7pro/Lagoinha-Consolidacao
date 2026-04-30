-- CRIE / CRIE Mulheres audit patch
-- Adds event payment flags, visitor/member profile fields, finance indexes,
-- and the profile-photo bucket used by the CRIE app.

alter table if exists public.crie_events
  add column if not exists members_pay boolean not null default false;

alter table if exists public.cm_events
  add column if not exists members_pay boolean not null default false;

alter table if exists public.crie_app_users
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null,
  add column if not exists gender text,
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists auth_user_id uuid,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists temp_password_sent_at timestamptz;

alter table if exists public.crie_members
  add column if not exists avatar_url text,
  add column if not exists gender text;

alter table if exists public.cm_members
  add column if not exists avatar_url text,
  add column if not exists gender text;

create index if not exists idx_crie_member_bills_workspace_status
  on public.crie_member_bills (workspace_id, status);

create index if not exists idx_cm_member_bills_workspace_status
  on public.cm_member_bills (workspace_id, status);

create index if not exists idx_crie_app_users_workspace_id
  on public.crie_app_users (workspace_id);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crie_app_users'
      and policyname = 'crie_app_users_anon_insert_unlinked'
  ) then
    create policy crie_app_users_anon_insert_unlinked
      on public.crie_app_users for insert to anon
      with check (auth_user_id is null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'crie_app_users'
      and policyname = 'crie_app_users_anon_update_unlinked'
  ) then
    create policy crie_app_users_anon_update_unlinked
      on public.crie_app_users for update to anon
      using (auth_user_id is null)
      with check (auth_user_id is null);
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crie-profile-photos',
  'crie-profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'crie_profile_photos_public_read'
  ) then
    create policy crie_profile_photos_public_read
      on storage.objects for select
      using (bucket_id = 'crie-profile-photos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'crie_profile_photos_user_insert'
  ) then
    create policy crie_profile_photos_user_insert
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'crie-profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'crie_profile_photos_user_update'
  ) then
    create policy crie_profile_photos_user_update
      on storage.objects for update to authenticated
      using (
        bucket_id = 'crie-profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'crie-profile-photos'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
