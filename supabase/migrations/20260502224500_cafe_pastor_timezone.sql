alter table if exists public.cafe_pastor_config
  add column if not exists timezone text not null default 'America/Sao_Paulo';

update public.cafe_pastor_config c
set timezone = 'America/Porto_Velho',
    updated_at = now()
from public.workspaces w
where c.workspace_id = w.id
  and w.slug = 'porto-velho'
  and c.timezone = 'America/Sao_Paulo';
