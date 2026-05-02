-- Chat ao Vivo: durable pins plus optional visitor profile fields.

alter table if exists public.leads
  add column if not exists chat_pinned boolean not null default false,
  add column if not exists chat_pinned_at timestamp with time zone,
  add column if not exists profile_photo_url text,
  add column if not exists bio text;

create index if not exists leads_workspace_chat_pinned_idx
  on public.leads (workspace_id, chat_pinned desc, chat_pinned_at desc, last_message_at desc);
