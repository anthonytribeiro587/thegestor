-- thegestor | Mercado Pago Orders API + Pix + webhook idempotente
-- Execute depois das migrations de cobrancas/creditos.

begin;

alter table public.pagamentos
  add column if not exists provider_order_id text,
  add column if not exists pix_ticket_url text,
  add column if not exists pix_qr_code text,
  add column if not exists pix_qr_code_base64 text,
  add column if not exists expira_em timestamptz,
  add column if not exists idempotency_key text;

create unique index if not exists pagamentos_mp_order_unique_idx
  on public.pagamentos(provider_order_id)
  where provedor = 'mercado_pago' and provider_order_id is not null;

create index if not exists pagamentos_mp_cobranca_idx
  on public.pagamentos(cobranca_id, criado_em desc)
  where provedor = 'mercado_pago';

create table if not exists public.eventos_integracao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade,
  provedor text not null check (provedor in ('mercado_pago', 'whatsapp_evolution')),
  event_id text not null,
  recurso_id text,
  tipo text,
  acao text,
  request_id text,
  live_mode boolean,
  status_processamento text not null default 'recebido' check (status_processamento in ('recebido', 'processado', 'ignorado', 'erro')),
  payload_resumo jsonb not null default '{}'::jsonb,
  erro text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  unique (provedor, event_id)
);

create index if not exists eventos_integracao_empresa_data_idx
  on public.eventos_integracao(empresa_id, recebido_em desc);

alter table public.eventos_integracao enable row level security;
revoke all on public.eventos_integracao from anon;
revoke insert, update, delete on public.eventos_integracao from authenticated;
grant select on public.eventos_integracao to authenticated;

drop policy if exists eventos_integracao_admin_select on public.eventos_integracao;
create policy eventos_integracao_admin_select
  on public.eventos_integracao
  for select
  to authenticated
  using (empresa_id is not null and private.e_admin(empresa_id));

