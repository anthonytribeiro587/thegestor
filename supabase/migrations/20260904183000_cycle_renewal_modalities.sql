-- thegestor | avanço de ciclos trimestrais e escolha da renovação
-- Regra:
-- 1) ciclos em andamento (ex.: 2/3) avançam normalmente no motor mensal;
-- 2) ao concluir o ciclo (ex.: 3/3), nenhuma nova cobrança é gerada automaticamente;
-- 3) após o pagamento da última parcela, o admin escolhe renovação mensal ou trimestral;
-- 4) a escolha cria a primeira cobrança do novo ciclo na próxima competência disponível.

begin;

create or replace function public.gerar_cobrancas_mensais_sistema(p_competencia date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competencia date;
  v_item record;
  v_cobranca_id uuid;
  v_vencimento date;
  v_ultimo_dia integer;
  v_status text;
  v_geradas integer := 0;
  v_existentes integer := 0;
  v_ciclos_revisao integer := 0;
  v_ciclos_avancados integer := 0;
  v_sem_financeiro integer := 0;
  v_execucao_id uuid;
begin
  v_competencia := date_trunc('month', coalesce(p_competencia, current_date))::date;

  perform pg_advisory_xact_lock(hashtext('thegestor:billing:' || v_competencia::text));

  insert into public.execucoes_automacao (tipo, competencia, status)
  values ('motor_cobranca', v_competencia, 'processando')
  returning id into v_execucao_id;

  for v_item in
    select
      a.id as assinatura_id,
      a.empresa_id,
      a.cliente_id,
      a.dia_vencimento,
      greatest(coalesce(a.creditos_por_ciclo, 0), 0) as creditos_por_ciclo,
      a.parcela_atual,
      a.parcelas_total,
      af.valor_acordado
    from public.assinaturas a
    join public.clientes c
      on c.id = a.cliente_id
     and c.empresa_id = a.empresa_id
    left join public.assinaturas_financeiras af
      on af.assinatura_id = a.id
     and af.empresa_id = a.empresa_id
    left join public.configuracoes_empresa ce
      on ce.empresa_id = a.empresa_id
    where a.status = 'ativa'
      and c.status = 'ativo'
      and coalesce(a.renovacao_automatica, true) = true
      and coalesce(ce.motor_cobranca_ativo, true) = true
  loop
    v_cobranca_id := null;

    select cb.id into v_cobranca_id
    from public.cobrancas cb
    where cb.empresa_id = v_item.empresa_id
      and cb.assinatura_id = v_item.assinatura_id
      and cb.competencia = v_competencia
      and cb.status_pagamento <> 'cancelado'
    order by cb.criado_em asc
    limit 1;

    if v_cobranca_id is not null then
      v_existentes := v_existentes + 1;
      continue;
    end if;

    if v_item.parcelas_total is not null
       and v_item.parcela_atual >= v_item.parcelas_total then
      v_ciclos_revisao := v_ciclos_revisao + 1;
      continue;
    end if;

    if v_item.valor_acordado is null then
      v_sem_financeiro := v_sem_financeiro + 1;
      continue;
    end if;

    v_ultimo_dia := extract(day from (v_competencia + interval '1 month - 1 day'))::integer;
    v_vencimento := make_date(
      extract(year from v_competencia)::integer,
      extract(month from v_competencia)::integer,
      least(greatest(coalesce(v_item.dia_vencimento, 1), 1), v_ultimo_dia)
    );
    v_status := case when v_vencimento < current_date then 'atrasado' else 'pendente' end;
    v_cobranca_id := gen_random_uuid();

    insert into public.cobrancas (
      id, empresa_id, cliente_id, assinatura_id, competencia, vencimento,
      status_pagamento, pago_em, origem, external_reference,
      creditos_utilizados, creditos_previstos
    ) values (
      v_cobranca_id, v_item.empresa_id, v_item.cliente_id, v_item.assinatura_id,
      v_competencia, v_vencimento, v_status, null, 'motor_mensal',
      'thegestor:auto:' || v_cobranca_id::text,
      0, v_item.creditos_por_ciclo
    );

    insert into public.cobrancas_financeiras (
      cobranca_id, empresa_id, valor_original, valor_pago, moeda
    ) values (
      v_cobranca_id, v_item.empresa_id, greatest(v_item.valor_acordado, 0), null, 'BRL'
    );

    if v_item.parcelas_total is not null then
      update public.assinaturas
      set parcela_atual = least(parcelas_total, parcela_atual + 1),
          atualizado_em = now()
      where id = v_item.assinatura_id
        and empresa_id = v_item.empresa_id;
      v_ciclos_avancados := v_ciclos_avancados + 1;
    end if;

    v_geradas := v_geradas + 1;
  end loop;

  update public.execucoes_automacao
  set status = 'processado',
      resumo = jsonb_build_object(
        'geradas', v_geradas,
        'existentes', v_existentes,
        'ciclos_revisao', v_ciclos_revisao,
        'ciclos_avancados', v_ciclos_avancados,
        'sem_financeiro', v_sem_financeiro
      ),
      finalizado_em = now()
  where id = v_execucao_id;

  return jsonb_build_object(
    'competencia', v_competencia,
    'geradas', v_geradas,
    'existentes', v_existentes,
    'ciclos_revisao', v_ciclos_revisao,
    'ciclos_avancados', v_ciclos_avancados,
    'sem_financeiro', v_sem_financeiro
  );
exception
  when others then
    if v_execucao_id is not null then
      update public.execucoes_automacao
      set status = 'erro', erro = sqlerrm, finalizado_em = now()
      where id = v_execucao_id;
    end if;
    raise;
end;
$$;

revoke all on function public.gerar_cobrancas_mensais_sistema(date) from public, anon, authenticated;
grant execute on function public.gerar_cobrancas_mensais_sistema(date) to service_role;

create or replace function public.definir_renovacao_assinatura(
  p_empresa_id uuid,
  p_assinatura_id uuid,
  p_modalidade text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assinatura public.assinaturas%rowtype;
  v_cliente public.clientes%rowtype;
  v_financeiro public.assinaturas_financeiras%rowtype;
  v_ultima_cobranca public.cobrancas%rowtype;
  v_competencia date;
  v_vencimento date;
  v_ultimo_dia integer;
  v_status text;
  v_cobranca_id uuid;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem definir a renovacao' using errcode = '42501';
  end if;

  p_modalidade := lower(trim(coalesce(p_modalidade, '')));
  if p_modalidade not in ('mensal', 'trimestral') then
    raise exception 'Modalidade de renovacao invalida';
  end if;

  select * into v_assinatura
  from public.assinaturas
  where id = p_assinatura_id
    and empresa_id = p_empresa_id
  for update;

  if v_assinatura.id is null then
    raise exception 'Assinatura nao encontrada';
  end if;

  if v_assinatura.status <> 'ativa' then
    raise exception 'A assinatura precisa estar ativa para renovar';
  end if;

  if v_assinatura.parcelas_total is null
     or v_assinatura.parcela_atual is null
     or v_assinatura.parcela_atual < v_assinatura.parcelas_total then
    raise exception 'O ciclo atual ainda nao foi concluido';
  end if;

  select * into v_cliente
  from public.clientes
  where id = v_assinatura.cliente_id
    and empresa_id = p_empresa_id;

  if v_cliente.id is null or v_cliente.status <> 'ativo' then
    raise exception 'Cliente inativo ou nao encontrado';
  end if;

  select * into v_ultima_cobranca
  from public.cobrancas
  where empresa_id = p_empresa_id
    and assinatura_id = p_assinatura_id
    and status_pagamento <> 'cancelado'
  order by competencia desc, criado_em desc
  limit 1
  for update;

  if v_ultima_cobranca.id is null then
    raise exception 'Nenhuma cobranca encontrada para este ciclo';
  end if;

  if v_ultima_cobranca.status_pagamento <> 'pago' then
    raise exception 'A ultima mensalidade precisa estar paga antes da renovacao';
  end if;

  select * into v_financeiro
  from public.assinaturas_financeiras
  where assinatura_id = p_assinatura_id
    and empresa_id = p_empresa_id
  for update;

  if v_financeiro.assinatura_id is null then
    raise exception 'Valor da assinatura nao encontrado';
  end if;

  v_competencia := greatest(
    date_trunc('month', current_date)::date,
    (date_trunc('month', v_ultima_cobranca.competencia) + interval '1 month')::date
  );

  if exists (
    select 1
    from public.cobrancas c
    where c.empresa_id = p_empresa_id
      and c.assinatura_id = p_assinatura_id
      and c.competencia = v_competencia
      and c.status_pagamento <> 'cancelado'
  ) then
    raise exception 'Ja existe cobranca para a proxima competencia';
  end if;

  if p_modalidade = 'mensal' then
    update public.assinaturas
    set parcela_atual = null,
        parcelas_total = null,
        renovacao_automatica = true,
        atualizado_em = now()
    where id = p_assinatura_id
      and empresa_id = p_empresa_id;
  else
    update public.assinaturas
    set parcela_atual = 1,
        parcelas_total = 3,
        renovacao_automatica = true,
        atualizado_em = now()
    where id = p_assinatura_id
      and empresa_id = p_empresa_id;
  end if;

  v_ultimo_dia := extract(day from (v_competencia + interval '1 month - 1 day'))::integer;
  v_vencimento := make_date(
    extract(year from v_competencia)::integer,
    extract(month from v_competencia)::integer,
    least(greatest(coalesce(v_assinatura.dia_vencimento, 1), 1), v_ultimo_dia)
  );
  v_status := case when v_vencimento < current_date then 'atrasado' else 'pendente' end;
  v_cobranca_id := gen_random_uuid();

  insert into public.cobrancas (
    id, empresa_id, cliente_id, assinatura_id, competencia, vencimento,
    status_pagamento, pago_em, origem, external_reference,
    creditos_utilizados, creditos_previstos
  ) values (
    v_cobranca_id, p_empresa_id, v_assinatura.cliente_id, p_assinatura_id,
    v_competencia, v_vencimento, v_status, null, 'renovacao_modalidade',
    'thegestor:renew:' || v_cobranca_id::text,
    0, greatest(coalesce(v_assinatura.creditos_por_ciclo, 0), 0)
  );

  insert into public.cobrancas_financeiras (
    cobranca_id, empresa_id, valor_original, valor_pago, moeda
  ) values (
    v_cobranca_id, p_empresa_id, greatest(v_financeiro.valor_acordado, 0), null, 'BRL'
  );

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  ) values (
    p_empresa_id,
    auth.uid(),
    'assinatura.renovacao_definida',
    'assinatura',
    p_assinatura_id,
    jsonb_build_object(
      'modalidade', p_modalidade,
      'cobranca_id', v_cobranca_id,
      'competencia', v_competencia,
      'ciclo_anterior', jsonb_build_object(
        'parcela_atual', v_assinatura.parcela_atual,
        'parcelas_total', v_assinatura.parcelas_total
      ),
      'novo_ciclo', case
        when p_modalidade = 'trimestral' then jsonb_build_object('parcela_atual', 1, 'parcelas_total', 3)
        else jsonb_build_object('parcela_atual', null, 'parcelas_total', null)
      end
    )
  );

  return jsonb_build_object(
    'renovado', true,
    'modalidade', p_modalidade,
    'cobranca_id', v_cobranca_id,
    'competencia', v_competencia,
    'vencimento', v_vencimento
  );
end;
$$;

revoke all on function public.definir_renovacao_assinatura(uuid, uuid, text) from public, anon;
grant execute on function public.definir_renovacao_assinatura(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
