-- thegestor | permite recriar tarefa apos correcao/reabertura de pagamento
-- Execute depois de 20260806203000_sync_import_and_charge_actions.sql.

begin;

drop index if exists public.tarefas_operacionais_cobranca_unica_idx;

create unique index tarefas_operacionais_cobranca_unica_idx
  on public.tarefas_operacionais(cobranca_id)
  where cobranca_id is not null
    and tipo in ('renovar', 'novo_cliente')
    and status <> 'cancelada';

commit;
