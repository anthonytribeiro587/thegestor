-- thegestor | preserva renovacoes concluidas e limpa tarefas operacionais stale
-- Regra: uma tarefa concluida e imutavel dentro da mesma cobranca/competencia.
-- A sincronizacao da planilha nao pode transformar uma renovacao ja executada em pendente novamente.

begin;

-- O SQL Editor executa como role postgres e nao possui auth.uid().
-- O trigger antigo de protecao do operador interpreta isso como usuario sem acesso.
-- Desabilitamos triggers de usuario somente durante o reparo administrativo abaixo.
-- Como tudo esta dentro da mesma transaction, qualquer erro restaura o estado anterior.
alter table public.tarefas_operacionais disable trigger user;

-- 1. Restaura tarefas que possuem prova de conclusao no audit log,
-- caso alguma sincronizacao/correcao posterior tenha alterado o status.
update public.tarefas_operacionais t
set status = 'concluida',
    concluida_por = coalesce(t.concluida_por, a.user_id),
    concluida_em = coalesce(t.concluida_em, now()),
    atualizado_em = now()
from (
  select distinct on (al.entidade_id)
    al.entidade_id,
    al.user_id
  from public.audit_logs al
  where al.acao = 'tarefa.concluida'
    and al.entidade = 'tarefa_operacional'
  order by al.entidade_id
) a
where t.id = a.entidade_id
  and t.status <> 'concluida';

-- 2. Repara creditos de cobrancas que ja tiveram renovacao concluida.
-- O audit log guarda quantos creditos foram efetivamente movidos na conclusao.
with conclusoes as (
  select
    nullif(al.metadados->>'cobranca_id', '')::uuid as cobranca_id,
    max(greatest(coalesce((al.metadados->>'creditos_movidos')::integer, 0), 0)) as creditos_movidos
  from public.audit_logs al
  where al.acao = 'tarefa.concluida'
    and al.entidade = 'tarefa_operacional'
    and nullif(al.metadados->>'cobranca_id', '') is not null
  group by nullif(al.metadados->>'cobranca_id', '')::uuid
)
update public.cobrancas c
set creditos_utilizados = greatest(coalesce(c.creditos_utilizados, 0), conclusoes.creditos_movidos),
    creditos_previstos = 0,
    atualizado_em = now()
from conclusoes
where c.id = conclusoes.cobranca_id
  and (coalesce(c.creditos_previstos, 0) <> 0
       or coalesce(c.creditos_utilizados, 0) < conclusoes.creditos_movidos);

-- 3. Cancela duplicatas/stale ainda pendentes quando ja existe evidencia de
-- conclusao para a mesma cobranca.
update public.tarefas_operacionais t
set status = 'cancelada',
    atualizado_em = now(),
    observacao_operador = coalesce(
      nullif(t.observacao_operador, ''),
      'Cancelada automaticamente: renovacao desta cobranca ja havia sido concluida.'
    )
where t.status = 'pendente'
  and t.tipo in ('renovar', 'novo_cliente')
  and t.cobranca_id is not null
  and exists (
    select 1
    from public.audit_logs al
    where al.acao = 'tarefa.concluida'
      and al.entidade = 'tarefa_operacional'
      and al.metadados->>'cobranca_id' = t.cobranca_id::text
  );

-- 4. Uma renovacao sem credito previsto nao e mais acionavel.
update public.tarefas_operacionais t
set status = 'cancelada',
    atualizado_em = now(),
    observacao_operador = coalesce(
      nullif(t.observacao_operador, ''),
      'Cancelada automaticamente: nao ha creditos previstos nesta cobranca.'
    )
from public.cobrancas c
where t.cobranca_id = c.id
  and t.empresa_id = c.empresa_id
  and t.status = 'pendente'
  and t.tipo = 'renovar'
  and coalesce(c.creditos_previstos, 0) <= 0;

-- O reparo administrativo terminou; as protecoes normais voltam a valer.
alter table public.tarefas_operacionais enable trigger user;

-- 5. Bloqueia reabertura de tarefa concluida para qualquer origem.
-- Se um dia precisarmos desfazer uma renovacao, isso deve existir como uma RPC
-- explicita e auditada, nunca como efeito colateral de importacao/webhook.
create or replace function private.bloquear_reabertura_tarefa_concluida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'concluida' and new.status is distinct from 'concluida' then
    raise exception 'Tarefa concluida nao pode ser reaberta automaticamente' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tarefas_bloquear_reabertura_concluida on public.tarefas_operacionais;
create trigger tarefas_bloquear_reabertura_concluida
before update on public.tarefas_operacionais
for each row execute function private.bloquear_reabertura_tarefa_concluida();

-- 6. Protege o estado dos creditos contra regressao por reimportacao da XLS.
create or replace function private.preservar_creditos_cobranca_concluida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creditos_movidos integer := 0;
begin
  if new.creditos_previstos is not distinct from old.creditos_previstos
     and new.creditos_utilizados is not distinct from old.creditos_utilizados then
    return new;
  end if;

  if exists (
    select 1
    from public.tarefas_operacionais t
    where t.cobranca_id = old.id
      and t.empresa_id = old.empresa_id
      and t.tipo in ('renovar', 'novo_cliente')
      and t.status = 'concluida'
  ) then
    select coalesce(max(greatest(coalesce((al.metadados->>'creditos_movidos')::integer, 0), 0)), 0)
      into v_creditos_movidos
    from public.audit_logs al
    where al.acao = 'tarefa.concluida'
      and al.entidade = 'tarefa_operacional'
      and al.metadados->>'cobranca_id' = old.id::text;

    new.creditos_utilizados := greatest(
      coalesce(old.creditos_utilizados, 0),
      coalesce(new.creditos_utilizados, 0),
      v_creditos_movidos
    );
    new.creditos_previstos := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists cobrancas_preservar_creditos_concluidos on public.cobrancas;
create trigger cobrancas_preservar_creditos_concluidos
before update of creditos_utilizados, creditos_previstos on public.cobrancas
for each row execute function private.preservar_creditos_cobranca_concluida();

-- 7. A view operacional passa a expor apenas tarefas realmente acionaveis.
create or replace view public.fila_operacional
with (security_invoker = true)
as
select
  t.id as tarefa_id,
  t.empresa_id,
  t.tipo,
  t.status as status_tarefa,
  t.prioridade,
  t.atribuida_a,
  t.observacao_operador,
  t.criado_em,
  c.id as cliente_id,
  c.nome as cliente_nome,
  c.telefone,
  c.status as cliente_status,
  cb.id as cobranca_id,
  cb.vencimento,
  cb.status_pagamento,
  cb.pago_em,
  cb.creditos_previstos,
  cb.creditos_utilizados
from public.tarefas_operacionais t
join public.clientes c
  on c.id = t.cliente_id
 and c.empresa_id = t.empresa_id
left join public.cobrancas cb
  on cb.id = t.cobranca_id
 and cb.empresa_id = t.empresa_id
where t.status = 'pendente'
  and (
    t.tipo not in ('renovar', 'novo_cliente')
    or (
      cb.status_pagamento = 'pago'
      and (t.tipo = 'novo_cliente' or coalesce(cb.creditos_previstos, 0) > 0)
    )
  );

grant select on public.fila_operacional to authenticated;

notify pgrst, 'reload schema';

commit;
