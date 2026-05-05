-- Keep Orlando WhatsApp starter conversations easy to triage:
-- tag them by source, archive quiet starters after 15 minutes, and keep
-- birthday sends on the approved text-only template.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

with ws as (
  select id
    from public.workspaces
   where slug = 'orlando'
   limit 1
)
insert into public.workspace_tags (workspace_id, name, color)
select ws.id, tag.name, tag.color
  from ws
 cross join (
   values
     ('Visitantes', '#60A5FA'),
     ('Consolidação', '#FBBF24'),
     ('Aniversário', '#F472B6')
 ) as tag(name, color)
on conflict (workspace_id, name)
do update set color = excluded.color;

with ws as (
  select id
    from public.workspaces
   where slug = 'orlando'
   limit 1
)
update public.leads l
   set tags = (
     select array(
       select distinct tag
         from unnest(coalesce(l.tags, '{}'::text[]) || array['Visitantes']::text[]) as tag
        where tag <> ''
     )
   )
  from ws
 where l.workspace_id = ws.id
   and l.source = 'visitante-form';

with ws as (
  select id
    from public.workspaces
   where slug = 'orlando'
   limit 1
)
update public.leads l
   set tags = (
     select array(
       select distinct tag
         from unnest(coalesce(l.tags, '{}'::text[]) || array['Consolidação']::text[]) as tag
        where tag <> ''
     )
   )
  from ws
 where l.workspace_id = ws.id
   and l.source = 'consolida-form';

with ws as (
  select id
    from public.workspaces
   where slug = 'orlando'
   limit 1
)
update public.leads l
   set tags = (
     select array(
       select distinct tag
         from unnest(array_remove(coalesce(l.tags, '{}'::text[]), 'Aniversariante') || array['Aniversário']::text[]) as tag
        where tag <> ''
     )
   )
  from ws
 where l.workspace_id = ws.id
   and (
     l.source = 'aniversariantes'
     or l.type = 'birthday'
     or coalesce(l.tags, '{}'::text[]) && array['Aniversariante', 'Aniversário']::text[]
   );

do $$
begin
  if exists (select 1 from cron.job where jobname = 'orlando-happy-birthday-9am-ny') then
    perform cron.unschedule('orlando-happy-birthday-9am-ny');
  end if;
  if exists (select 1 from cron.job where jobname = 'trigger-birthdays-daily') then
    perform cron.unschedule('trigger-birthdays-daily');
  end if;
  if exists (select 1 from cron.job where jobname = 'orlando-archive-quiet-automation-15m') then
    perform cron.unschedule('orlando-archive-quiet-automation-15m');
  end if;
end;
$$;

select cron.schedule(
  'orlando-happy-birthday-9am-ny',
  '0 13,14 * * *',
  $$
  select net.http_post(
    url := 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1/trigger-birthdays',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1), ''),
      'apikey', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1), ''),
      'x-zelo-internal-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'zelo_internal_secret' limit 1), '')
    ),
    body := jsonb_build_object(
      'workspace_slug', 'orlando',
      'timezone', 'America/New_York',
      'expected_hour', 9,
      'template_name', 'happy_birthday_text',
      'template_language', 'en'
    ),
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'orlando-archive-quiet-automation-15m',
  '*/5 * * * *',
  $$
  with latest_auto as (
    select distinct on (m.lead_id)
           m.lead_id,
           m.workspace_id,
           m.created_at,
           regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') as phone_digits
      from public.messages m
      join public.leads l
        on l.id = m.lead_id
       and l.workspace_id = m.workspace_id
     where m.workspace_id = '9c4e23cf-26e3-4632-addb-f28325aedac3'
       and m.direction = 'outbound'
       and m.automated is true
       and m.type in ('template', 'text')
       and m.created_at <= now() - interval '15 minutes'
       and (
         l.source in ('visitante-form', 'consolida-form', 'aniversariantes')
         or coalesce(l.tags, '{}'::text[]) && array['Visitantes', 'Consolidação', 'Aniversário']::text[]
       )
     order by m.lead_id, m.created_at desc
  ),
  eligible as (
    select la.*
      from latest_auto la
     where not exists (
       select 1
         from public.messages i
         join public.leads li
           on li.id = i.lead_id
          and li.workspace_id = i.workspace_id
        where i.workspace_id = la.workspace_id
          and i.direction = 'inbound'
          and i.created_at > la.created_at
          and (
            li.id = la.lead_id
            or (
              length(la.phone_digits) >= 7
              and regexp_replace(coalesce(li.phone, ''), '\D', '', 'g') like '%' || right(la.phone_digits, 10)
            )
          )
     )
  ),
  target_leads as (
    select distinct l.id
      from public.leads l
      join eligible e
        on e.workspace_id = l.workspace_id
     where l.id = e.lead_id
        or (
          length(e.phone_digits) >= 7
          and regexp_replace(coalesce(l.phone, ''), '\D', '', 'g') like '%' || right(e.phone_digits, 10)
        )
  )
  update public.leads l
     set inbox_status = 'archived'
    from target_leads t
   where l.id = t.id
     and coalesce(l.inbox_status, 'neutral') <> 'archived';
  $$
);
