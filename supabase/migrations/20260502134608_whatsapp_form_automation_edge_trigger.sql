-- Route new lead form submissions through the WhatsApp template Edge Function.
-- Requires Vault secrets named `zelo_internal_secret` and `supabase_anon_key`.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create or replace function private.notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path to private, extensions, vault, pg_temp
as $$
declare
  internal_secret text;
  anon_key text;
begin
  select decrypted_secret
    into internal_secret
    from vault.decrypted_secrets
   where name = 'zelo_internal_secret'
   limit 1;

  select decrypted_secret
    into anon_key
    from vault.decrypted_secrets
   where name = 'supabase_anon_key'
   limit 1;

  perform net.http_post(
    url := 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1/whatsapp-send-template',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(anon_key, ''),
      'apikey', coalesce(anon_key, ''),
      'x-zelo-internal-secret', coalesce(internal_secret, '')
    ),
    body := jsonb_build_object(
      'lead_id', new.id,
      'workspace_id', new.workspace_id
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists "new-lead-automation" on public.leads;
drop function if exists public.notify_new_lead();

create trigger "new-lead-automation"
after insert on public.leads
for each row
execute function private.notify_new_lead();
