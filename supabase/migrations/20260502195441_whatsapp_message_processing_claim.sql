-- Track in-flight WhatsApp IA processing so parallel flush calls do not reply
-- to the same inbound messages.

alter table if exists public.messages
  add column if not exists bot_processing_at timestamp with time zone;

create index if not exists messages_bot_processing_pending_idx
  on public.messages (workspace_id, lead_id, bot_processing_at)
  where direction = 'inbound' and responded_at is null;
