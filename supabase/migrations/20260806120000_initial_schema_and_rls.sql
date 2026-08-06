-- thegestor | schema inicial + RBAC/RLS
-- Execute este arquivo uma unica vez no SQL Editor do Supabase.
-- Estrategia: multiempresa, valores financeiros separados do dominio operacional,
-- operador sem acesso a valores e onboarding seguro do primeiro admin.

begin;

create extension if not exists pgcrypto;

-- Funcoes auxiliares de seguranca ficam fora do schema exposto pela Data API.
create schema if not exists private;
revoke all on schema private from public;

-- ============================================================
-- 1. TABELAS DE DOMINIO
-- ============================================================

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) >= 2),
  slug text not null unique,
  status text not null default 'ativa' check (status in ('ativa', 'suspensa', 'cancelada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.usuarios_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_exibicao text,
  papel text not null default 'operador' check (papel in ('admin', 'operador')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, user_id)
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) >= 2),
  telefone text not null,
  email text,
  status text not null default 'ativo' check (status in ('pendente', 'ativo', 'cancelado')),
  origem text not null default 'manual',
  observacoes_operacionais text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Plano contem apenas informacoes operacionais. Preco fica em planos_precos.
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal', 'trimestral', 'semestral', 'anual', 'personalizada')),
  intervalo_dias integer check (intervalo_dias is null or intervalo_dias > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

-- Tabela financeira: somente admin.
create table public.planos_precos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  plano_id uuid not null references public.planos(id) on delete cascade,
  valor numeric(12,2) not null check (valor >= 0),
  moeda char(3) not null default 'BRL',
  vigente_desde date not null default current_date,
  vigente_ate date,
  criado_em timestamptz not null default now(),
  check (vigente_ate is null or vigente_ate >= vigente_desde)
);

create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  plano_id uuid not null references public.planos(id) on delete restrict,
  dia_vencimento smallint not null check (dia_vencimento between 1 and 31),
  status text not null default 'ativa' check (status in ('ativa', 'pausada', 'cancelada')),
  renovacao_automatica boolean not null default true,
  referencia_externa text,
  iniciada_em date not null default current_date,
  cancelada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Cobranca operacional nao possui nenhum valor monetario.
create table public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  assinatura_id uuid references public.assinaturas(id) on delete restrict,
  competencia date not null,
  vencimento date not null,
  status_pagamento text not null default 'pendente' check (status_pagamento in ('pendente', 'pago', 'atrasado', 'cancelado')),
  pago_em timestamptz,
  origem text not null default 'sistema',
  external_reference text unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, assinatura_id, competencia)
);

-- Dados monetarios da cobranca ficam completamente isolados da tabela operacional.
create table public.cobrancas_financeiras (
  cobranca_id uuid primary key references public.cobrancas(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  valor_original numeric(12,2) not null check (valor_original >= 0),
  desconto numeric(12,2) not null default 0 check (desconto >= 0),
  acrescimo numeric(12,2) not null default 0 check (acrescimo >= 0),
  valor_pago numeric(12,2) check (valor_pago is null or valor_pago >= 0),
  taxa_gateway numeric(12,2) check (taxa_gateway is null or taxa_gateway >= 0),
  moeda char(3) not null default 'BRL',
  atualizado_em timestamptz not null default now()
);

-- Registro tecnico do pagamento. Restrito a admin/backend.
create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cobranca_id uuid not null references public.cobrancas(id) on delete restrict,
  provedor text not null check (provedor in ('mercado_pago', 'manual', 'outro')),
  provider_payment_id text,
  status text not null default 'pendente',
  metodo text,
  pago_em timestamptz,
  payload_resumo jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provedor, provider_payment_id)
);

