-- thegestor | fechamento do fluxo de creditos e configuracoes
-- Execute depois de 20260806190000_credits_optional_phone_and_import.sql.

begin;

-- Garante configuracao padrao para empresas atuais e futuras.
insert into public.configuracoes_empresa (empresa_id, custo_medio_credito, fuso_horario)
select e.id, 8, 'America/Sao_Paulo'
from public.empresas e
on conflict (empresa_id) do nothing;

create or replace function private.criar_configuracao_empresa_padrao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.configuracoes_empresa (empresa_id, custo_medio_credito, fuso_horario)
  values (new.id, 8, 'America/Sao_Paulo')
  on conflict (empresa_id) do nothing;
  return new;
end;
$$;

drop trigger if exists empresas_criar_configuracao_padrao on public.empresas;
create trigger empresas_criar_configuracao_padrao
after insert on public.empresas
for each row execute function private.criar_configuracao_empresa_padrao();

-- Salva preferencia operacional sem expor escrita generica no frontend.
create or replace function public.salvar_configuracoes_empresa(
  p_empresa_id uuid,
  p_custo_medio_credito numeric,
  p_fuso_horario text default 'America/Sao_Paulo'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.e_admin(p_empresa_id) then
    raise exception 'Somente administradores podem alterar configuracoes' using errcode = '42501';
  end if;

  if p_custo_medio_credito is null or p_custo_medio_credito < 0 then
    raise exception 'Custo medio por credito invalido';
  end if;

  if nullif(trim(coalesce(p_fuso_horario, '')), '') is null then
    raise exception 'Fuso horario invalido';
  end if;

  insert into public.configuracoes_empresa (
    empresa_id, custo_medio_credito, fuso_horario
  ) values (
    p_empresa_id, p_custo_medio_credito, trim(p_fuso_horario)
  )
  on conflict (empresa_id) do update
    set custo_medio_credito = excluded.custo_medio_credito,
        fuso_horario = excluded.fuso_horario,
        atualizado_em = now();

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  ) values (
    p_empresa_id,
    auth.uid(),
    'configuracao.creditos_atualizada',
    'empresa',
    p_empresa_id,
    jsonb_build_object(
      'custo_medio_credito', p_custo_medio_credito,
      'fuso_horario', trim(p_fuso_horario)
    )
  );
end;
$$;

revoke all on function public.salvar_configuracoes_empresa(uuid, numeric, text) from public, anon;
grant execute on function public.salvar_configuracoes_empresa(uuid, numeric, text) to authenticated;

-- Conclusao operacional atomica. Ao renovar, os creditos que estavam previstos
-- viram utilizados. O operador nao precisa (nem pode) acessar tabelas financeiras.
create or replace function public.concluir_tarefa_operacional(
  p_tarefa_id uuid,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tarefas_operacionais%rowtype;
  v_creditos_movidos integer := 0;
  v_observacao text;
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria' using errcode = '42501';
  end if;

  select * into v_task
  from public.tarefas_operacionais
  where id = p_tarefa_id
  for update;

  if v_task.id is null then
    raise exception 'Tarefa nao encontrada';
  end if;

  if not private.tem_acesso_empresa(v_task.empresa_id) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;

  if v_task.status <> 'pendente' then
    return jsonb_build_object(
      'concluida', false,
      'ja_concluida', v_task.status = 'concluida',
      'creditos_movidos', 0
    );
  end if;

  if v_task.cobranca_id is not null and v_task.tipo in ('renovar', 'novo_cliente') then
    select coalesce(c.creditos_previstos, 0)
      into v_creditos_movidos
    from public.cobrancas c
    where c.id = v_task.cobranca_id
      and c.empresa_id = v_task.empresa_id
    for update;

    v_creditos_movidos := coalesce(v_creditos_movidos, 0);

    if v_creditos_movidos > 0 then
      update public.cobrancas
      set creditos_utilizados = creditos_utilizados + creditos_previstos,
          creditos_previstos = 0,
          atualizado_em = now()
      where id = v_task.cobranca_id
        and empresa_id = v_task.empresa_id;
    end if;
  end if;

  if v_task.tipo = 'novo_cliente' then
    update public.clientes
    set status = 'ativo', atualizado_em = now()
    where id = v_task.cliente_id
      and empresa_id = v_task.empresa_id;
  end if;

  v_observacao := nullif(trim(coalesce(p_observacao, '')), '');
  if v_observacao is null then
    v_observacao := case
      when v_task.tipo = 'novo_cliente' then 'Cliente ativado pelo operador'
      when v_task.tipo = 'renovar' then 'Renovacao concluida pelo operador'
      else 'Tarefa concluida pelo operador'
    end;
  end if;

  update public.tarefas_operacionais
  set status = 'concluida',
      concluida_por = auth.uid(),
      concluida_em = now(),
      observacao_operador = v_observacao,
      atualizado_em = now()
  where id = v_task.id;

  insert into public.audit_logs (
    empresa_id, user_id, acao, entidade, entidade_id, metadados
  ) values (
    v_task.empresa_id,
    auth.uid(),
    'tarefa.concluida',
    'tarefa_operacional',
    v_task.id,
    jsonb_build_object(
      'tipo', v_task.tipo,
      'cliente_id', v_task.cliente_id,
      'cobranca_id', v_task.cobranca_id,
      'creditos_movidos', v_creditos_movidos
    )
  );

  return jsonb_build_object(
    'concluida', true,
    'creditos_movidos', v_creditos_movidos
  );
end;
$$;

revoke all on function public.concluir_tarefa_operacional(uuid, text) from public, anon;
grant execute on function public.concluir_tarefa_operacional(uuid, text) to authenticated;

commit;
