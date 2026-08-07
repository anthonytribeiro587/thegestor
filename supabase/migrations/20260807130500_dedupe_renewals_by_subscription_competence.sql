-- thegestor | remove tarefas duplicadas da mesma assinatura/competencia
-- Regra: uma assinatura nao pode exigir duas renovacoes na mesma competencia
-- se uma tarefa equivalente ja foi concluida.

begin;

-- SQL Editor executa como postgres; evita que triggers de usuario bloqueiem o reparo.
alter table public.tarefas_operacionais disable trigger user;

-- 1. Localiza tarefas pendentes cuja mesma assinatura + competencia ja possui
-- uma tarefa concluida em outra cobranca.
with duplicadas as (
  select distinct
    tp.id as tarefa_pendente_id,
    cp.id as cobranca_pendente_id,
    cp.empresa_id,
    cp.assinatura_id,
    cp.competencia,
    greatest(
      coalesce(cp.creditos_utilizados, 0) + coalesce(cp.creditos_previstos, 0),
      coalesce(cc.creditos_utilizados, 0) + coalesce(cc.creditos_previstos, 0)
    ) as creditos_total
  from public.tarefas_operacionais tp
  join public.cobrancas cp
    on cp.id = tp.cobranca_id
   and cp.empresa_id = tp.empresa_id
  join public.cobrancas cc
    on cc.empresa_id = cp.empresa_id
   and cc.assinatura_id = cp.assinatura_id
   and cc.competencia = cp.competencia
  join public.tarefas_operacionais tc
    on tc.cobranca_id = cc.id
   and tc.empresa_id = cc.empresa_id
   and tc.status = 'concluida'
   and tc.tipo in ('renovar', 'novo_cliente')
  where tp.status = 'pendente'
    and tp.tipo in ('renovar', 'novo_cliente')
    and tp.id <> tc.id
    and cp.assinatura_id is not null
)
update public.tarefas_operacionais t
set status = 'cancelada',
    atualizado_em = now(),
    observacao_operador = coalesce(
      nullif(t.observacao_operador, ''),
      'Cancelada automaticamente: esta assinatura ja foi renovada nesta competencia.'
    )
from duplicadas d
where t.id = d.tarefa_pendente_id;

-- 2. Restaura o estado de creditos da cobranca pendente que representava a
-- mesma assinatura/competencia ja concluida.
with concluidas_por_competencia as (
  select
    cp.id as cobranca_id,
    max(greatest(
      coalesce(cp.creditos_utilizados, 0) + coalesce(cp.creditos_previstos, 0),
      coalesce(cc.creditos_utilizados, 0) + coalesce(cc.creditos_previstos, 0)
    )) as creditos_total
  from public.cobrancas cp
  join public.cobrancas cc
    on cc.empresa_id = cp.empresa_id
   and cc.assinatura_id = cp.assinatura_id
   and cc.competencia = cp.competencia
  join public.tarefas_operacionais tc
    on tc.cobranca_id = cc.id
   and tc.empresa_id = cc.empresa_id
   and tc.status = 'concluida'
   and tc.tipo in ('renovar', 'novo_cliente')
  where cp.assinatura_id is not null
  group by cp.id
)
update public.cobrancas c
set creditos_utilizados = greatest(coalesce(c.creditos_utilizados, 0), x.creditos_total),
    creditos_previstos = 0,
    atualizado_em = now()
from concluidas_por_competencia x
where c.id = x.cobranca_id
  and (coalesce(c.creditos_previstos, 0) > 0
       or coalesce(c.creditos_utilizados, 0) < x.creditos_total);

alter table public.tarefas_operacionais enable trigger user;

notify pgrst, 'reload schema';

commit;
