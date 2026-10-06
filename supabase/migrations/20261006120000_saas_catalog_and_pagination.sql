-- TheGestor: admin plan catalog and bounded, tenant-scoped list queries.
begin;

-- Keep historical prices readable to admins, but route all writes through
-- security-definer functions so catalog edits cannot overwrite history.
revoke insert, update, delete on public.planos_precos from authenticated;
grant select on public.planos_precos to authenticated;

alter table public.planos_precos
  add column if not exists vigente_desde_em timestamptz,
  add column if not exists vigente_ate_em timestamptz;

update public.planos_precos
set vigente_desde_em = coalesce(vigente_desde_em, criado_em, vigente_desde::timestamp at time zone 'UTC');

alter table public.planos_precos
  alter column vigente_desde_em set default now(),
  alter column vigente_desde_em set not null;

create index if not exists planos_precos_atual_idx
  on public.planos_precos (empresa_id, plano_id, vigente_desde_em desc)
  where vigente_ate is null;
create index if not exists cobrancas_empresa_cliente_competencia_idx
  on public.cobrancas (empresa_id, cliente_id, competencia desc);
create index if not exists cobrancas_cliente_vencidas_idx
  on public.cobrancas (empresa_id, cliente_id, vencimento)
  where status_pagamento in ('pendente', 'atrasado');
create index if not exists tarefas_cobranca_pendente_idx
  on public.tarefas_operacionais (cobranca_id, criado_em desc)
  where status = 'pendente';

create or replace function public.proteger_historico_planos_precos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'O histórico de preços não pode ser excluído' using errcode = '55000';
  end if;

  if old.id is distinct from new.id
    or old.empresa_id is distinct from new.empresa_id
    or old.plano_id is distinct from new.plano_id
    or old.valor is distinct from new.valor
    or old.moeda is distinct from new.moeda
    or old.vigente_desde is distinct from new.vigente_desde
    or old.vigente_desde_em is distinct from new.vigente_desde_em
    or old.criado_em is distinct from new.criado_em
    or old.vigente_ate is not null
    or old.vigente_ate_em is not null
    or new.vigente_ate is null then
    raise exception 'O histórico de preços é imutável; encerre somente a vigência atual' using errcode = '55000';
  end if;

  new.vigente_ate_em := coalesce(new.vigente_ate_em, clock_timestamp());
  return new;
end;
$$;

revoke all on function public.proteger_historico_planos_precos() from public, anon, authenticated;
drop trigger if exists planos_precos_preservar_historico on public.planos_precos;
create trigger planos_precos_preservar_historico
  before update or delete on public.planos_precos
  for each row execute function public.proteger_historico_planos_precos();

