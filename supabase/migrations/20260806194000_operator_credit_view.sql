-- thegestor | creditos operacionais na fila sem qualquer valor financeiro
-- Execute depois de 20260806193000_credit_operations_and_settings.sql.

begin;

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
 and cb.empresa_id = t.empresa_id;

grant select on public.fila_operacional to authenticated;

commit;