create table public.tarefas_operacionais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  tipo text not null check (tipo in ('renovar', 'novo_cliente', 'acompanhar')),
  status text not null default 'pendente' check (status in ('pendente', 'concluida', 'cancelada')),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta')),
  atribuida_a uuid references auth.users(id) on delete set null,
  concluida_por uuid references auth.users(id) on delete set null,
  concluida_em timestamptz,
  observacao_operador text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Uma cobranca paga gera no maximo uma tarefa automatica de ativacao/renovacao.
create unique index tarefas_operacionais_cobranca_unica_idx
  on public.tarefas_operacionais(cobranca_id)
  where cobranca_id is not null and tipo in ('renovar', 'novo_cliente');

-- Nunca guardar token em config_publica. secret_ref apontara para segredo de servidor/Vault.
create table public.integracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  provedor text not null check (provedor in ('mercado_pago', 'whatsapp_evolution', 'webhook')),
  nome text not null default 'principal',
  status text not null default 'desconectada' check (status in ('desconectada', 'conectando', 'conectada', 'erro')),
  config_publica jsonb not null default '{}'::jsonb,
  secret_ref text,
  ultimo_sync_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, provedor, nome)
);

create table public.mensagens_whatsapp (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  cobranca_id uuid references public.cobrancas(id) on delete set null,
  direcao text not null check (direcao in ('entrada', 'saida')),
  status text not null default 'pendente',
  template text,
  corpo text,
  provider_message_id text,
  enviado_em timestamptz,
  criado_em timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated by default as identity primary key,
  empresa_id uuid references public.empresas(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

-- ============================================================
-- 2. INDICES
-- ============================================================

create index usuarios_empresa_user_idx on public.usuarios_empresa(user_id) where ativo = true;
create index usuarios_empresa_empresa_idx on public.usuarios_empresa(empresa_id, papel) where ativo = true;
create index clientes_empresa_status_idx on public.clientes(empresa_id, status);
create index clientes_empresa_nome_idx on public.clientes(empresa_id, nome);
create index planos_empresa_ativo_idx on public.planos(empresa_id, ativo);
create index planos_precos_plano_vigencia_idx on public.planos_precos(plano_id, vigente_desde desc);
create index assinaturas_empresa_status_idx on public.assinaturas(empresa_id, status);
create index assinaturas_cliente_idx on public.assinaturas(cliente_id);
create index cobrancas_empresa_vencimento_idx on public.cobrancas(empresa_id, vencimento);
create index cobrancas_empresa_status_idx on public.cobrancas(empresa_id, status_pagamento);
create index cobrancas_cliente_idx on public.cobrancas(cliente_id);
create index pagamentos_empresa_cobranca_idx on public.pagamentos(empresa_id, cobranca_id);
create index tarefas_empresa_status_idx on public.tarefas_operacionais(empresa_id, status, prioridade);
create index tarefas_atribuida_idx on public.tarefas_operacionais(atribuida_a) where status = 'pendente';
create index mensagens_empresa_cliente_idx on public.mensagens_whatsapp(empresa_id, cliente_id, criado_em desc);
create index audit_empresa_data_idx on public.audit_logs(empresa_id, criado_em desc);

-- ============================================================
-- 3. UPDATED_AT
-- ============================================================

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger empresas_set_updated_at before update on public.empresas
for each row execute function private.set_updated_at();
create trigger usuarios_empresa_set_updated_at before update on public.usuarios_empresa
for each row execute function private.set_updated_at();
create trigger clientes_set_updated_at before update on public.clientes
for each row execute function private.set_updated_at();
create trigger planos_set_updated_at before update on public.planos
for each row execute function private.set_updated_at();
create trigger assinaturas_set_updated_at before update on public.assinaturas
for each row execute function private.set_updated_at();
create trigger cobrancas_set_updated_at before update on public.cobrancas
for each row execute function private.set_updated_at();
create trigger cobrancas_financeiras_set_updated_at before update on public.cobrancas_financeiras
for each row execute function private.set_updated_at();
create trigger pagamentos_set_updated_at before update on public.pagamentos
for each row execute function private.set_updated_at();
create trigger tarefas_operacionais_set_updated_at before update on public.tarefas_operacionais
for each row execute function private.set_updated_at();
create trigger integracoes_set_updated_at before update on public.integracoes
for each row execute function private.set_updated_at();

-- ============================================================
-- 4. FUNCOES DE AUTORIZACAO
-- ============================================================

create or replace function private.tem_acesso_empresa(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios_empresa ue
    where ue.empresa_id = p_empresa_id
      and ue.user_id = (select auth.uid())
      and ue.ativo = true
  );
$$;

create or replace function private.e_admin(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios_empresa ue
    where ue.empresa_id = p_empresa_id
      and ue.user_id = (select auth.uid())
      and ue.papel = 'admin'
      and ue.ativo = true
  );
$$;

revoke all on function private.tem_acesso_empresa(uuid) from public;
revoke all on function private.e_admin(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.tem_acesso_empresa(uuid) to authenticated;
grant execute on function private.e_admin(uuid) to authenticated;

-- Onboarding: usuario autenticado cria a propria empresa e vira admin.
create or replace function public.criar_empresa(
  p_nome text,
  p_slug text default null,
  p_nome_exibicao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_empresa_id uuid := gen_random_uuid();
  v_slug text;
begin
  if v_user_id is null then
    raise exception 'Autenticacao obrigatoria' using errcode = '42501';
  end if;

  if p_nome is null or char_length(trim(p_nome)) < 2 then
    raise exception 'Nome da empresa invalido';
  end if;

  v_slug := lower(regexp_replace(trim(coalesce(p_slug, '')), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);

  if v_slug = '' then
    v_slug := 'empresa-' || substr(v_empresa_id::text, 1, 8);
  end if;

  if exists (select 1 from public.empresas e where e.slug = v_slug) then
    v_slug := v_slug || '-' || substr(v_empresa_id::text, 1, 6);
  end if;

  insert into public.empresas (id, nome, slug)
  values (v_empresa_id, trim(p_nome), v_slug);

  insert into public.usuarios_empresa (empresa_id, user_id, nome_exibicao, papel, ativo)
  values (v_empresa_id, v_user_id, nullif(trim(coalesce(p_nome_exibicao, '')), ''), 'admin', true);

  return v_empresa_id;
end;
$$;

revoke all on function public.criar_empresa(text, text, text) from public, anon;
grant execute on function public.criar_empresa(text, text, text) to authenticated;

-- ============================================================
-- 5. AUTOMACAO DA FILA OPERACIONAL
-- ============================================================

create or replace function private.criar_tarefa_ao_confirmar_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status_cliente text;
  v_tipo text;
begin
  if new.status_pagamento = 'pago'
     and old.status_pagamento is distinct from 'pago' then

    select c.status into v_status_cliente
    from public.clientes c
    where c.id = new.cliente_id
      and c.empresa_id = new.empresa_id;

    v_tipo := case when v_status_cliente = 'pendente' then 'novo_cliente' else 'renovar' end;

    insert into public.tarefas_operacionais (
      empresa_id, cliente_id, cobranca_id, tipo, status, prioridade
    )
    values (
      new.empresa_id, new.cliente_id, new.id, v_tipo, 'pendente', 'normal'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger cobrancas_criar_tarefa_apos_pagamento
after update of status_pagamento on public.cobrancas
for each row execute function private.criar_tarefa_ao_confirmar_pagamento();

-- Operador pode concluir tarefa, mas nao alterar cliente/cobranca/tipo/atribuicao.
create or replace function private.proteger_edicao_tarefa_operador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.e_admin(old.empresa_id) then
    return new;
  end if;

  if not private.tem_acesso_empresa(old.empresa_id) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;

  if new.empresa_id is distinct from old.empresa_id
     or new.cliente_id is distinct from old.cliente_id
     or new.cobranca_id is distinct from old.cobranca_id
     or new.tipo is distinct from old.tipo
     or new.prioridade is distinct from old.prioridade
     or new.atribuida_a is distinct from old.atribuida_a
     or new.criado_em is distinct from old.criado_em
     or new.concluida_por is distinct from old.concluida_por
     or new.concluida_em is distinct from old.concluida_em then
    raise exception 'Operador nao pode alterar campos administrativos da tarefa' using errcode = '42501';
  end if;

  if new.status = 'cancelada' then
    raise exception 'Somente admin pode cancelar tarefa' using errcode = '42501';
  end if;

  if old.status = 'concluida' and new.status is distinct from 'concluida' then
    raise exception 'Operador nao pode reabrir tarefa concluida' using errcode = '42501';
  end if;

  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    new.concluida_por := auth.uid();
    new.concluida_em := now();
  end if;

  return new;
end;
$$;

create trigger tarefas_operacionais_guard_operator
before update on public.tarefas_operacionais
for each row execute function private.proteger_edicao_tarefa_operador();

-- ============================================================
-- 6. RLS: NEGAR POR PADRAO, LIBERAR SOMENTE O NECESSARIO
-- ============================================================

alter table public.empresas enable row level security;
alter table public.usuarios_empresa enable row level security;
alter table public.clientes enable row level security;
alter table public.planos enable row level security;
alter table public.planos_precos enable row level security;
alter table public.assinaturas enable row level security;
alter table public.cobrancas enable row level security;
alter table public.cobrancas_financeiras enable row level security;
alter table public.pagamentos enable row level security;
alter table public.tarefas_operacionais enable row level security;
alter table public.integracoes enable row level security;
alter table public.mensagens_whatsapp enable row level security;
alter table public.audit_logs enable row level security;

-- Remove grants automaticos da Data API; depois liberamos explicitamente.
revoke all on table public.empresas from anon, authenticated;
revoke all on table public.usuarios_empresa from anon, authenticated;
revoke all on table public.clientes from anon, authenticated;
revoke all on table public.planos from anon, authenticated;
revoke all on table public.planos_precos from anon, authenticated;
revoke all on table public.assinaturas from anon, authenticated;
revoke all on table public.cobrancas from anon, authenticated;
revoke all on table public.cobrancas_financeiras from anon, authenticated;
revoke all on table public.pagamentos from anon, authenticated;
revoke all on table public.tarefas_operacionais from anon, authenticated;
revoke all on table public.integracoes from anon, authenticated;
revoke all on table public.mensagens_whatsapp from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

-- Empresa
create policy empresas_select_membro on public.empresas
for select to authenticated
using ((select private.tem_acesso_empresa(id)));

create policy empresas_update_admin on public.empresas
for update to authenticated
using ((select private.e_admin(id)))
with check ((select private.e_admin(id)));

-- Usuarios da empresa: operador ve apenas o proprio vinculo; admin ve a equipe.
create policy usuarios_empresa_select on public.usuarios_empresa
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.e_admin(empresa_id))
);

create policy usuarios_empresa_insert_admin on public.usuarios_empresa
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy usuarios_empresa_update_admin on public.usuarios_empresa
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

-- Clientes: membro le, somente admin grava.
create policy clientes_select_membro on public.clientes
for select to authenticated
using ((select private.tem_acesso_empresa(empresa_id)));

create policy clientes_insert_admin on public.clientes
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy clientes_update_admin on public.clientes
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

-- Planos operacionais: membro le. Precos: admin apenas.
create policy planos_select_membro on public.planos
for select to authenticated
using ((select private.tem_acesso_empresa(empresa_id)));

create policy planos_insert_admin on public.planos
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy planos_update_admin on public.planos
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

create policy planos_precos_select_admin on public.planos_precos
for select to authenticated
using ((select private.e_admin(empresa_id)));

create policy planos_precos_insert_admin on public.planos_precos
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy planos_precos_update_admin on public.planos_precos
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

-- Assinaturas e cobrancas operacionais: membro le, admin grava.
create policy assinaturas_select_membro on public.assinaturas
for select to authenticated
using ((select private.tem_acesso_empresa(empresa_id)));

create policy assinaturas_insert_admin on public.assinaturas
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy assinaturas_update_admin on public.assinaturas
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

create policy cobrancas_select_membro on public.cobrancas
for select to authenticated
using ((select private.tem_acesso_empresa(empresa_id)));

create policy cobrancas_insert_admin on public.cobrancas
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy cobrancas_update_admin on public.cobrancas
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

-- Financeiro: operador recebe zero linhas, mesmo chamando a API diretamente.
create policy cobrancas_financeiras_admin on public.cobrancas_financeiras
for all to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

create policy pagamentos_admin on public.pagamentos
for all to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

-- Fila operacional: membros leem; admin edita tudo; operador so conclui suas tarefas
-- (campos protegidos tambem sao validados por trigger).
create policy tarefas_select_membro on public.tarefas_operacionais
for select to authenticated
using ((select private.tem_acesso_empresa(empresa_id)));

create policy tarefas_insert_admin on public.tarefas_operacionais
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy tarefas_update_admin on public.tarefas_operacionais
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

create policy tarefas_update_operador on public.tarefas_operacionais
for update to authenticated
using (
  (select private.tem_acesso_empresa(empresa_id))
  and not (select private.e_admin(empresa_id))
  and (atribuida_a is null or atribuida_a = (select auth.uid()))
)
with check (
  (select private.tem_acesso_empresa(empresa_id))
  and not (select private.e_admin(empresa_id))
  and (atribuida_a is null or atribuida_a = (select auth.uid()))
);

-- Integracoes, mensagens e auditoria ficam administrativas nesta V1.
create policy integracoes_admin on public.integracoes
for all to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

create policy mensagens_whatsapp_admin on public.mensagens_whatsapp
for all to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

create policy audit_logs_select_admin on public.audit_logs
for select to authenticated
using (empresa_id is not null and (select private.e_admin(empresa_id)));

-- ============================================================
-- 7. GRANTS EXPLICITOS DA DATA API
-- ============================================================

-- Nenhuma tabela do thegestor fica publica para anon.
-- authenticated ainda passa por RLS em todas as operacoes abaixo.
grant select, update on public.empresas to authenticated;
grant select, insert, update on public.usuarios_empresa to authenticated;
grant select, insert, update on public.clientes to authenticated;
grant select, insert, update on public.planos to authenticated;
grant select, insert, update on public.planos_precos to authenticated;
grant select, insert, update on public.assinaturas to authenticated;
grant select, insert, update on public.cobrancas to authenticated;
grant select, insert, update on public.cobrancas_financeiras to authenticated;
grant select, insert, update on public.pagamentos to authenticated;
grant select, insert, update on public.tarefas_operacionais to authenticated;
grant select, insert, update on public.integracoes to authenticated;
grant select, insert, update on public.mensagens_whatsapp to authenticated;
grant select on public.audit_logs to authenticated;

-- ============================================================
-- 8. VIEW SEGURA PARA O PAINEL DO OPERADOR
-- ============================================================

create view public.fila_operacional
with (security_invoker = true)
as
select
  t.id as tarefa_id,
  t.empresa_id,
  t.tipo,
  t.status as status_tarefa,
  t.prioridade,
  t.atribuida_a,
  t.observacao_operador,
  t.criado_em,
  c.id as cliente_id,
  c.nome as cliente_nome,
  c.telefone,
  c.status as cliente_status,
  cb.id as cobranca_id,
  cb.vencimento,
  cb.status_pagamento,
  cb.pago_em
from public.tarefas_operacionais t
join public.clientes c
  on c.id = t.cliente_id
 and c.empresa_id = t.empresa_id
left join public.cobrancas cb
  on cb.id = t.cobranca_id
 and cb.empresa_id = t.empresa_id;

grant select on public.fila_operacional to authenticated;

commit;
