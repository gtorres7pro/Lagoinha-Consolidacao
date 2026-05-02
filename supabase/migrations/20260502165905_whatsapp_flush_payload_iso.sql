-- Avoid raw Postgres timestamp offsets in pg_net payloads.
-- whatsapp-flush no longer depends on message_created_at for idempotency, but
-- keep a simple UTC Z value for diagnostics.

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
    'message_created_at', to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
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