create or replace function public.criar_plano_com_preco(
  p_empresa_id uuid,
  p_nome text,
  p_descricao text,
  p_periodicidade text,
  p_intervalo_dias integer,
  p_valor numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano_id uuid;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem criar planos' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_nome, '')), '') is null then
    raise exception 'Informe o nome do plano';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'Informe um preço válido';
  end if;

  insert into public.planos (empresa_id, nome, descricao, periodicidade, intervalo_dias, ativo)
  values (p_empresa_id, trim(p_nome), nullif(trim(coalesce(p_descricao, '')), ''), p_periodicidade, p_intervalo_dias, true)
  returning id into v_plano_id;

  insert into public.planos_precos (empresa_id, plano_id, valor, moeda, vigente_desde)
  values (p_empresa_id, v_plano_id, p_valor, 'BRL', current_date);

  return v_plano_id;
end;
$$;

create or replace function public.alterar_preco_plano(
  p_empresa_id uuid,
  p_plano_id uuid,
  p_valor numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preco public.planos_precos%rowtype;
  v_preco_id uuid;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem alterar preços' using errcode = '42501';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'Informe um preço válido';
  end if;

  perform 1 from public.planos p
  where p.id = p_plano_id and p.empresa_id = p_empresa_id
  for update;
  if not found then
    raise exception 'Plano não encontrado';
  end if;

  select pp.* into v_preco
  from public.planos_precos pp
  where pp.empresa_id = p_empresa_id
    and pp.plano_id = p_plano_id
    and pp.vigente_ate is null
  order by pp.vigente_desde_em desc, pp.criado_em desc
  limit 1
  for update;

  if v_preco.id is not null and v_preco.valor = p_valor then
    return v_preco.id;
  end if;
  if v_preco.id is not null then
    update public.planos_precos
    set vigente_ate = case when vigente_desde < current_date then current_date - 1 else current_date end
    where id = v_preco.id and empresa_id = p_empresa_id;
  end if;

  insert into public.planos_precos (empresa_id, plano_id, valor, moeda, vigente_desde, vigente_desde_em)
  values (p_empresa_id, p_plano_id, p_valor, coalesce(v_preco.moeda, 'BRL'), current_date, clock_timestamp())
  returning id into v_preco_id;

  insert into public.audit_logs (empresa_id, user_id, acao, entidade, entidade_id, metadados)
  values (
    p_empresa_id,
    auth.uid(),
    'plano.preco_alterado',
    'plano',
    p_plano_id,
    jsonb_build_object('preco_anterior', v_preco.valor, 'preco_novo', p_valor, 'vigente_desde', current_date)
  );

  return v_preco_id;
end;
$$;

create or replace function public.cadastrar_cliente_com_plano(
  p_empresa_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_plano_id uuid,
  p_valor_acordado numeric,
  p_dia_vencimento integer,
  p_observacoes text default null,
  p_creditos integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano public.planos%rowtype;
  v_preco numeric(12,2);
  v_resultado jsonb;
  v_assinatura_id uuid;
  v_cobranca_id uuid;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem cadastrar clientes' using errcode = '42501';
  end if;

  select p.* into v_plano
  from public.planos p
  where p.id = p_plano_id and p.empresa_id = p_empresa_id and p.ativo;
  if v_plano.id is null then
    raise exception 'Selecione um plano ativo desta empresa';
  end if;

  select pp.valor into v_preco
  from public.planos_precos pp
  where pp.empresa_id = p_empresa_id and pp.plano_id = p_plano_id and pp.vigente_ate is null
  order by pp.vigente_desde_em desc, pp.criado_em desc
  limit 1;
  if v_preco is null then
    raise exception 'O plano selecionado ainda não possui preço atual';
  end if;

  v_resultado := public.cadastrar_cliente_com_assinatura(
    p_empresa_id, p_nome, p_telefone, p_email, v_plano.nome, v_preco,
    p_dia_vencimento, p_observacoes, p_creditos, null, null
  );
  v_assinatura_id := nullif(v_resultado->>'assinatura_id', '')::uuid;
  v_cobranca_id := nullif(v_resultado->>'cobranca_id', '')::uuid;

  -- The legacy onboarding RPC resolves plans by name. Rebind the new
  -- subscription to the exact catalog row selected by the administrator.
  update public.assinaturas
  set plano_id = p_plano_id, atualizado_em = now()
  where id = v_assinatura_id and empresa_id = p_empresa_id;

  if p_valor_acordado is not null and p_valor_acordado is distinct from v_preco then
    if p_valor_acordado < 0 then
      raise exception 'Informe um valor acordado válido';
    end if;
    update public.assinaturas_financeiras
    set valor_acordado = p_valor_acordado, atualizado_em = now()
    where assinatura_id = v_assinatura_id and empresa_id = p_empresa_id;
    update public.cobrancas_financeiras
    set valor_original = p_valor_acordado, atualizado_em = now()
    where cobranca_id = v_cobranca_id and empresa_id = p_empresa_id;
  end if;

  return v_resultado;
end;
$$;

create or replace function public.atualizar_cliente_com_plano(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_assinatura_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_plano_id uuid,
  p_valor numeric,
  p_dia_vencimento integer,
  p_creditos integer,
  p_parcela_atual integer default null,
  p_parcelas_total integer default null,
  p_observacoes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano public.planos%rowtype;
  v_resultado jsonb;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem editar clientes' using errcode = '42501';
  end if;

  select p.* into v_plano
  from public.planos p
  where p.id = p_plano_id
    and p.empresa_id = p_empresa_id
    and (p.ativo or exists (
      select 1 from public.assinaturas s
      where s.id = p_assinatura_id and s.cliente_id = p_cliente_id
        and s.empresa_id = p_empresa_id and s.plano_id = p.id
    ));
  if v_plano.id is null then
    raise exception 'Selecione um plano ativo desta empresa';
  end if;

  v_resultado := public.atualizar_cliente_assinatura(
    p_empresa_id, p_cliente_id, p_assinatura_id, p_nome, p_telefone, p_email,
    v_plano.nome, p_valor, p_dia_vencimento, p_creditos,
    p_parcela_atual, p_parcelas_total, p_observacoes
  );
  update public.assinaturas
  set plano_id = p_plano_id, atualizado_em = now()
  where id = p_assinatura_id and cliente_id = p_cliente_id and empresa_id = p_empresa_id;
  return v_resultado;
end;
$$;

create or replace function public.buscar_clientes_paginados(
  p_empresa_id uuid,
  p_hoje date,
  p_busca text default '',
  p_filtro text default 'Todos',
  p_dia integer default null,
  p_offset integer default 0,
  p_limite integer default 25
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
  if p_filtro not in ('Todos', 'Ativos', 'Vencidos', 'Cancelados', 'Revisar ciclos') then
    raise exception 'Filtro de clientes inválido';
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
      latest_charge.competencia as ultima_competencia,
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
    where (
      nullif(trim(coalesce(p_busca, '')), '') is null
      or position(lower(trim(p_busca)) in lower(concat_ws(' ', d.nome, d.telefone, d.email))) > 0
    )
    and (p_filtro = 'Todos'
      or (p_filtro = 'Ativos' and d.status_ui = 'Ativo')
      or (p_filtro = 'Vencidos' and d.status_ui = 'Vencido')
      or (p_filtro = 'Cancelados' and d.status_ui = 'Cancelado')
      or (p_filtro = 'Revisar ciclos' and d.ciclo_revisao))
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

create or replace function public.buscar_cobrancas_paginadas(
  p_empresa_id uuid,
  p_hoje date,
  p_mes date,
  p_busca text default '',
  p_filtro text default 'Precisa de ação',
  p_offset integer default 0,
  p_limite integer default 25
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
  if p_filtro not in ('Precisa de ação', 'Atrasado', 'A vencer', 'Parcial', 'Pago', 'Todas') then
    raise exception 'Filtro de cobranças inválido';
  end if;
  v_mes_inicio := p_mes::timestamp at time zone 'America/Sao_Paulo';
  v_mes_fim := (p_mes + interval '1 month')::timestamp at time zone 'America/Sao_Paulo';

  with base as (
    select ch.id, ch.vencimento, ch.status_pagamento, ch.pago_em, ch.origem,
      coalesce(ch.creditos_previstos, 0) as creditos_previstos,
      cl.nome as cliente_nome, coalesce(pl.nome, 'Cobrança recorrente') as plano_nome,
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
      and (p_filtro = 'Todas'
        or (p_filtro = 'Precisa de ação' and d.precisa_acao)
        or (p_filtro <> 'Precisa de ação' and d.status_ui = p_filtro))
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

revoke all on function public.criar_plano_com_preco(uuid, text, text, text, integer, numeric) from public, anon;
revoke all on function public.alterar_preco_plano(uuid, uuid, numeric) from public, anon;
revoke all on function public.cadastrar_cliente_com_plano(uuid, text, text, text, uuid, numeric, integer, text, integer) from public, anon;
revoke all on function public.atualizar_cliente_com_plano(uuid, uuid, uuid, text, text, text, uuid, numeric, integer, integer, integer, integer, text) from public, anon;
revoke all on function public.buscar_clientes_paginados(uuid, date, text, text, integer, integer, integer) from public, anon;
revoke all on function public.buscar_cobrancas_paginadas(uuid, date, date, text, text, integer, integer) from public, anon;

grant execute on function public.criar_plano_com_preco(uuid, text, text, text, integer, numeric) to authenticated;
grant execute on function public.alterar_preco_plano(uuid, uuid, numeric) to authenticated;
grant execute on function public.cadastrar_cliente_com_plano(uuid, text, text, text, uuid, numeric, integer, text, integer) to authenticated;
grant execute on function public.atualizar_cliente_com_plano(uuid, uuid, uuid, text, text, text, uuid, numeric, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.buscar_clientes_paginados(uuid, date, text, text, integer, integer, integer) to authenticated;
grant execute on function public.buscar_cobrancas_paginadas(uuid, date, date, text, text, integer, integer) to authenticated;

commit;
