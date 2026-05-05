drop policy if exists cafe_pastor_appointments_admin_hierarchy on public.cafe_pastor_appointments;
create policy cafe_pastor_appointments_admin_hierarchy
on public.cafe_pastor_appointments
for all
to public
using (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_appointments.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_appointments.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
);

drop policy if exists cafe_pastor_config_admin_hierarchy on public.cafe_pastor_config;
create policy cafe_pastor_config_admin_hierarchy
on public.cafe_pastor_config
for all
to public
using (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_config.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_config.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
);

drop policy if exists cafe_pastor_pastors_admin_hierarchy on public.cafe_pastor_pastors;
create policy cafe_pastor_pastors_admin_hierarchy
on public.cafe_pastor_pastors
for all
to public
using (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_pastors.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_pastors.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
);

drop policy if exists cafe_pastor_availability_admin_hierarchy on public.cafe_pastor_availability;
create policy cafe_pastor_availability_admin_hierarchy
on public.cafe_pastor_availability
for all
to public
using (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_availability.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_availability.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
);

drop policy if exists cafe_pastor_blocked_slots_admin_hierarchy on public.cafe_pastor_blocked_slots;
create policy cafe_pastor_blocked_slots_admin_hierarchy
on public.cafe_pastor_blocked_slots
for all
to public
using (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_blocked_slots.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.users u
    join public.workspaces uw on uw.id = u.workspace_id
    join public.workspaces tw on tw.id = cafe_pastor_blocked_slots.workspace_id
    where u.id = (select auth.uid())
      and coalesce(u.status::text, 'ativo') not in ('inactive', 'inativo')
      and u.role = any (array['master_admin', 'pastor_senior', 'church_admin', 'admin'])
      and (
        u.role = 'master_admin'
        or u.workspace_id = tw.id
        or (uw.level = 'global' and uw.global_id is not null and uw.global_id = tw.global_id)
        or (uw.level = 'regional' and uw.regional_id is not null and uw.regional_id = tw.regional_id)
      )
  )
);
