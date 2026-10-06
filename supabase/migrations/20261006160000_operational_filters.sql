begin;

-- RPC additive: keep the current paginated endpoint available during rollout.
create or replace function public.buscar_clientes_paginados_com_filtros(
  p_empresa_id uuid,
  p_hoje date,
  p_busca text default '',
  p_filtro text default 'Todos',
  p_dia integer default null,
  p_offset integer default 0,
  p_limite integer default 25,
  p_status text default 'Todos',
  p_plano_id uuid default null,
  p_com_atraso boolean default null,
  p_creditos_previstos text default 'Todos'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem consultar clientes' using errcode = '42501';
  end if;
  if p_filtro not in ('Todos', 'Vencidos', 'Revisar ciclos') then
    raise exception 'Filtro operacional de clientes inválido';
  end if;
  if p_status not in ('Todos', 'Ativos', 'Cancelados') then
    raise exception 'Status de clientes inválido';
  end if;
  if p_creditos_previstos not in ('Todos', 'Com créditos previstos', 'Sem créditos previstos') then
    raise exception 'Filtro de créditos inválido';
  end if;
  if p_dia is not null and p_dia not between 1 and 31 then
    raise exception 'Dia de vencimento inválido';
  end if;

  with base as (
    select
      c.id, c.nome, c.telefone, c.email, c.status as base_status,
      s.id as assinatura_id, s.status as assinatura_status, s.dia_vencimento,
      s.creditos_por_ciclo, s.parcela_atual, s.parcelas_total, p.nome as plano_nome,
      case when current_charge.id is not null then coalesce(current_charge.creditos_utilizados, 0)
           else coalesce(latest_charge.creditos_utilizados, 0) end as creditos_utilizados,
      case when current_charge.id is not null then coalesce(current_charge.creditos_previstos, 0)
           else coalesce(latest_charge.creditos_previstos, 0) end as creditos_previstos,
      latest_charge.status_pagamento as ultimo_status_cobranca,
      coalesce(last_payment.last_paid_at, latest_charge.pago_em) as ultimo_pagamento,
      exists (
        select 1 from public.cobrancas overdue_charge
        where overdue_charge.empresa_id = p_empresa_id and overdue_charge.cliente_id = c.id
          and overdue_charge.status_pagamento in ('pendente', 'atrasado')
          and overdue_charge.vencimento < p_hoje
      ) as possui_atraso
    from public.clientes c
    left join lateral (
      select sub.* from public.assinaturas sub
      where sub.empresa_id = p_empresa_id and sub.cliente_id = c.id
      order by (sub.status = 'ativa') desc, sub.criado_em desc
      limit 1
    ) s on true
    left join public.planos p on p.id = s.plano_id and p.empresa_id = p_empresa_id
    left join lateral (
      select ch.id, ch.creditos_utilizados, ch.creditos_previstos, ch.pago_em
      from public.cobrancas ch
      where ch.empresa_id = p_empresa_id and ch.cliente_id = c.id
        and ch.competencia >= date_trunc('month', p_hoje)::date
        and ch.competencia < (date_trunc('month', p_hoje) + interval '1 month')::date
      order by ch.competencia desc limit 1
    ) current_charge on true
    left join lateral (
      select ch.competencia, ch.creditos_utilizados, ch.creditos_previstos, ch.status_pagamento, ch.pago_em
      from public.cobrancas ch
      where ch.empresa_id = p_empresa_id and ch.cliente_id = c.id
      order by ch.competencia desc limit 1
    ) latest_charge on true
    left join lateral (
      select max(coalesce(pay.pago_em, pay.criado_em)) as last_paid_at
      from public.cobrancas ch
      join public.pagamentos pay on pay.cobranca_id = ch.id and pay.empresa_id = p_empresa_id
      where ch.empresa_id = p_empresa_id and ch.cliente_id = c.id
        and (pay.pago_em is not null or pay.status in ('pago', 'approved'))
    ) last_payment on true
    where c.empresa_id = p_empresa_id
  ), derived as (
    select base.*,
      case when base_status = 'cancelado' then 'Cancelado'
           when possui_atraso then 'Vencido' else 'Ativo' end as status_ui,
      (base_status = 'ativo' and assinatura_status = 'ativa'
       and parcela_atual is not null and parcelas_total is not null
       and parcela_atual >= parcelas_total and ultimo_status_cobranca = 'pago') as ciclo_revisao
    from base
  ), matching as (
    select * from derived d
    where (nullif(trim(coalesce(p_busca, '')), '') is null
      or position(lower(trim(p_busca)) in lower(concat_ws(' ', d.nome, d.telefone, d.email))) > 0)
      and (p_status = 'Todos' or (p_status = 'Ativos' and d.base_status = 'ativo')
        or (p_status = 'Cancelados' and d.base_status = 'cancelado'))
      and (p_filtro = 'Todos' or (p_filtro = 'Vencidos' and d.possui_atraso)
        or (p_filtro = 'Revisar ciclos' and d.ciclo_revisao))
      and (p_plano_id is null or d.assinatura_id is not null
        and exists (select 1 from public.assinaturas selected_plan
          where selected_plan.id = d.assinatura_id and selected_plan.empresa_id = p_empresa_id
            and selected_plan.plano_id = p_plano_id))
      and (p_com_atraso is null or d.possui_atraso = p_com_atraso)
      and (p_creditos_previstos = 'Todos'
        or (p_creditos_previstos = 'Com créditos previstos' and d.creditos_previstos > 0)
        or (p_creditos_previstos = 'Sem créditos previstos' and d.creditos_previstos <= 0))
  ), page_rows as (
    select * from matching
    where p_dia is null or dia_vencimento = p_dia
    order by dia_vencimento nulls first, nome, id
    limit least(greatest(coalesce(p_limite, 25), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ), day_counts as (
    select dia_vencimento, count(*) as quantidade
    from matching where dia_vencimento between 1 and 31
    group by dia_vencimento
  ), all_stats as (
    select count(*) filter (where base_status = 'ativo') as ativos,
      count(*) filter (where status_ui = 'Vencido') as vencidos,
      coalesce(sum(creditos_utilizados), 0) as creditos_utilizados,
      coalesce(sum(creditos_previstos), 0) as creditos_previstos
    from derived
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'nome', nome, 'telefone', telefone, 'email', email,
      'baseStatus', base_status, 'status', status_ui, 'plano', coalesce(plano_nome, 'Sem plano'),
      'creditos', coalesce(creditos_por_ciclo, 0),
      'creditosUtilizados', coalesce(creditos_utilizados, 0),
      'creditosPrevistos', coalesce(creditos_previstos, 0),
      'ciclo', case when parcela_atual is null or parcelas_total is null then '—' else parcela_atual::text || '/' || parcelas_total::text end,
      'diaVencimento', dia_vencimento, 'ultimoPagamento', ultimo_pagamento,
      'cicloRevisao', ciclo_revisao
    ) order by dia_vencimento nulls first, nome, id) from page_rows), '[]'::jsonb),
    'total', (select count(*) from matching where p_dia is null or dia_vencimento = p_dia),
    'filteredTotal', (select count(*) from matching),
    'stats', (select to_jsonb(all_stats) from all_stats),
    'dayCounts', coalesce((select jsonb_object_agg(dia_vencimento::text, quantidade) from day_counts), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.buscar_cobrancas_paginadas_com_filtros(
  p_empresa_id uuid,
  p_hoje date,
  p_mes date,
  p_busca text default '',
  p_status text default 'Precisa de ação',
  p_offset integer default 0,
  p_limite integer default 25,
  p_plano_id uuid default null,
  p_dia integer default null,
  p_vencimento_de date default null,
  p_vencimento_ate date default null,
  p_situacao_financeira text default 'Todas'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_mes_inicio timestamptz;
  v_mes_fim timestamptz;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem consultar cobranças' using errcode = '42501';
  end if;
  if p_status not in ('Precisa de ação', 'Atrasado', 'A vencer', 'Parcial', 'Pago', 'Para renovar', 'Todos') then
    raise exception 'Filtro de cobranças inválido';
  end if;
  if p_situacao_financeira not in ('Todas', 'Com saldo', 'Parcial', 'Quitada', 'Sem recebimento') then
    raise exception 'Situação financeira inválida';
  end if;
  if p_dia is not null and p_dia not between 1 and 31 then
    raise exception 'Dia de vencimento inválido';
  end if;
  v_mes_inicio := p_mes::timestamp at time zone 'America/Sao_Paulo';
  v_mes_fim := (p_mes + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';

  with base as (
    select ch.id, ch.vencimento, ch.status_pagamento, ch.pago_em, ch.origem,
      coalesce(ch.creditos_previstos, 0) as creditos_previstos,
      cl.nome as cliente_nome, coalesce(pl.nome, 'Cobrança recorrente') as plano_nome,
      pl.id as plano_id,
      coalesce(fin.valor_original, 0) as valor_original,
      coalesce(fin.valor_pago, 0) as valor_pago,
      coalesce(fin.valor_original, 0) + coalesce(fin.acrescimo, 0)
        - coalesce(fin.desconto, 0) - coalesce(fin.valor_pago, 0) as saldo,
      payment.metodo as metodo_pagamento,
      task.tarefa_id, task.tipo as tipo_tarefa
    from public.cobrancas ch
    join public.clientes cl on cl.id = ch.cliente_id and cl.empresa_id = p_empresa_id
    left join public.assinaturas s on s.id = ch.assinatura_id and s.empresa_id = p_empresa_id
    left join public.planos pl on pl.id = s.plano_id and pl.empresa_id = p_empresa_id
    left join public.cobrancas_financeiras fin on fin.cobranca_id = ch.id and fin.empresa_id = p_empresa_id
    left join lateral (
      select pay.metodo from public.pagamentos pay
      where pay.cobranca_id = ch.id and pay.empresa_id = p_empresa_id
      order by (pay.status in ('approved', 'pago', 'parcial')) desc, pay.criado_em desc limit 1
    ) payment on true
    left join lateral (
      select t.id as tarefa_id, t.tipo from public.tarefas_operacionais t
      where t.cobranca_id = ch.id and t.empresa_id = p_empresa_id and t.status = 'pendente'
      order by t.criado_em desc limit 1
    ) task on true
    where ch.empresa_id = p_empresa_id and ch.status_pagamento <> 'cancelado'
  ), derived as (
    select base.*,
      case when status_pagamento <> 'pago' and valor_pago > 0 and valor_pago < valor_original then 'Parcial'
           when status_pagamento = 'pago' then 'Pago'
           when status_pagamento = 'atrasado' or (status_pagamento = 'pendente' and vencimento < p_hoje) then 'Atrasado'
           else 'A vencer' end as status_ui,
      (tarefa_id is not null
       or status_pagamento = 'atrasado'
       or (status_pagamento = 'pendente' and vencimento < p_hoje)
       or (status_pagamento <> 'pago' and valor_pago > 0 and valor_pago < valor_original)
       or (saldo > 0 and vencimento = p_hoje)) as precisa_acao
    from base
  ), matching as (
    select * from derived d
    where (nullif(trim(coalesce(p_busca, '')), '') is null
      or position(lower(trim(p_busca)) in lower(concat_ws(' ', d.cliente_nome, d.plano_nome))) > 0)
      and (p_status = 'Todos'
        or (p_status = 'Precisa de ação' and d.precisa_acao)
        or (p_status = 'Para renovar' and d.tarefa_id is not null)
        or (p_status not in ('Precisa de ação', 'Para renovar') and d.status_ui = p_status))
      and (p_plano_id is null or d.plano_id = p_plano_id)
      and (p_dia is null or extract(day from d.vencimento)::integer = p_dia)
      and (p_vencimento_de is null or d.vencimento >= p_vencimento_de)
      and (p_vencimento_ate is null or d.vencimento <= p_vencimento_ate)
      and (p_situacao_financeira = 'Todas'
        or (p_situacao_financeira = 'Com saldo' and d.saldo > 0)
        or (p_situacao_financeira = 'Parcial' and d.valor_pago > 0 and d.saldo > 0)
        or (p_situacao_financeira = 'Quitada' and d.saldo <= 0 and d.valor_pago > 0)
        or (p_situacao_financeira = 'Sem recebimento' and d.valor_pago <= 0))
  ), page_rows as (
    select * from matching order by vencimento asc, id
    limit least(greatest(coalesce(p_limite, 25), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ), all_stats as (
    select count(*) filter (where saldo > 0 and vencimento = p_hoje) as vence_hoje,
      count(*) filter (where status_ui = 'Atrasado' and saldo > 0) as em_atraso,
      count(*) filter (where tarefa_id is not null) as renovacoes_pendentes,
      count(*) filter (where status_ui = 'Pago' and valor_original > 0 and valor_pago > 0
        and pago_em >= v_mes_inicio and pago_em < v_mes_fim) as quitadas_no_mes
    from derived
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'cliente', cliente_nome,
      'descricao', case when plano_nome = 'Cobrança recorrente' then plano_nome else 'Plano ' || plano_nome end,
      'vencimento', vencimento, 'statusPagamento', status_pagamento, 'pagoEm', pago_em,
      'origem', origem, 'creditosPrevistos', creditos_previstos,
      'valor', valor_original, 'valorPago', valor_pago, 'saldo', greatest(saldo, 0),
      'metodoPagamento', metodo_pagamento, 'tarefaId', tarefa_id, 'tipoTarefa', tipo_tarefa,
      'status', status_ui, 'precisaAcao', precisa_acao
    ) order by vencimento asc, id) from page_rows), '[]'::jsonb),
    'total', (select count(*) from matching),
    'stats', (select to_jsonb(all_stats) from all_stats)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.buscar_clientes_paginados_com_filtros(uuid, date, text, text, integer, integer, integer, text, uuid, boolean, text) from public, anon;
revoke all on function public.buscar_cobrancas_paginadas_com_filtros(uuid, date, date, text, text, integer, integer, uuid, integer, date, date, text) from public, anon;
grant execute on function public.buscar_clientes_paginados_com_filtros(uuid, date, text, text, integer, integer, integer, text, uuid, boolean, text) to authenticated;
grant execute on function public.buscar_cobrancas_paginadas_com_filtros(uuid, date, date, text, text, integer, integer, uuid, integer, date, date, text) to authenticated;

commit;
