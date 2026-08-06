-- thegestor | creditos, telefone opcional e importacao de clientes
-- Execute depois das migrations anteriores.

begin;

-- ============================================================
-- 1. AJUSTES DE MODELO
-- ============================================================

alter table public.clientes
  alter column telefone drop not null;

alter table public.assinaturas
  add column if not exists creditos_por_ciclo smallint not null default 1 check (creditos_por_ciclo >= 0),
  add column if not exists parcela_atual smallint,
  add column if not exists parcelas_total smallint,
  add constraint assinaturas_parcelas_validas check (
    (parcela_atual is null and parcelas_total is null)
    or (
      parcela_atual is not null
      and parcelas_total is not null
      and parcela_atual >= 1
      and parcelas_total >= 1
      and parcela_atual <= parcelas_total
    )
  ) not valid;

alter table public.assinaturas validate constraint assinaturas_parcelas_validas;

alter table public.cobrancas
  add column if not exists creditos_utilizados smallint not null default 0 check (creditos_utilizados >= 0),
  add column if not exists creditos_previstos smallint not null default 0 check (creditos_previstos >= 0);

-- Valor negociado pertence a assinatura, mas fica separado da tabela operacional
-- para nunca ser exposto ao perfil operador.
create table if not exists public.assinaturas_financeiras (
  assinatura_id uuid primary key references public.assinaturas(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  valor_acordado numeric(12,2) not null default 0 check (valor_acordado >= 0),
  moeda char(3) not null default 'BRL',
  atualizado_em timestamptz not null default now()
);

create index if not exists assinaturas_financeiras_empresa_idx
  on public.assinaturas_financeiras(empresa_id);

create trigger assinaturas_financeiras_set_updated_at
before update on public.assinaturas_financeiras
for each row execute function private.set_updated_at();

alter table public.assinaturas_financeiras enable row level security;
revoke all on table public.assinaturas_financeiras from anon, authenticated;
grant select, insert, update, delete on public.assinaturas_financeiras to authenticated;

create policy assinaturas_financeiras_admin_select on public.assinaturas_financeiras
for select to authenticated
using ((select private.e_admin(empresa_id)));

create policy assinaturas_financeiras_admin_insert on public.assinaturas_financeiras
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy assinaturas_financeiras_admin_update on public.assinaturas_financeiras
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

create policy assinaturas_financeiras_admin_delete on public.assinaturas_financeiras
for delete to authenticated
using ((select private.e_admin(empresa_id)));

create table if not exists public.configuracoes_empresa (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  custo_medio_credito numeric(12,2) not null default 8 check (custo_medio_credito >= 0),
  fuso_horario text not null default 'America/Sao_Paulo',
  atualizado_em timestamptz not null default now()
);

insert into public.configuracoes_empresa (empresa_id, custo_medio_credito)
select e.id, 8
from public.empresas e
on conflict (empresa_id) do nothing;

create trigger configuracoes_empresa_set_updated_at
before update on public.configuracoes_empresa
for each row execute function private.set_updated_at();

alter table public.configuracoes_empresa enable row level security;
revoke all on table public.configuracoes_empresa from anon, authenticated;
grant select, insert, update on public.configuracoes_empresa to authenticated;

create policy configuracoes_empresa_admin_select on public.configuracoes_empresa
for select to authenticated
using ((select private.e_admin(empresa_id)));

create policy configuracoes_empresa_admin_insert on public.configuracoes_empresa
for insert to authenticated
with check ((select private.e_admin(empresa_id)));

create policy configuracoes_empresa_admin_update on public.configuracoes_empresa
for update to authenticated
using ((select private.e_admin(empresa_id)))
with check ((select private.e_admin(empresa_id)));

-- ============================================================
-- 2. CADASTRO MANUAL ATUALIZADO
-- ============================================================

drop function if exists public.cadastrar_cliente_com_assinatura(uuid, text, text, text, text, numeric, integer, text);

create or replace function public.cadastrar_cliente_com_assinatura(
  p_empresa_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_plano_nome text,
  p_valor numeric,
  p_dia_vencimento integer,
  p_observacoes text default null,
  p_creditos integer default 1,
  p_parcela_atual integer default null,
  p_parcelas_total integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
  v_plano_id uuid;
  v_assinatura_id uuid;
  v_cobranca_id uuid;
  v_vencimento date;
  v_competencia date;
  v_ano integer;
  v_mes integer;
  v_ultimo_dia integer;
  v_dia integer;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem cadastrar clientes' using errcode = '42501';
  end if;

  if p_nome is null or char_length(trim(p_nome)) < 2 then
    raise exception 'Nome do cliente invalido';
  end if;

  if nullif(trim(coalesce(p_telefone, '')), '') is not null
     and char_length(trim(p_telefone)) < 8 then
    raise exception 'Telefone invalido';
  end if;

  if p_plano_nome is null or char_length(trim(p_plano_nome)) < 2 then
    raise exception 'Plano invalido';
  end if;

  if p_valor is null or p_valor < 0 then
    raise exception 'Valor invalido';
  end if;

  if p_dia_vencimento not between 1 and 31 then
    raise exception 'Dia de vencimento invalido';
  end if;

  if p_creditos is null or p_creditos < 0 then
    raise exception 'Quantidade de creditos invalida';
  end if;

  if (p_parcela_atual is null) <> (p_parcelas_total is null) then
    raise exception 'Parcela atual e total devem ser informados juntos';
  end if;

  if p_parcela_atual is not null and (
    p_parcela_atual < 1 or p_parcelas_total < 1 or p_parcela_atual > p_parcelas_total
  ) then
    raise exception 'Ciclo de mensalidades invalido';
  end if;

  select p.id into v_plano_id
  from public.planos p
  where p.empresa_id = p_empresa_id
    and lower(trim(p.nome)) = lower(trim(p_plano_nome))
  limit 1;

  if v_plano_id is null then
    insert into public.planos (empresa_id, nome, periodicidade, ativo)
    values (p_empresa_id, trim(p_plano_nome), 'mensal', true)
    returning id into v_plano_id;
  end if;

  insert into public.clientes (
    empresa_id, nome, telefone, email, status, origem, observacoes_operacionais
  ) values (
    p_empresa_id,
    trim(p_nome),
    nullif(trim(coalesce(p_telefone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    'ativo',
    'manual',
    nullif(trim(coalesce(p_observacoes, '')), '')
  ) returning id into v_cliente_id;

  insert into public.assinaturas (
    empresa_id, cliente_id, plano_id, dia_vencimento, status,
    renovacao_automatica, creditos_por_ciclo, parcela_atual, parcelas_total
  ) values (
    p_empresa_id, v_cliente_id, v_plano_id, p_dia_vencimento, 'ativa',
    true, p_creditos, p_parcela_atual, p_parcelas_total
  ) returning id into v_assinatura_id;

  insert into public.assinaturas_financeiras (
    assinatura_id, empresa_id, valor_acordado, moeda
  ) values (
    v_assinatura_id, p_empresa_id, p_valor, 'BRL'
  );

  v_ano := extract(year from current_date)::integer;
  v_mes := extract(month from current_date)::integer;
  v_ultimo_dia := extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::integer;
  v_dia := least(p_dia_vencimento, v_ultimo_dia);
  v_vencimento := make_date(v_ano, v_mes, v_dia);

  if v_vencimento < current_date then
    v_ano := extract(year from (current_date + interval '1 month'))::integer;
    v_mes := extract(month from (current_date + interval '1 month'))::integer;
    v_ultimo_dia := extract(day from (date_trunc('month', current_date + interval '1 month') + interval '1 month - 1 day'))::integer;
    v_dia := least(p_dia_vencimento, v_ultimo_dia);
    v_vencimento := make_date(v_ano, v_mes, v_dia);
  end if;

  v_competencia := date_trunc('month', v_vencimento)::date;
  v_cobranca_id := gen_random_uuid();

  insert into public.cobrancas (
    id, empresa_id, cliente_id, assinatura_id, competencia, vencimento,
    status_pagamento, origem, external_reference, creditos_utilizados, creditos_previstos
  ) values (
    v_cobranca_id,
    p_empresa_id,
    v_cliente_id,
    v_assinatura_id,
    v_competencia,
    v_vencimento,
    'pendente',
    'sistema',
    'thegestor:' || v_cobranca_id::text,
    0,
    p_creditos
  );

  insert into public.cobrancas_financeiras (
    cobranca_id, empresa_id, valor_original, moeda
  ) values (
    v_cobranca_id, p_empresa_id, p_valor, 'BRL'
  );

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  ) values (
    p_empresa_id,
    auth.uid(),
    'cliente.criado',
    'cliente',
    v_cliente_id,
    jsonb_build_object(
      'assinatura_id', v_assinatura_id,
      'cobranca_id', v_cobranca_id,
      'creditos', p_creditos
    )
  );

  return jsonb_build_object(
    'cliente_id', v_cliente_id,
    'plano_id', v_plano_id,
    'assinatura_id', v_assinatura_id,
    'cobranca_id', v_cobranca_id,
    'vencimento', v_vencimento
  );
end;
$$;

revoke all on function public.cadastrar_cliente_com_assinatura(uuid, text, text, text, text, numeric, integer, text, integer, integer, integer) from public, anon;
grant execute on function public.cadastrar_cliente_com_assinatura(uuid, text, text, text, text, numeric, integer, text, integer, integer, integer) to authenticated;

-- ============================================================
-- 3. IMPORTACAO EM LOTE DA PLANILHA
-- ============================================================

create or replace function public.importar_clientes_planilha(
  p_empresa_id uuid,
  p_competencia date,
  p_clientes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_plano_id uuid;
  v_cliente_id uuid;
  v_assinatura_id uuid;
  v_cobranca_id uuid;
  v_nome text;
  v_observacoes text;
  v_dia integer;
  v_creditos_usados integer;
  v_creditos_previstos integer;
  v_creditos_total integer;
  v_valor numeric(12,2);
  v_pago numeric(12,2);
  v_receber numeric(12,2);
  v_parcela_atual integer;
  v_parcelas_total integer;
  v_vencimento date;
  v_ultimo_dia integer;
  v_status text;
  v_importados integer := 0;
  v_ignorados integer := 0;
  v_total_creditos_usados integer := 0;
  v_total_creditos_previstos integer := 0;
  v_total_negociado numeric(12,2) := 0;
  v_total_pago numeric(12,2) := 0;
  v_total_receber numeric(12,2) := 0;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem importar clientes' using errcode = '42501';
  end if;

  if p_competencia is null then
    raise exception 'Competencia obrigatoria';
  end if;

  p_competencia := date_trunc('month', p_competencia)::date;

  if p_clientes is null or jsonb_typeof(p_clientes) <> 'array' then
    raise exception 'Lista de clientes invalida';
  end if;

  select p.id into v_plano_id
  from public.planos p
  where p.empresa_id = p_empresa_id
    and lower(trim(p.nome)) = 'mensal'
  limit 1;

  if v_plano_id is null then
    insert into public.planos (empresa_id, nome, periodicidade, ativo)
    values (p_empresa_id, 'Mensal', 'mensal', true)
    returning id into v_plano_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_clientes)
  loop
    v_nome := trim(coalesce(v_item->>'nome', ''));
    v_observacoes := nullif(trim(coalesce(v_item->>'observacoes', '')), '');
    v_dia := coalesce((v_item->>'dia_vencimento')::integer, 1);
    v_creditos_usados := greatest(coalesce((v_item->>'creditos_utilizados')::integer, 0), 0);
    v_creditos_previstos := greatest(coalesce((v_item->>'creditos_previstos')::integer, 0), 0);
    v_creditos_total := v_creditos_usados + v_creditos_previstos;
    v_valor := greatest(coalesce((v_item->>'valor_negociado')::numeric, 0), 0);
    v_pago := greatest(coalesce((v_item->>'valor_pago')::numeric, 0), 0);
    v_receber := greatest(coalesce((v_item->>'valor_a_receber')::numeric, greatest(v_valor - v_pago, 0)), 0);
    v_parcela_atual := nullif(v_item->>'parcela_atual', '')::integer;
    v_parcelas_total := nullif(v_item->>'parcelas_total', '')::integer;

    if v_nome = '' or v_dia not between 1 and 31 then
      raise exception 'Linha invalida na importacao: %', v_item;
    end if;

    if (v_parcela_atual is null) <> (v_parcelas_total is null) then
      raise exception 'Ciclo de mensalidades incompleto para %', v_nome;
    end if;

    if v_parcela_atual is not null and (
      v_parcela_atual < 1 or v_parcelas_total < 1 or v_parcela_atual > v_parcelas_total
    ) then
      raise exception 'Ciclo de mensalidades invalido para %', v_nome;
    end if;

    -- Evita duplicar a base se a mesma planilha for importada novamente.
    if exists (
      select 1
      from public.clientes c
      join public.assinaturas a on a.cliente_id = c.id and a.empresa_id = c.empresa_id
      where c.empresa_id = p_empresa_id
        and lower(trim(c.nome)) = lower(v_nome)
        and a.dia_vencimento = v_dia
    ) then
      v_ignorados := v_ignorados + 1;
      continue;
    end if;

    insert into public.clientes (
      empresa_id, nome, telefone, email, status, origem, observacoes_operacionais
    ) values (
      p_empresa_id,
      v_nome,
      null,
      null,
      'ativo',
      'importacao_planilha',
      v_observacoes
    ) returning id into v_cliente_id;

    insert into public.assinaturas (
      empresa_id, cliente_id, plano_id, dia_vencimento, status,
      renovacao_automatica, creditos_por_ciclo, parcela_atual, parcelas_total
    ) values (
      p_empresa_id,
      v_cliente_id,
      v_plano_id,
      v_dia,
      'ativa',
      true,
      v_creditos_total,
      v_parcela_atual,
      v_parcelas_total
    ) returning id into v_assinatura_id;

    insert into public.assinaturas_financeiras (
      assinatura_id, empresa_id, valor_acordado, moeda
    ) values (
      v_assinatura_id, p_empresa_id, v_valor, 'BRL'
    );

    v_ultimo_dia := extract(day from (date_trunc('month', p_competencia) + interval '1 month - 1 day'))::integer;
    v_vencimento := make_date(
      extract(year from p_competencia)::integer,
      extract(month from p_competencia)::integer,
      least(v_dia, v_ultimo_dia)
    );

    if v_receber <= 0 then
      v_status := 'pago';
    elsif v_vencimento < current_date then
      v_status := 'atrasado';
    else
      v_status := 'pendente';
    end if;

    v_cobranca_id := gen_random_uuid();

    insert into public.cobrancas (
      id, empresa_id, cliente_id, assinatura_id, competencia, vencimento,
      status_pagamento, pago_em, origem, external_reference,
      creditos_utilizados, creditos_previstos
    ) values (
      v_cobranca_id,
      p_empresa_id,
      v_cliente_id,
      v_assinatura_id,
      p_competencia,
      v_vencimento,
      v_status,
      case when v_status = 'pago' then now() else null end,
      'importacao_planilha',
      'thegestor:import:' || v_cobranca_id::text,
      v_creditos_usados,
      v_creditos_previstos
    );

    insert into public.cobrancas_financeiras (
      cobranca_id, empresa_id, valor_original, valor_pago, moeda
    ) values (
      v_cobranca_id,
      p_empresa_id,
      v_valor,
      case when v_pago > 0 then v_pago else null end,
      'BRL'
    );

    if v_pago > 0 then
      insert into public.pagamentos (
        empresa_id, cobranca_id, provedor, status, metodo, pago_em, payload_resumo
      ) values (
        p_empresa_id,
        v_cobranca_id,
        'manual',
        case when v_receber <= 0 then 'pago' else 'parcial' end,
        'importacao_planilha',
        now(),
        jsonb_build_object('origem', 'Clientes.xlsx', 'valor_importado', v_pago)
      );
    end if;

    -- Pagou mas ainda existem creditos previstos: entra na fila para renovar.
    -- Clientes com valor zero tambem entram na fila quando possuem credito previsto.
    if v_status = 'pago' and v_creditos_previstos > 0 then
      insert into public.tarefas_operacionais (
        empresa_id, cliente_id, cobranca_id, tipo, status, prioridade, observacao_operador
      ) values (
        p_empresa_id,
        v_cliente_id,
        v_cobranca_id,
        'renovar',
        'pendente',
        'normal',
        'Importado da planilha: pagamento concluido e renovacao ainda prevista.'
      ) on conflict do nothing;
    end if;

    insert into public.audit_logs (
      empresa_id, user_id, acao, entidade, entidade_id, metadados
    ) values (
      p_empresa_id,
      auth.uid(),
      'cliente.importado',
      'cliente',
      v_cliente_id,
      jsonb_build_object(
        'assinatura_id', v_assinatura_id,
        'cobranca_id', v_cobranca_id,
        'competencia', p_competencia,
        'creditos_utilizados', v_creditos_usados,
        'creditos_previstos', v_creditos_previstos
      )
    );

    v_importados := v_importados + 1;
    v_total_creditos_usados := v_total_creditos_usados + v_creditos_usados;
    v_total_creditos_previstos := v_total_creditos_previstos + v_creditos_previstos;
    v_total_negociado := v_total_negociado + v_valor;
    v_total_pago := v_total_pago + v_pago;
    v_total_receber := v_total_receber + v_receber;
  end loop;

  return jsonb_build_object(
    'importados', v_importados,
    'ignorados', v_ignorados,
    'creditos_utilizados', v_total_creditos_usados,
    'creditos_previstos', v_total_creditos_previstos,
    'valor_negociado', v_total_negociado,
    'valor_pago', v_total_pago,
    'valor_a_receber', v_total_receber
  );
end;
$$;

revoke all on function public.importar_clientes_planilha(uuid, date, jsonb) from public, anon;
grant execute on function public.importar_clientes_planilha(uuid, date, jsonb) to authenticated;

commit;
