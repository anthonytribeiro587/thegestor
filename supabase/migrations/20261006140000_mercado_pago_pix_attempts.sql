-- Persist a Pix attempt before contacting Mercado Pago. Retrying an uncertain
-- provider request then reuses the same idempotency key and remote order.
begin;

create or replace function public.iniciar_pix_mercado_pago(
  p_empresa_id uuid,
  p_cobranca_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.cobrancas%rowtype;
  v_financial public.cobrancas_financeiras%rowtype;
  v_existing public.pagamentos%rowtype;
  v_attempt public.pagamentos%rowtype;
  v_email text;
  v_balance numeric(12,2);
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem gerar Pix' using errcode = '42501';
  end if;

  select * into v_charge
  from public.cobrancas c
  where c.id = p_cobranca_id and c.empresa_id = p_empresa_id
  for update;
  if v_charge.id is null then
    return jsonb_build_object('reused', false, 'reason', 'not_found');
  end if;
  if v_charge.status_pagamento in ('pago', 'cancelado') then
    return jsonb_build_object('reused', false, 'reason', 'charge_closed');
  end if;

  select * into v_financial
  from public.cobrancas_financeiras cf
  where cf.cobranca_id = p_cobranca_id and cf.empresa_id = p_empresa_id
  for update;
  if v_financial.cobranca_id is null then
    return jsonb_build_object('reused', false, 'reason', 'missing_financial');
  end if;
  v_balance := greatest(v_financial.valor_original + v_financial.acrescimo - v_financial.desconto - coalesce(v_financial.valor_pago, 0), 0);
  if v_balance <= 0 then
    return jsonb_build_object('reused', false, 'reason', 'no_balance');
  end if;

  select nullif(trim(cl.email), '') into v_email
  from public.clientes cl
  where cl.id = v_charge.cliente_id and cl.empresa_id = p_empresa_id;

  select * into v_existing
  from public.pagamentos p
  where p.empresa_id = p_empresa_id
    and p.cobranca_id = p_cobranca_id
    and p.provedor = 'mercado_pago'
    and p.provider_order_id is not null
    and (p.expira_em is null or p.expira_em > now())
  order by p.criado_em desc
  limit 1
  for update;

  if v_existing.id is not null then
    if nullif(v_existing.payload_resumo->>'thegestor_balance', '')::numeric is distinct from v_balance then
      return jsonb_build_object('reused', false, 'reason', 'existing_order_amount_mismatch');
    end if;
    return jsonb_build_object(
      'reused', true,
      'orderId', v_existing.provider_order_id,
      'paymentId', v_existing.provider_payment_id,
      'status', v_existing.status,
      'ticketUrl', v_existing.pix_ticket_url,
      'qrCode', v_existing.pix_qr_code,
      'qrCodeBase64', v_existing.pix_qr_code_base64,
      'expiresAt', v_existing.expira_em,
      'amount', v_balance,
      'payerEmail', v_email
    );
  end if;

  select * into v_attempt
  from public.pagamentos p
  where p.empresa_id = p_empresa_id
    and p.cobranca_id = p_cobranca_id
    and p.provedor = 'mercado_pago'
    and p.provider_order_id is null
    and p.status = 'criando'
    and p.criado_em >= now() - interval '24 hours'
  order by p.criado_em desc
  limit 1
  for update;

  if v_attempt.id is null then
    insert into public.pagamentos (
      empresa_id, cobranca_id, provedor, status, metodo, idempotency_key,
      payload_resumo
    ) values (
      p_empresa_id, p_cobranca_id, 'mercado_pago', 'criando', 'pix', gen_random_uuid()::text,
      jsonb_build_object('thegestor_balance', v_balance, 'thegestor_external_reference', 'thegestor:' || p_cobranca_id::text)
    ) returning * into v_attempt;
  end if;

  return jsonb_build_object(
    'reused', false,
    'attemptId', v_attempt.id,
    'idempotencyKey', v_attempt.idempotency_key,
    'amount', v_balance,
    'payerEmail', v_email
  );
end;
$$;

revoke all on function public.iniciar_pix_mercado_pago(uuid, uuid) from public, anon;
grant execute on function public.iniciar_pix_mercado_pago(uuid, uuid) to authenticated;

-- Keep the existing public RPC contract while updating an attempt row in place
-- when one has already been reserved by iniciar_pix_mercado_pago.
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
    raise exception 'Cobrança não encontrada';
  end if;

  select p.id into v_pagamento_id
  from public.pagamentos p
  where p.idempotency_key = p_idempotency_key
    and p.empresa_id = p_empresa_id
    and p.cobranca_id = p_cobranca_id
    and p.provedor = 'mercado_pago'
  for update;

  if v_pagamento_id is not null then
    update public.pagamentos
    set provider_payment_id = nullif(p_provider_payment_id, ''),
        provider_order_id = p_provider_order_id,
        status = p_status,
        metodo = 'pix',
        pix_ticket_url = p_ticket_url,
        pix_qr_code = p_qr_code,
        pix_qr_code_base64 = p_qr_code_base64,
        expira_em = p_expira_em,
        payload_resumo = coalesce(p_payload_resumo, '{}'::jsonb),
        atualizado_em = now()
    where id = v_pagamento_id;
  else
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
  end if;

  insert into public.integracoes (empresa_id, provedor, nome, status, config_publica, ultimo_sync_em)
  values (p_empresa_id, 'mercado_pago', 'principal', 'conectada', jsonb_build_object('api', 'orders', 'payment_method', 'pix'), now())
  on conflict (empresa_id, provedor, nome)
  do update set status = 'conectada', config_publica = integracoes.config_publica || excluded.config_publica,
    ultimo_sync_em = now(), ultimo_erro = null;

  insert into public.audit_logs (empresa_id, user_id, acao, entidade, entidade_id, metadados)
  values (p_empresa_id, auth.uid(), 'mercado_pago.pix_gerado', 'cobranca', p_cobranca_id,
    jsonb_build_object('order_id', p_provider_order_id, 'payment_id', p_provider_payment_id));

  return v_pagamento_id;
end;
$$;

revoke all on function public.registrar_pix_mercado_pago(uuid, uuid, text, text, text, text, text, text, timestamptz, text, jsonb) from public, anon;
grant execute on function public.registrar_pix_mercado_pago(uuid, uuid, text, text, text, text, text, text, timestamptz, text, jsonb) to authenticated;

commit;
