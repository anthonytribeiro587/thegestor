-- thegestor | automacoes configuraveis de mensagens
-- Cria uma area propria de automacoes e permite multiplas regras por gatilho.

begin;

alter table public.configuracoes_empresa
  add column if not exists whatsapp_limite_diario integer not null default 30,
  add column if not exists whatsapp_mensagem_antes text not null default 'Olá, {nome}. Passando para lembrar que sua mensalidade vence em {vencimento}.{pagamento}',
  add column if not exists whatsapp_mensagem_vencimento text not null default 'Olá, {nome}. Sua mensalidade vence hoje ({vencimento}).{pagamento}',
  add column if not exists whatsapp_mensagem_atraso text not null default 'Olá, {nome}. Identificamos que sua mensalidade com vencimento em {vencimento} ainda está pendente.{pagamento} Se você já realizou o pagamento, desconsidere esta mensagem.';

alter table public.configuracoes_empresa
  drop constraint if exists configuracoes_empresa_whatsapp_limite_diario_chk,
  add constraint configuracoes_empresa_whatsapp_limite_diario_chk
    check (whatsapp_limite_diario between 1 and 100);

create table if not exists public.automacoes_mensagem (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  canal text not null default 'whatsapp',
  gatilho text not null,
  dias_deslocamento integer not null default 0,
  mensagem text not null,
  incluir_pagamento boolean not null default true,
  ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint automacoes_mensagem_nome_chk check (char_length(trim(nome)) between 2 and 80),
  constraint automacoes_mensagem_canal_chk check (canal in ('whatsapp')),
  constraint automacoes_mensagem_gatilho_chk check (gatilho in ('antes_vencimento','vencimento','atraso')),
  constraint automacoes_mensagem_dias_chk check (dias_deslocamento between 0 and 30),
  constraint automacoes_mensagem_vencimento_dias_chk check (gatilho <> 'vencimento' or dias_deslocamento = 0),
  constraint automacoes_mensagem_texto_chk check (char_length(trim(mensagem)) between 1 and 1500)
);

create index if not exists automacoes_mensagem_empresa_ativo_idx
  on public.automacoes_mensagem (empresa_id, ativo);

create index if not exists automacoes_mensagem_empresa_gatilho_idx
  on public.automacoes_mensagem (empresa_id, gatilho, dias_deslocamento);

alter table public.automacoes_mensagem enable row level security;

revoke all on table public.automacoes_mensagem from public, anon;
grant select, insert, update, delete on table public.automacoes_mensagem to authenticated;
grant select, insert, update, delete on table public.automacoes_mensagem to service_role;

drop policy if exists automacoes_mensagem_admin_select on public.automacoes_mensagem;
create policy automacoes_mensagem_admin_select
  on public.automacoes_mensagem
  for select
  to authenticated
  using ((select private.e_admin(empresa_id)));

drop policy if exists automacoes_mensagem_admin_insert on public.automacoes_mensagem;
create policy automacoes_mensagem_admin_insert
  on public.automacoes_mensagem
  for insert
  to authenticated
  with check ((select private.e_admin(empresa_id)));

drop policy if exists automacoes_mensagem_admin_update on public.automacoes_mensagem;
create policy automacoes_mensagem_admin_update
  on public.automacoes_mensagem
  for update
  to authenticated
  using ((select private.e_admin(empresa_id)))
  with check ((select private.e_admin(empresa_id)));

drop policy if exists automacoes_mensagem_admin_delete on public.automacoes_mensagem;
create policy automacoes_mensagem_admin_delete
  on public.automacoes_mensagem
  for delete
  to authenticated
  using ((select private.e_admin(empresa_id)));

alter table public.mensagens_cobranca
  add column if not exists automacao_id uuid null references public.automacoes_mensagem(id) on delete set null;

drop index if exists public.mensagens_cobranca_unica_idx;

create unique index if not exists mensagens_cobranca_automacao_unica_idx
  on public.mensagens_cobranca (cobranca_id, automacao_id)
  where automacao_id is not null;

drop index if exists public.mensagens_cobranca_legado_unica_idx;

create index if not exists mensagens_cobranca_automacao_idx
  on public.mensagens_cobranca (automacao_id);

insert into public.automacoes_mensagem (
  empresa_id, nome, canal, gatilho, dias_deslocamento, mensagem, incluir_pagamento, ativo
)
select
  ce.empresa_id,
  'Lembrete antes do vencimento',
  'whatsapp',
  'antes_vencimento',
  ce.lembrete_antes_dias,
  ce.whatsapp_mensagem_antes,
  true,
  false
from public.configuracoes_empresa ce
where not exists (
  select 1
  from public.automacoes_mensagem a
  where a.empresa_id = ce.empresa_id
    and a.gatilho = 'antes_vencimento'
);

insert into public.automacoes_mensagem (
  empresa_id, nome, canal, gatilho, dias_deslocamento, mensagem, incluir_pagamento, ativo
)
select
  ce.empresa_id,
  'Mensagem no vencimento',
  'whatsapp',
  'vencimento',
  0,
  ce.whatsapp_mensagem_vencimento,
  true,
  false
from public.configuracoes_empresa ce
where not exists (
  select 1
  from public.automacoes_mensagem a
  where a.empresa_id = ce.empresa_id
    and a.gatilho = 'vencimento'
);

insert into public.automacoes_mensagem (
  empresa_id, nome, canal, gatilho, dias_deslocamento, mensagem, incluir_pagamento, ativo
)
select
  ce.empresa_id,
  'Lembrete após o vencimento',
  'whatsapp',
  'atraso',
  ce.lembrete_atraso_dias,
  ce.whatsapp_mensagem_atraso,
  true,
  false
from public.configuracoes_empresa ce
where not exists (
  select 1
  from public.automacoes_mensagem a
  where a.empresa_id = ce.empresa_id
    and a.gatilho = 'atraso'
);

notify pgrst, 'reload schema';

commit;
