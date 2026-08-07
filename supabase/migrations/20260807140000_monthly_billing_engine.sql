-- thegestor | motor mensal de cobrancas + base para automacoes
-- Gera cobrancas mensais de forma idempotente para assinaturas recorrentes simples.
-- Assinaturas com ciclo parcelado (ex.: 2/3) ficam fora da automacao ate a regra de negocio ser definida.

begin;

alter table public.configuracoes_empresa
  add column if not exists motor_cobranca_ativo boolean not null default true,
  add column if not exists whatsapp_ativo boolean not null default false,
  add column if not exists lembrete_antes_dias integer not null default 3,
  add column if not exists lembrete_no_vencimento boolean not null default true,
  add column if not exists lembrete_atraso_dias integer not null default 2;

create table if not exists public.execucoes_automacao (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  competencia date,
  status text not null default 'processado',
  resumo jsonb not null default '{}'::jsonb,
  erro text,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

create index if not exists execucoes_automacao_tipo_iniciado_idx
  on public.execucoes_automacao(tipo, iniciado_em desc);

alter table public.execucoes_automacao enable row level security;

drop policy if exists execucoes_automacao_admin_select on public.execucoes_automacao;
create policy execucoes_automacao_admin_select
on public.execucoes_automacao
for select
to authenticated
using (exists (
  select 1
  from public.usuarios_empresa ue
  where ue.user_id = auth.uid()
    and ue.ativo = true
    and ue.papel = 'admin'
));

create table if not exists public.mensagens_cobranca (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null,
  provedor text not null default 'evolution',
  status text not null default 'pendente',
  telefone text,
  mensagem text,
  provider_message_id text,
  erro text,
  enviada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint mensagens_cobranca_tipo_chk check (tipo in ('antes_vencimento','vencimento','atraso','confirmacao')),
  constraint mensagens_cobranca_status_chk check (status in ('pendente','enviada','ignorada','erro'))
);

create unique index if not exists mensagens_cobranca_unica_idx
  on public.mensagens_cobranca(cobranca_id, tipo);

create index if not exists mensagens_cobranca_empresa_criado_idx
  on public.mensagens_cobranca(empresa_id, criado_em desc);

alter table public.mensagens_cobranca enable row level security;

drop policy if exists mensagens_cobranca_admin_select on public.mensagens_cobranca;
create policy mensagens_cobranca_admin_select
on public.mensagens_cobranca
for select
to authenticated
using (private.e_admin(empresa_id));

create or replace function public.gerar_cobrancas_mensais_sistema(p_competencia date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competencia date;
  v_item record;
  v_cobranca_id uuid;
  v_vencimento date;
  v_ultimo_dia integer;
  v_status text;
  v_geradas integer := 0;
  v_existentes integer := 0;
  v_ciclos_revisao integer := 0;
  v_sem_financeiro integer := 0;
  v_execucao_id uuid;
begin
  v_competencia := date_trunc('month', coalesce(p_competencia, current_date))::date;

  perform pg_advisory_xact_lock(hashtext('thegestor:billing:' || v_competencia::text));

  insert into public.execucoes_automacao (tipo, competencia, status)
  values ('motor_cobranca', v_competencia, 'processando')
  returning id into v_execucao_id;

  for v_item in
    select
      a.id as assinatura_id,
      a.empresa_id,
      a.cliente_id,
      a.dia_vencimento,
      greatest(coalesce(a.creditos_por_ciclo, 0), 0) as creditos_por_ciclo,
      a.parcela_atual,
      a.parcelas_total,
      af.valor_acordado
    from public.assinaturas a
    join public.clientes c
      on c.id = a.cliente_id
     and c.empresa_id = a.empresa_id
    left join public.assinaturas_financeiras af
      on af.assinatura_id = a.id
     and af.empresa_id = a.empresa_id
    left join public.configuracoes_empresa ce
      on ce.empresa_id = a.empresa_id
    where a.status = 'ativa'
      and c.status = 'ativo'
      and coalesce(a.renovacao_automatica, true) = true
      and coalesce(ce.motor_cobranca_ativo, true) = true
  loop
    -- Ciclos como 2/3 ou 3/3 ainda dependem de uma regra explicita de negocio.
    if v_item.parcelas_total is not null then
      v_ciclos_revisao := v_ciclos_revisao + 1;
      continue;
    end if;

    if v_item.valor_acordado is null then
      v_sem_financeiro := v_sem_financeiro + 1;
      continue;
    end if;

    select cb.id into v_cobranca_id
    from public.cobrancas cb
    where cb.empresa_id = v_item.empresa_id
      and cb.assinatura_id = v_item.assinatura_id
      and cb.competencia = v_competencia
    order by cb.criado_em asc
    limit 1;

    if v_cobranca_id is not null then
      v_existentes := v_existentes + 1;
      v_cobranca_id := null;
      continue;
    end if;

    v_ultimo_dia := extract(day from (v_competencia + interval '1 month - 1 day'))::integer;
    v_vencimento := make_date(
      extract(year from v_competencia)::integer,
      extract(month from v_competencia)::integer,
      least(greatest(coalesce(v_item.dia_vencimento, 1), 1), v_ultimo_dia)
    );
    v_status := case when v_vencimento < current_date then 'atrasado' else 'pendente' end;
    v_cobranca_id := gen_random_uuid();

    insert into public.cobrancas (
      id, empresa_id, cliente_id, assinatura_id, competencia, vencimento,
      status_pagamento, pago_em, origem, external_reference,
      creditos_utilizados, creditos_previstos
    ) values (
      v_cobranca_id, v_item.empresa_id, v_item.cliente_id, v_item.assinatura_id,
      v_competencia, v_vencimento, v_status, null, 'motor_mensal',
      'thegestor:auto:' || v_cobranca_id::text,
      0, v_item.creditos_por_ciclo
    );

    insert into public.cobrancas_financeiras (
      cobranca_id, empresa_id, valor_original, valor_pago, moeda
    ) values (
      v_cobranca_id, v_item.empresa_id, greatest(v_item.valor_acordado, 0), null, 'BRL'
    );

    v_geradas := v_geradas + 1;
    v_cobranca_id := null;
  end loop;

  update public.execucoes_automacao
  set status = 'processado',
      resumo = jsonb_build_object(
        'geradas', v_geradas,
        'existentes', v_existentes,
        'ciclos_revisao', v_ciclos_revisao,
        'sem_financeiro', v_sem_financeiro
      ),
      finalizado_em = now()
  where id = v_execucao_id;

  return jsonb_build_object(
    'competencia', v_competencia,
    'geradas', v_geradas,
    'existentes', v_existentes,
    'ciclos_revisao', v_ciclos_revisao,
    'sem_financeiro', v_sem_financeiro
  );
exception
  when others then
    if v_execucao_id is not null then
      update public.execucoes_automacao
      set status = 'erro', erro = sqlerrm, finalizado_em = now()
      where id = v_execucao_id;
    end if;
    raise;
end;
$$;

revoke all on function public.gerar_cobrancas_mensais_sistema(date) from public, anon, authenticated;
grant execute on function public.gerar_cobrancas_mensais_sistema(date) to service_role;

grant select on public.execucoes_automacao to authenticated;
grant select on public.mensagens_cobranca to authenticated;

notify pgrst, 'reload schema';

commit;
