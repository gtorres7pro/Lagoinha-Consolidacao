-- Keep inbound WhatsApp message automation authenticated after hardening
-- whatsapp-flush checks `x-zelo-internal-secret`, not the old `x-flush-secret`.
-- Requires Vault secrets named `zelo_internal_secret` and `supabase_anon_key`.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create or replace function private.trigger_flush_conversation()
returns trigger
language plpgsql
security definer
set search_path to private, extensions, vault, public, pg_temp
as $$
declare
  internal_secret text;
  anon_key text;
  request_id bigint;
  payload jsonb;
begin
  if new.direction <> 'inbound' then
    return new;
  end if;

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

  payload := jsonb_build_object(
    'lead_id', new.lead_id::text,
    'message_created_at', new.created_at::text
  );

  select net.http_post(
    url := 'https://uyseheucqikgcorrygzc.supabase.co/functions/v1/whatsapp-flush',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(anon_key, ''),
      'apikey', coalesce(anon_key, ''),
      'x-zelo-internal-secret', coalesce(internal_secret, '')
    ),
    body := payload,
    timeout_milliseconds := 45000
  ) into request_id;

  insert into public.trigger_debug_log(event, lead_id, message_id, net_request_id, payload)
  values ('pg_net_dispatched', new.lead_id::text, new.id::text, request_id, payload::text);

  return new;
exception when others then
  begin
    insert into public.trigger_debug_log(event, lead_id, message_id, payload)
    values ('pg_net_error: ' || sqlerrm, new.lead_id::text, new.id::text, coalesce(payload::text, ''));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists on_inbound_message_insert on public.messages;
drop function if exists public.trigger_flush_conversation();

create trigger on_inbound_message_insert
after insert on public.messages
for each row
when (new.direction = 'inbound')
execute function private.trigger_flush_conversation();