-- Registra os dados retornados ao criar um Pix. O token nunca passa pelo banco.
create or replace function public.registrar_pix_mercado_pago(
  p_empresa_id uuid,
  p_cobranca_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_status text,
  p_ticket_url text,
  p_qr_code text,
  p_qr_code_base64 text,
  p_expira_em timestamptz,
  p_idempotency_key text,
  p_payload_resumo jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagamento_id uuid;
  v_cliente_id uuid;
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem gerar Pix' using errcode = '42501';
  end if;

  select c.cliente_id into v_cliente_id
  from public.cobrancas c
  where c.id = p_cobranca_id and c.empresa_id = p_empresa_id;

  if v_cliente_id is null then
    raise exception 'Cobranca nao encontrada';
  end if;

  insert into public.pagamentos (
    empresa_id, cobranca_id, provedor, provider_payment_id, provider_order_id,
    status, metodo, pix_ticket_url, pix_qr_code, pix_qr_code_base64,
    expira_em, idempotency_key, payload_resumo
  ) values (
    p_empresa_id, p_cobranca_id, 'mercado_pago', nullif(p_provider_payment_id, ''), p_provider_order_id,
    p_status, 'pix', p_ticket_url, p_qr_code, p_qr_code_base64,
    p_expira_em, p_idempotency_key, coalesce(p_payload_resumo, '{}'::jsonb)
  )
  on conflict (provider_order_id) where provedor = 'mercado_pago' and provider_order_id is not null
  do update set
    provider_payment_id = excluded.provider_payment_id,
    status = excluded.status,
    metodo = 'pix',
    pix_ticket_url = excluded.pix_ticket_url,
    pix_qr_code = excluded.pix_qr_code,
    pix_qr_code_base64 = excluded.pix_qr_code_base64,
    expira_em = excluded.expira_em,
    idempotency_key = excluded.idempotency_key,
    payload_resumo = excluded.payload_resumo,
    atualizado_em = now()
  returning id into v_pagamento_id;

  insert into public.integracoes (empresa_id, provedor, nome, status, config_publica, ultimo_sync_em)
  values (
    p_empresa_id,
    'mercado_pago',
    'principal',
    'conectada',
    jsonb_build_object('api', 'orders', 'payment_method', 'pix'),
    now()
  )
  on conflict (empresa_id, provedor, nome)
  do update set
    status = 'conectada',
    config_publica = public.integracoes.config_publica || excluded.config_publica,
    ultimo_sync_em = now(),
    ultimo_erro = null;

  insert into public.audit_logs (empresa_id, user_id, acao, entidade, entidade_id, metadados)
  values (
    p_empresa_id, auth.uid(), 'mercado_pago.pix_gerado', 'cobranca', p_cobranca_id,
    jsonb_build_object('order_id', p_provider_order_id, 'payment_id', p_provider_payment_id)
  );

  return v_pagamento_id;
end;
$$;

revoke all on function public.registrar_pix_mercado_pago(uuid, uuid, text, text, text, text, text, text, timestamptz, text, jsonb) from public, anon;
grant execute on function public.registrar_pix_mercado_pago(uuid, uuid, text, text, text, text, text, text, timestamptz, text, jsonb) to authenticated;

-- Aplicada exclusivamente pelo backend com service_role apos consultar a Order no MP.
create or replace function public.aplicar_order_mercado_pago(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_external_reference text,
  p_status text,
  p_status_detail text,
  p_total_amount numeric,
  p_payload_resumo jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagamento public.pagamentos%rowtype;
  v_cobranca public.cobrancas%rowtype;
  v_cliente public.clientes%rowtype;
  v_pago boolean := false;
  v_tipo_tarefa text;
begin
  select * into v_pagamento
  from public.pagamentos p
  where p.provedor = 'mercado_pago'
    and p.provider_order_id = p_provider_order_id
  order by p.criado_em desc
  limit 1
  for update;

  if v_pagamento.id is null and p_external_reference like 'thegestor:%' then
    select c.* into v_cobranca
    from public.cobrancas c
    where c.id::text = split_part(p_external_reference, ':', 2)
    limit 1
    for update;
  elsif v_pagamento.id is not null then
    select c.* into v_cobranca
    from public.cobrancas c
    where c.id = v_pagamento.cobranca_id
    for update;
  end if;

  if v_cobranca.id is null then
    return jsonb_build_object('aplicado', false, 'motivo', 'cobranca_nao_encontrada');
  end if;

  select * into v_cliente
  from public.clientes c
  where c.id = v_cobranca.cliente_id;

  v_pago := p_status = 'processed' and p_status_detail = 'accredited';

  if v_pagamento.id is null then
    insert into public.pagamentos (
      empresa_id, cobranca_id, provedor, provider_payment_id, provider_order_id,
      status, metodo, pago_em, payload_resumo
    ) values (
      v_cobranca.empresa_id, v_cobranca.id, 'mercado_pago', nullif(p_provider_payment_id, ''), p_provider_order_id,
      case when v_pago then 'pago' else p_status end,
      'pix', case when v_pago then now() else null end, coalesce(p_payload_resumo, '{}'::jsonb)
    ) returning * into v_pagamento;
  else
    update public.pagamentos
    set provider_payment_id = coalesce(nullif(p_provider_payment_id, ''), provider_payment_id),
        status = case when v_pago then 'pago' else p_status end,
        pago_em = case when v_pago then coalesce(pago_em, now()) else pago_em end,
        payload_resumo = coalesce(p_payload_resumo, '{}'::jsonb),
        atualizado_em = now()
    where id = v_pagamento.id;
  end if;

  if v_pago then
    update public.cobrancas_financeiras
    set valor_pago = least(greatest(coalesce(p_total_amount, valor_original), 0), valor_original),
        atualizado_em = now()
    where cobranca_id = v_cobranca.id;

    update public.cobrancas
    set status_pagamento = 'pago',
        pago_em = coalesce(pago_em, now()),
        atualizado_em = now()
    where id = v_cobranca.id;

    v_tipo_tarefa := case when v_cliente.status = 'pendente' then 'novo_cliente' else 'renovar' end;

    if coalesce(v_cobranca.creditos_previstos, 0) > 0
       and not exists (
         select 1 from public.tarefas_operacionais t
         where t.cobranca_id = v_cobranca.id
           and t.tipo in ('renovar', 'novo_cliente')
           and t.status <> 'cancelada'
       ) then
      insert into public.tarefas_operacionais (
        empresa_id, cliente_id, cobranca_id, tipo, status, prioridade, observacao_operador
      ) values (
        v_cobranca.empresa_id, v_cobranca.cliente_id, v_cobranca.id,
        v_tipo_tarefa, 'pendente', 'normal', 'Pagamento confirmado automaticamente pelo Mercado Pago.'
      );
    end if;
  elsif v_cobranca.status_pagamento <> 'pago' then
    update public.cobrancas
    set status_pagamento = case when v_cobranca.vencimento < current_date then 'atrasado' else 'pendente' end,
        atualizado_em = now()
    where id = v_cobranca.id;
  end if;

  update public.integracoes
  set status = 'conectada', ultimo_sync_em = now(), ultimo_erro = null
  where empresa_id = v_cobranca.empresa_id and provedor = 'mercado_pago' and nome = 'principal';

  return jsonb_build_object(
    'aplicado', true,
    'empresa_id', v_cobranca.empresa_id,
    'cobranca_id', v_cobranca.id,
    'pago', v_pago
  );
end;
$$;

revoke all on function public.aplicar_order_mercado_pago(text, text, text, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_order_mercado_pago(text, text, text, text, text, numeric, jsonb) to service_role;

commit;
