-- Keep dashboard reads bounded while preserving complete tenant-wide totals.
begin;

create or replace function public.buscar_metricas_dashboard(
  p_empresa_id uuid,
  p_hoje date,
  p_inicio_mes date,
  p_proximo_mes date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_inicio timestamptz := p_inicio_mes::timestamp at time zone 'America/Sao_Paulo';
  v_fim timestamptz := p_proximo_mes::timestamp at time zone 'America/Sao_Paulo';
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem consultar o dashboard' using errcode = '42501';
  end if;

  with charges as (
    select c.id, c.cliente_id, c.competencia, c.vencimento, c.status_pagamento, c.pago_em,
      cl.nome,
      coalesce(f.valor_original, 0) as valor_original,
      coalesce(f.valor_pago, 0) as valor_pago,
      greatest(coalesce(f.valor_original, 0) + coalesce(f.acrescimo, 0)
        - coalesce(f.desconto, 0) - coalesce(f.valor_pago, 0), 0) as saldo
    from public.cobrancas c
    join public.clientes cl on cl.id = c.cliente_id and cl.empresa_id = p_empresa_id
    left join public.cobrancas_financeiras f on f.cobranca_id = c.id and f.empresa_id = p_empresa_id
    where c.empresa_id = p_empresa_id and c.status_pagamento <> 'cancelado'
  ), open_charges as (
    select * from charges where status_pagamento in ('pendente', 'atrasado') and saldo > 0
  ), paid_month as (
    select coalesce(sum(valor_pago), 0) as amount,
      count(*) filter (where valor_original > 0 and valor_pago > 0) as count
    from charges
    where status_pagamento = 'pago' and valor_original > 0 and valor_pago > 0
      and pago_em >= v_inicio and pago_em < v_fim
  ), partial_month as (
    select coalesce(sum(valor_pago), 0) as amount
    from charges
    where status_pagamento <> 'pago' and valor_pago > 0
      and competencia >= p_inicio_mes and competencia < p_proximo_mes
  ), credit_month as (
    select coalesce(sum(c.creditos_utilizados), 0) as used,
      coalesce(sum(c.creditos_previstos), 0) as expected
    from public.cobrancas c
    where c.empresa_id = p_empresa_id and c.competencia >= p_inicio_mes
      and c.competencia < p_proximo_mes and c.status_pagamento <> 'cancelado'
  ), action_tasks as (
    select count(*) as amount from public.tarefas_operacionais t
    where t.empresa_id = p_empresa_id and t.status = 'pendente'
      and t.tipo in ('renovar', 'novo_cliente')
  ), cycle_review as (
    select count(*) as amount
    from public.assinaturas s
    join public.clientes cl on cl.id = s.cliente_id and cl.empresa_id = p_empresa_id
    where s.empresa_id = p_empresa_id and s.status = 'ativa' and cl.status = 'ativo'
      and s.parcela_atual is not null and s.parcelas_total is not null
      and s.parcela_atual >= s.parcelas_total
      and (select c.status_pagamento from public.cobrancas c
        where c.empresa_id = p_empresa_id and c.assinatura_id = s.id
        order by c.competencia desc limit 1) = 'pago'
  ), config as (
    select coalesce((select ce.custo_medio_credito from public.configuracoes_empresa ce
      where ce.empresa_id = p_empresa_id), 8) as cost
  ), totals as (
    select
      count(*) filter (where vencimento = p_hoje) as due_today,
      count(*) filter (where vencimento < p_hoje) as overdue_count,
      coalesce(sum(saldo), 0) as pending_amount,
      coalesce(sum(saldo) filter (where vencimento < p_hoje), 0) as overdue_amount
    from open_charges
  ), lists as (
    select
      (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome,
        'vencimento', vencimento, 'saldo', saldo) order by vencimento, id), '[]'::jsonb)
        from (select * from open_charges where vencimento >= p_hoje order by vencimento, id limit 6) upcoming) as upcoming,
      (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome,
        'vencimento', vencimento, 'saldo', saldo) order by vencimento, id), '[]'::jsonb)
        from (select * from open_charges where vencimento < p_hoje order by vencimento, id limit 6) late) as late
  )
  select jsonb_build_object(
    'dueToday', totals.due_today, 'overdueCount', totals.overdue_count,
    'pendingAmount', totals.pending_amount, 'overdueAmount', totals.overdue_amount,
    'receivedThisMonth', paid_month.amount + partial_month.amount,
    'paidCountThisMonth', paid_month.count,
    'pendingRenewals', action_tasks.amount, 'cycleReviewCount', cycle_review.amount,
    'creditsUsed', credit_month.used, 'creditsExpected', credit_month.expected,
    'creditCost', config.cost, 'upcoming', lists.upcoming, 'late', lists.late
  ) into v_result
  from totals, paid_month, partial_month, credit_month, action_tasks, cycle_review, config, lists;

  return v_result;
end;
$$;

revoke all on function public.buscar_metricas_dashboard(uuid, date, date, date) from public, anon;
grant execute on function public.buscar_metricas_dashboard(uuid, date, date, date) to authenticated;

commit;
