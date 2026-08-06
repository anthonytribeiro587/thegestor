-- thegestor | ficha, edicao, cancelamento e reativacao de clientes
-- Execute depois das migrations de creditos.

begin;

create or replace function public.atualizar_cliente_assinatura(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_assinatura_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_plano_nome text,
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
  v_plano_id uuid;
  v_cliente public.clientes%rowtype;
  v_assinatura public.assinaturas%rowtype;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem editar clientes' using errcode = '42501';
  end if;

  select * into v_cliente
  from public.clientes
  where id = p_cliente_id and empresa_id = p_empresa_id
  for update;

  if v_cliente.id is null then
    raise exception 'Cliente nao encontrado';
  end if;

  select * into v_assinatura
  from public.assinaturas
  where id = p_assinatura_id
    and cliente_id = p_cliente_id
    and empresa_id = p_empresa_id
  for update;

  if v_assinatura.id is null then
    raise exception 'Assinatura nao encontrada';
  end if;

  if p_nome is null or char_length(trim(p_nome)) < 2 then
    raise exception 'Nome do cliente invalido';
  end if;

  if nullif(trim(coalesce(p_telefone, '')), '') is not null
     and char_length(trim(p_telefone)) < 8 then
    raise exception 'Telefone invalido';
  end if;

  if nullif(trim(coalesce(p_email, '')), '') is not null
     and position('@' in trim(p_email)) < 2 then
    raise exception 'E-mail invalido';
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

  update public.clientes
  set nome = trim(p_nome),
      telefone = nullif(trim(coalesce(p_telefone, '')), ''),
      email = nullif(trim(coalesce(p_email, '')), ''),
      observacoes_operacionais = nullif(trim(coalesce(p_observacoes, '')), ''),
      atualizado_em = now()
  where id = p_cliente_id and empresa_id = p_empresa_id;

  update public.assinaturas
  set plano_id = v_plano_id,
      dia_vencimento = p_dia_vencimento,
      creditos_por_ciclo = p_creditos,
      parcela_atual = p_parcela_atual,
      parcelas_total = p_parcelas_total,
      atualizado_em = now()
  where id = p_assinatura_id and empresa_id = p_empresa_id;

  insert into public.assinaturas_financeiras (
    assinatura_id, empresa_id, valor_acordado, moeda
  ) values (
    p_assinatura_id, p_empresa_id, p_valor, 'BRL'
  )
  on conflict (assinatura_id) do update
    set valor_acordado = excluded.valor_acordado,
        atualizado_em = now();

  -- Mantem cobranças ainda abertas coerentes com o contrato atual.
  update public.cobrancas c
  set vencimento = make_date(
        extract(year from c.competencia)::integer,
        extract(month from c.competencia)::integer,
        least(
          p_dia_vencimento,
          extract(day from (date_trunc('month', c.competencia) + interval '1 month - 1 day'))::integer
        )
      ),
      creditos_previstos = greatest(p_creditos - coalesce(c.creditos_utilizados, 0), 0),
      atualizado_em = now()
  where c.empresa_id = p_empresa_id
    and c.assinatura_id = p_assinatura_id
    and c.status_pagamento in ('pendente', 'atrasado');

  update public.cobrancas_financeiras cf
  set valor_original = p_valor,
      atualizado_em = now()
  from public.cobrancas c
  where cf.cobranca_id = c.id
    and cf.empresa_id = p_empresa_id
    and c.empresa_id = p_empresa_id
    and c.assinatura_id = p_assinatura_id
    and c.status_pagamento in ('pendente', 'atrasado');

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  ) values (
    p_empresa_id,
    auth.uid(),
    'cliente.atualizado',
    'cliente',
    p_cliente_id,
    jsonb_build_object(
      'assinatura_id', p_assinatura_id,
      'plano_id', v_plano_id,
      'dia_vencimento', p_dia_vencimento,
      'creditos', p_creditos,
      'valor', p_valor
    )
  );

  return jsonb_build_object(
    'atualizado', true,
    'cliente_id', p_cliente_id,
    'assinatura_id', p_assinatura_id
  );
end;
$$;

revoke all on function public.atualizar_cliente_assinatura(uuid, uuid, uuid, text, text, text, text, numeric, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.atualizar_cliente_assinatura(uuid, uuid, uuid, text, text, text, text, numeric, integer, integer, integer, integer, text) to authenticated;

create or replace function public.alterar_status_cliente(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_assinatura_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente public.clientes%rowtype;
  v_assinatura public.assinaturas%rowtype;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem alterar o status do cliente' using errcode = '42501';
  end if;

  if p_status not in ('ativo', 'cancelado') then
    raise exception 'Status invalido';
  end if;

  select * into v_cliente
  from public.clientes
  where id = p_cliente_id and empresa_id = p_empresa_id
  for update;

  if v_cliente.id is null then
    raise exception 'Cliente nao encontrado';
  end if;

  select * into v_assinatura
  from public.assinaturas
  where id = p_assinatura_id
    and cliente_id = p_cliente_id
    and empresa_id = p_empresa_id
  for update;

  if v_assinatura.id is null then
    raise exception 'Assinatura nao encontrada';
  end if;

  if p_status = 'cancelado' then
    update public.clientes
    set status = 'cancelado', atualizado_em = now()
    where id = p_cliente_id and empresa_id = p_empresa_id;

    update public.assinaturas
    set status = 'cancelada', cancelada_em = now(), renovacao_automatica = false, atualizado_em = now()
    where id = p_assinatura_id and empresa_id = p_empresa_id;

    update public.cobrancas
    set status_pagamento = 'cancelado', atualizado_em = now()
    where empresa_id = p_empresa_id
      and assinatura_id = p_assinatura_id
      and status_pagamento in ('pendente', 'atrasado');

    update public.tarefas_operacionais
    set status = 'cancelada', atualizado_em = now()
    where empresa_id = p_empresa_id
      and cliente_id = p_cliente_id
      and status = 'pendente';
  else
    update public.clientes
    set status = 'ativo', atualizado_em = now()
    where id = p_cliente_id and empresa_id = p_empresa_id;

    update public.assinaturas
    set status = 'ativa', cancelada_em = null, renovacao_automatica = true, atualizado_em = now()
    where id = p_assinatura_id and empresa_id = p_empresa_id;
  end if;

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  ) values (
    p_empresa_id,
    auth.uid(),
    case when p_status = 'cancelado' then 'cliente.cancelado' else 'cliente.reativado' end,
    'cliente',
    p_cliente_id,
    jsonb_build_object('assinatura_id', p_assinatura_id, 'status', p_status)
  );

  return jsonb_build_object('alterado', true, 'status', p_status);
end;
$$;

revoke all on function public.alterar_status_cliente(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.alterar_status_cliente(uuid, uuid, uuid, text) to authenticated;

commit;
