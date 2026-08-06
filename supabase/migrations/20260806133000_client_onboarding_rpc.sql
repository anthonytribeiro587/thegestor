-- thegestor | cadastro atomico de cliente + assinatura + primeira cobranca
-- Execute depois da migration inicial.

begin;

create or replace function public.cadastrar_cliente_com_assinatura(
  p_empresa_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_plano_nome text,
  p_valor numeric,
  p_dia_vencimento integer,
  p_observacoes text default null
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
  v_valor_atual numeric(12,2);
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

  if p_telefone is null or char_length(trim(p_telefone)) < 8 then
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

  select p.id
    into v_plano_id
  from public.planos p
  where p.empresa_id = p_empresa_id
    and lower(trim(p.nome)) = lower(trim(p_plano_nome))
  limit 1;

  if v_plano_id is null then
    insert into public.planos (empresa_id, nome, periodicidade, ativo)
    values (p_empresa_id, trim(p_plano_nome), 'mensal', true)
    returning id into v_plano_id;
  end if;

  select pp.valor
    into v_valor_atual
  from public.planos_precos pp
  where pp.empresa_id = p_empresa_id
    and pp.plano_id = v_plano_id
    and pp.vigente_ate is null
  order by pp.vigente_desde desc, pp.criado_em desc
  limit 1;

  if v_valor_atual is null or v_valor_atual is distinct from p_valor then
    update public.planos_precos
      set vigente_ate = current_date - 1
    where empresa_id = p_empresa_id
      and plano_id = v_plano_id
      and vigente_ate is null;

    insert into public.planos_precos (empresa_id, plano_id, valor, moeda, vigente_desde)
    values (p_empresa_id, v_plano_id, p_valor, 'BRL', current_date);
  end if;

  insert into public.clientes (
    empresa_id, nome, telefone, email, status, origem, observacoes_operacionais
  )
  values (
    p_empresa_id,
    trim(p_nome),
    trim(p_telefone),
    nullif(trim(coalesce(p_email, '')), ''),
    'ativo',
    'manual',
    nullif(trim(coalesce(p_observacoes, '')), '')
  )
  returning id into v_cliente_id;

  insert into public.assinaturas (
    empresa_id, cliente_id, plano_id, dia_vencimento, status, renovacao_automatica
  )
  values (
    p_empresa_id, v_cliente_id, v_plano_id, p_dia_vencimento, 'ativa', true
  )
  returning id into v_assinatura_id;

  -- Primeira cobranca: proximo vencimento igual ou posterior a hoje.
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
    status_pagamento, origem, external_reference
  )
  values (
    v_cobranca_id,
    p_empresa_id,
    v_cliente_id,
    v_assinatura_id,
    v_competencia,
    v_vencimento,
    'pendente',
    'sistema',
    'thegestor:' || v_cobranca_id::text
  );

  insert into public.cobrancas_financeiras (
    cobranca_id, empresa_id, valor_original, moeda
  )
  values (
    v_cobranca_id, p_empresa_id, p_valor, 'BRL'
  );

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  )
  values (
    p_empresa_id,
    auth.uid(),
    'cliente.criado',
    'cliente',
    v_cliente_id,
    jsonb_build_object('assinatura_id', v_assinatura_id, 'cobranca_id', v_cobranca_id)
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

revoke all on function public.cadastrar_cliente_com_assinatura(uuid, text, text, text, text, numeric, integer, text) from public, anon;
grant execute on function public.cadastrar_cliente_com_assinatura(uuid, text, text, text, text, numeric, integer, text) to authenticated;

commit;
