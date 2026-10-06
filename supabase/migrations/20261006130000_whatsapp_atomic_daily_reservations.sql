-- Serialize WhatsApp reservations per tenant/day so overlapping cron runs
-- cannot pass the same daily limit check concurrently.
begin;

create index if not exists mensagens_cobranca_empresa_ativas_dia_idx
  on public.mensagens_cobranca (empresa_id, criado_em)
  where status in ('pendente', 'enviada', 'erro');

create or replace function public.reservar_mensagem_cobranca(
  p_empresa_id uuid,
  p_cobranca_id uuid,
  p_cliente_id uuid,
  p_automacao_id uuid,
  p_tipo text,
  p_hoje date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_telefone text;
  v_count integer;
  v_message_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Somente o backend pode reservar mensagens' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_empresa_id::text || ':' || p_hoje::text, 0));

  select ce.whatsapp_limite_diario into v_limite
  from public.configuracoes_empresa ce
  where ce.empresa_id = p_empresa_id and ce.whatsapp_ativo;
  if v_limite is null then
    return jsonb_build_object('reserved', false, 'reason', 'disabled');
  end if;

  if not exists (
    select 1 from public.automacoes_mensagem a
    where a.id = p_automacao_id and a.empresa_id = p_empresa_id and a.ativo
  ) then
    return jsonb_build_object('reserved', false, 'reason', 'automation_disabled');
  end if;

  select cl.telefone into v_telefone
  from public.cobrancas ch
  join public.clientes cl on cl.id = ch.cliente_id and cl.empresa_id = p_empresa_id
  where ch.id = p_cobranca_id and ch.empresa_id = p_empresa_id
    and ch.cliente_id = p_cliente_id
    and ch.status_pagamento in ('pendente', 'atrasado')
    and cl.status = 'ativo';
  if nullif(trim(coalesce(v_telefone, '')), '') is null then
    return jsonb_build_object('reserved', false, 'reason', 'ineligible');
  end if;

  if exists (
    select 1 from public.mensagens_cobranca m
    where m.cobranca_id = p_cobranca_id and m.automacao_id = p_automacao_id
  ) then
    return jsonb_build_object('reserved', false, 'reason', 'duplicate');
  end if;

  v_start := p_hoje::timestamp at time zone 'America/Sao_Paulo';
  v_end := (p_hoje + 1)::timestamp at time zone 'America/Sao_Paulo';
  select count(*) into v_count
  from public.mensagens_cobranca m
  where m.empresa_id = p_empresa_id
    and m.status in ('pendente', 'enviada', 'erro')
    and m.criado_em >= v_start and m.criado_em < v_end;

  if v_count >= v_limite then
    return jsonb_build_object('reserved', false, 'reason', 'daily_limit');
  end if;

  insert into public.mensagens_cobranca (
    empresa_id, cobranca_id, cliente_id, automacao_id, tipo, provedor, status, telefone
  ) values (
    p_empresa_id, p_cobranca_id, p_cliente_id, p_automacao_id, p_tipo, 'evolution', 'pendente', v_telefone
  )
  on conflict do nothing
  returning id into v_message_id;

  if v_message_id is null then
    return jsonb_build_object('reserved', false, 'reason', 'duplicate');
  end if;

  return jsonb_build_object('reserved', true, 'id', v_message_id, 'telefone', v_telefone);
end;
$$;

revoke all on function public.reservar_mensagem_cobranca(uuid, uuid, uuid, uuid, text, date) from public, anon, authenticated;
grant execute on function public.reservar_mensagem_cobranca(uuid, uuid, uuid, uuid, text, date) to service_role;

commit;
