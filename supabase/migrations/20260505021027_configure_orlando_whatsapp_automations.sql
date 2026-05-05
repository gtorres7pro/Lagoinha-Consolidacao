-- Configure Orlando WhatsApp automations for approved Meta templates.
-- The birthday cron runs at 13:00 and 14:00 UTC, and the Edge Function gates
-- delivery to 9am America/New_York so DST changes do not shift the send time.

update public.workspaces
   set automation_config = jsonb_build_object(
     'enabled', true,
     'delay_minutes', 0,
     'default_template', 'welcome_consolidacao',
     'default_language', 'en',
     'rules', jsonb_build_array(
       jsonb_build_object(
         'source', 'consolida-form',
         'channel', 'meta',
         'enabled', true,
         'template', 'welcome_consolidacao',
         'language', 'en',
         'delay_minutes', 0,
         'variables', '{"1":"{{lead.first_name}}"}'::jsonb
       ),
       jsonb_build_object(
         'source', 'visitante-form',
         'channel', 'meta',
         'enabled', true,
         'template', 'welcome_visitante',
         'language', 'pt_BR',
         'delay_minutes', 0,
         'variables', '{"1":"{{lead.first_name}}"}'::jsonb
       ),
       jsonb_build_object(
         'source', 'whatsapp-inbound',
         'template', null
       )
     )
   )
 where slug = 'orlando';

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'orlando-happy-birthday-9am-ny') then
    perform cron.unschedule('orlando-happy-birthday-9am-ny');
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
      'template_name', 'happy_birthday',
      'template_language', 'en'
    )
  );
  $$
);
