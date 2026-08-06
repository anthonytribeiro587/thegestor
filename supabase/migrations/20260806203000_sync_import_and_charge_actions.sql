-- thegestor | sincronizacao da planilha + acoes manuais de cobranca
-- Execute depois de 20260806200000_client_view_edit_actions.sql.

begin;

-- ============================================================
-- 1. REIMPORTACAO PASSA A SINCRONIZAR CLIENTES EXISTENTES
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
  v_atualizados integer := 0;
  v_total_creditos_usados integer := 0;
  v_total_creditos_previstos integer := 0;
  v_total_negociado numeric(12,2) := 0;
  v_total_pago numeric(12,2) := 0;
  v_total_receber numeric(12,2) := 0;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem sincronizar clientes' using errcode = '42501';
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
      raise exception 'Linha invalida na sincronizacao: %', v_item;
    end if;

    if (v_parcela_atual is null) <> (v_parcelas_total is null) then
      raise exception 'Ciclo de mensalidades incompleto para %', v_nome;
    end if;

    if v_parcela_atual is not null and (
      v_parcela_atual < 1 or v_parcelas_total < 1 or v_parcela_atual > v_parcelas_total
    ) then
      raise exception 'Ciclo de mensalidades invalido para %', v_nome;
    end if;

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

    -- Primeiro tenta localizar o cadastro existente pela combinacao usada na importacao inicial.
    select c.id, a.id
      into v_cliente_id, v_assinatura_id
    from public.clientes c
    join public.assinaturas a
      on a.cliente_id = c.id
     and a.empresa_id = c.empresa_id
    where c.empresa_id = p_empresa_id
      and lower(trim(c.nome)) = lower(v_nome)
      and a.dia_vencimento = v_dia
    order by a.criado_em desc
    limit 1;

    if v_cliente_id is null then
      insert into public.clientes (
        empresa_id, nome, telefone, email, status, origem, observacoes_operacionais
      ) values (
        p_empresa_id, v_nome, null, null, 'ativo', 'importacao_planilha', v_observacoes
      ) returning id into v_cliente_id;

      insert into public.assinaturas (
        empresa_id, cliente_id, plano_id, dia_vencimento, status,
        renovacao_automatica, creditos_por_ciclo, parcela_atual, parcelas_total
      ) values (
        p_empresa_id, v_cliente_id, v_plano_id, v_dia, 'ativa', true,
        v_creditos_total, v_parcela_atual, v_parcelas_total
      ) returning id into v_assinatura_id;

      v_importados := v_importados + 1;
    else
      update public.clientes
      set observacoes_operacionais = v_observacoes,
          atualizado_em = now()
      where id = v_cliente_id and empresa_id = p_empresa_id;

      update public.assinaturas
      set creditos_por_ciclo = v_creditos_total,
          parcela_atual = v_parcela_atual,
          parcelas_total = v_parcelas_total,
          atualizado_em = now()
      where id = v_assinatura_id and empresa_id = p_empresa_id;

      v_atualizados := v_atualizados + 1;
    end if;

    insert into public.assinaturas_financeiras (
      assinatura_id, empresa_id, valor_acordado, moeda
    ) values (
      v_assinatura_id, p_empresa_id, v_valor, 'BRL'
    )
    on conflict (assinatura_id) do update
      set valor_acordado = excluded.valor_acordado,
          atualizado_em = now();

    select c.id into v_cobranca_id
    from public.cobrancas c
    where c.empresa_id = p_empresa_id
      and c.assinatura_id = v_assinatura_id
      and c.competencia = p_competencia
    limit 1;

    if v_cobranca_id is null then
      v_cobranca_id := gen_random_uuid();
      insert into public.cobrancas (
        id, empresa_id, cliente_id, assinatura_id, competencia, vencimento,
        status_pagamento, pago_em, origem, external_reference,
        creditos_utilizados, creditos_previstos
      ) values (
        v_cobranca_id, p_empresa_id, v_cliente_id, v_assinatura_id,
        p_competencia, v_vencimento, v_status,
        case when v_status = 'pago' then now() else null end,
        'importacao_planilha', 'thegestor:import:' || v_cobranca_id::text,
        v_creditos_usados, v_creditos_previstos
      );
    else
      update public.cobrancas
      set vencimento = v_vencimento,
          status_pagamento = v_status,
          pago_em = case
            when v_status = 'pago' then coalesce(pago_em, now())
            else null
          end,
          creditos_utilizados = v_creditos_usados,
          creditos_previstos = v_creditos_previstos,
          atualizado_em = now()
      where id = v_cobranca_id and empresa_id = p_empresa_id;
    end if;

    insert into public.cobrancas_financeiras (
      cobranca_id, empresa_id, valor_original, valor_pago, moeda
    ) values (
      v_cobranca_id, p_empresa_id, v_valor,
      case when v_pago > 0 then v_pago else null end,
      'BRL'
    )
    on conflict (cobranca_id) do update
      set valor_original = excluded.valor_original,
          valor_pago = excluded.valor_pago,
          atualizado_em = now();

    -- Substitui o espelho de pagamento importado para refletir exatamente a XLS atual.
    delete from public.pagamentos
    where empresa_id = p_empresa_id
      and cobranca_id = v_cobranca_id
      and metodo = 'importacao_planilha';

    if v_pago > 0 then
      insert into public.pagamentos (
        empresa_id, cobranca_id, provedor, status, metodo, pago_em, payload_resumo
      ) values (
        p_empresa_id, v_cobranca_id, 'manual',
        case when v_receber <= 0 then 'pago' else 'parcial' end,
        'importacao_planilha', now(),
        jsonb_build_object('origem', 'Clientes.xlsx', 'valor_importado', v_pago, 'sincronizado_em', now())
      );
    end if;

    -- Ajusta fila conforme o estado sincronizado.
    if v_status = 'pago' and v_creditos_previstos > 0 then
      insert into public.tarefas_operacionais (
        empresa_id, cliente_id, cobranca_id, tipo, status, prioridade, observacao_operador
      ) values (
        p_empresa_id, v_cliente_id, v_cobranca_id, 'renovar', 'pendente', 'normal',
        'Sincronizado da planilha: pagamento concluido e renovacao ainda prevista.'
      ) on conflict do nothing;
    elsif v_status <> 'pago' then
      update public.tarefas_operacionais
      set status = 'cancelada', atualizado_em = now()
      where empresa_id = p_empresa_id
        and cobranca_id = v_cobranca_id
        and status = 'pendente'
        and tipo in ('renovar', 'novo_cliente');
    end if;

    insert into public.audit_logs (
      empresa_id, user_id, acao, entidade, entidade_id, metadados
    ) values (
      p_empresa_id, auth.uid(),
      case when v_atualizados > 0 and v_importados = 0 then 'cliente.sincronizado' else 'cliente.importado_ou_sincronizado' end,
      'cliente', v_cliente_id,
      jsonb_build_object(
        'cobranca_id', v_cobranca_id,
        'competencia', p_competencia,
        'valor_negociado', v_valor,
        'valor_pago', v_pago,
        'valor_a_receber', v_receber,
        'creditos_utilizados', v_creditos_usados,
        'creditos_previstos', v_creditos_previstos
      )
    );

    v_total_creditos_usados := v_total_creditos_usados + v_creditos_usados;
    v_total_creditos_previstos := v_total_creditos_previstos + v_creditos_previstos;
    v_total_negociado := v_total_negociado + v_valor;
    v_total_pago := v_total_pago + v_pago;
    v_total_receber := v_total_receber + v_receber;

    -- Evita carregar IDs da linha anterior no proximo loop.
    v_cliente_id := null;
    v_assinatura_id := null;
    v_cobranca_id := null;
  end loop;

  return jsonb_build_object(
    'importados', v_importados,
    'atualizados', v_atualizados,
    'ignorados', 0,
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

-- ============================================================
-- 2. REGISTRO MANUAL DE PAGAMENTO / CORRECAO DE COBRANCA
-- ============================================================

create or replace function public.registrar_pagamento_manual(
  p_empresa_id uuid,
  p_cobranca_id uuid,
  p_valor_pago numeric,
  p_metodo text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cobranca public.cobrancas%rowtype;
  v_financeiro public.cobrancas_financeiras%rowtype;
  v_novo_pago numeric(12,2);
  v_status text;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem registrar pagamentos' using errcode = '42501';
  end if;

  if p_valor_pago is null or p_valor_pago < 0 then
    raise exception 'Valor pago invalido';
  end if;

  select * into v_cobranca
  from public.cobrancas
  where id = p_cobranca_id and empresa_id = p_empresa_id
  for update;

  if v_cobranca.id is null then
    raise exception 'Cobranca nao encontrada';
  end if;

  select * into v_financeiro
  from public.cobrancas_financeiras
  where cobranca_id = p_cobranca_id and empresa_id = p_empresa_id
  for update;

  if v_financeiro.cobranca_id is null then
    raise exception 'Dados financeiros da cobranca nao encontrados';
  end if;

  v_novo_pago := least(p_valor_pago, v_financeiro.valor_original);
  v_status := case
    when v_novo_pago >= v_financeiro.valor_original then 'pago'
    when v_cobranca.vencimento < current_date then 'atrasado'
    else 'pendente'
  end;

  update public.cobrancas_financeiras
  set valor_pago = case when v_novo_pago > 0 then v_novo_pago else null end,
      atualizado_em = now()
  where cobranca_id = p_cobranca_id and empresa_id = p_empresa_id;

  update public.cobrancas
  set status_pagamento = v_status,
      pago_em = case when v_status = 'pago' then coalesce(pago_em, now()) else null end,
      atualizado_em = now()
  where id = p_cobranca_id and empresa_id = p_empresa_id;

  insert into public.pagamentos (
    empresa_id, cobranca_id, provedor, status, metodo, pago_em, payload_resumo
  ) values (
    p_empresa_id, p_cobranca_id, 'manual',
    case when v_status = 'pago' then 'pago' when v_novo_pago > 0 then 'parcial' else 'zerado' end,
    nullif(trim(coalesce(p_metodo, 'manual')), ''),
    case when v_novo_pago > 0 then now() else null end,
    jsonb_build_object('valor_informado', v_novo_pago, 'origem', 'painel_admin')
  );

  if v_status <> 'pago' then
    update public.tarefas_operacionais
    set status = 'cancelada', atualizado_em = now()
    where empresa_id = p_empresa_id
      and cobranca_id = p_cobranca_id
      and status = 'pendente'
      and tipo in ('renovar', 'novo_cliente');
  end if;

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  ) values (
    p_empresa_id, auth.uid(), 'cobranca.pagamento_manual', 'cobranca', p_cobranca_id,
    jsonb_build_object('valor_pago', v_novo_pago, 'status', v_status, 'metodo', p_metodo)
  );

  return jsonb_build_object(
    'atualizado', true,
    'status', v_status,
    'valor_pago', v_novo_pago,
    'saldo', greatest(v_financeiro.valor_original - v_novo_pago, 0)
  );
end;
$$;

revoke all on function public.registrar_pagamento_manual(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.registrar_pagamento_manual(uuid, uuid, numeric, text) to authenticated;

commit;
