-- thegestor | corrige guard de conclusao da tarefa para operador
-- Mantem campos administrativos bloqueados e permite apenas concluir a propria tarefa.

begin;

create or replace function private.proteger_edicao_tarefa_operador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.e_admin(old.empresa_id) then
    return new;
  end if;

  if not private.tem_acesso_empresa(old.empresa_id) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;

  if new.empresa_id is distinct from old.empresa_id
     or new.cliente_id is distinct from old.cliente_id
     or new.cobranca_id is distinct from old.cobranca_id
     or new.tipo is distinct from old.tipo
     or new.prioridade is distinct from old.prioridade
     or new.atribuida_a is distinct from old.atribuida_a
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Operador nao pode alterar campos administrativos da tarefa' using errcode = '42501';
  end if;

  if new.status = 'cancelada' then
    raise exception 'Somente admin pode cancelar tarefa' using errcode = '42501';
  end if;

  if old.status = 'concluida' and new.status is distinct from 'concluida' then
    raise exception 'Operador nao pode reabrir tarefa concluida' using errcode = '42501';
  end if;

  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    new.concluida_por := auth.uid();
    new.concluida_em := now();
  elsif new.concluida_por is distinct from old.concluida_por
     or new.concluida_em is distinct from old.concluida_em then
    raise exception 'Operador nao pode alterar dados de conclusao manualmente' using errcode = '42501';
  end if;

  return new;
end;
$$;

commit;
