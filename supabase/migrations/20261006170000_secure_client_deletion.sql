-- Exclusão definitiva de clientes sem histórico financeiro confirmado.
-- Clientes com recebimentos continuam canceláveis pela RPC já existente.

begin;

create or replace function public.excluir_cliente(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente public.clientes%rowtype;
  v_cobrancas integer := 0;
  v_pagamentos integer := 0;
  v_pagamentos_confirmados integer := 0;
  v_cobrancas_excluidas integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;

  if not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores da empresa podem excluir clientes' using errcode = '42501';
  end if;

  select c.* into v_cliente
  from public.clientes c
  where c.id = p_cliente_id and c.empresa_id = p_empresa_id
  for update;

  -- Não revela se o ID informado existe em outro tenant.
  if v_cliente.id is null then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  -- Serializa com criação/atualização de pagamentos que referenciam cobranças.
  perform 1
  from public.cobrancas c
  where c.empresa_id = p_empresa_id and c.cliente_id = p_cliente_id
  for update;

  select count(*)::integer into v_cobrancas
  from public.cobrancas c
  where c.empresa_id = p_empresa_id and c.cliente_id = p_cliente_id;

  select count(*)::integer into v_pagamentos
  from public.pagamentos p
  join public.cobrancas c on c.id = p.cobranca_id and c.empresa_id = p.empresa_id
  where c.empresa_id = p_empresa_id and c.cliente_id = p_cliente_id;

  select count(*)::integer into v_pagamentos_confirmados
  from public.cobrancas c
  left join public.cobrancas_financeiras cf on cf.cobranca_id = c.id and cf.empresa_id = c.empresa_id
  where c.empresa_id = p_empresa_id
    and c.cliente_id = p_cliente_id
    and (
      coalesce(cf.valor_pago, 0) > 0
      or (
        coalesce(cf.valor_original, 0) > 0
        and (c.pago_em is not null or c.status_pagamento = 'pago')
      )
      or exists (
        select 1
        from public.pagamentos p
        where p.empresa_id = c.empresa_id
          and p.cobranca_id = c.id
          and (p.pago_em is not null or p.status in ('approved', 'pago', 'parcial'))
      )
    );

  if v_pagamentos_confirmados > 0 then
    return jsonb_build_object(
      'deleted', false,
      'reason', 'financial_history',
      'nome', v_cliente.nome,
      'cobrancas', v_cobrancas,
      'pagamentos', v_pagamentos
    );
  end if;

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  ) values (
    p_empresa_id,
    auth.uid(),
    'cliente.excluido',
    'cliente',
    p_cliente_id,
    jsonb_build_object(
      'nome', v_cliente.nome,
      'cobrancas_removidas', v_cobrancas,
      'pagamentos_removidos', v_pagamentos,
      'motivo', nullif(left(trim(coalesce(p_motivo, '')), 500), '')
    )
  );

  -- Removemos dependências explicitamente para não deixar mensagens sem vínculo
  -- nem tarefas operacionais órfãs; demais dependências usam ON DELETE CASCADE.
  delete from public.tarefas_operacionais t
  where t.empresa_id = p_empresa_id
    and (t.cliente_id = p_cliente_id or t.cobranca_id in (
      select c.id from public.cobrancas c where c.empresa_id = p_empresa_id and c.cliente_id = p_cliente_id
    ));

  delete from public.mensagens_whatsapp m
  where m.empresa_id = p_empresa_id
    and (m.cliente_id = p_cliente_id or m.cobranca_id in (
      select c.id from public.cobrancas c where c.empresa_id = p_empresa_id and c.cliente_id = p_cliente_id
    ));

  delete from public.pagamentos p
  using public.cobrancas c
  where p.cobranca_id = c.id
    and p.empresa_id = p_empresa_id
    and c.empresa_id = p_empresa_id
    and c.cliente_id = p_cliente_id;

  delete from public.cobrancas c
  where c.empresa_id = p_empresa_id and c.cliente_id = p_cliente_id;
  get diagnostics v_cobrancas_excluidas = row_count;

  delete from public.assinaturas a
  where a.empresa_id = p_empresa_id and a.cliente_id = p_cliente_id;

  delete from public.clientes c
  where c.id = p_cliente_id and c.empresa_id = p_empresa_id;

  return jsonb_build_object(
    'deleted', true,
    'reason', null,
    'nome', v_cliente.nome,
    'cobrancas', v_cobrancas_excluidas,
    'pagamentos', v_pagamentos
  );
end;
$$;

revoke all on function public.excluir_cliente(uuid, uuid, text) from public, anon;
grant execute on function public.excluir_cliente(uuid, uuid, text) to authenticated;

commit;
