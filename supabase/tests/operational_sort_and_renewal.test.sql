begin;
select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sort-admin@example.test', '', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'sort-operator@example.test', '', now(), now(), now()),
  ('11000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'sort-other-admin@example.test', '', now(), now(), now());

insert into public.empresas (id, nome, slug) values
  ('21000000-0000-4000-8000-000000000001', 'Sort Empresa A', 'test-sort-a'),
  ('21000000-0000-4000-8000-000000000002', 'Sort Empresa B', 'test-sort-b');

insert into public.usuarios_empresa (empresa_id, user_id, papel) values
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'admin'),
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000002', 'operador'),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000003', 'admin');

insert into public.planos (id, empresa_id, nome) values
  ('41000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Plano sort');

insert into public.clientes (id, empresa_id, nome, telefone) values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'Alpha Silva', null),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', 'Beta Lima', null),
  ('31000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', 'Gamma Reis', null);

insert into public.assinaturas (id, empresa_id, cliente_id, plano_id, dia_vencimento, creditos_por_ciclo, parcela_atual, parcelas_total) values
  ('51000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 20, 1, 1, 3),
  ('51000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000001', 5, 2, 2, 3),
  ('51000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000001', 10, 3, 3, 3);

insert into public.cobrancas (id, empresa_id, cliente_id, assinatura_id, competencia, vencimento, status_pagamento, pago_em, creditos_utilizados, creditos_previstos) values
  ('61000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + 20, 'pendente', null, 0, 1),
  ('61000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + 5, 'pago', now(), 0, 2),
  ('61000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000003', date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + 10, 'pago', now(), 0, 3);

insert into public.cobrancas_financeiras (cobranca_id, empresa_id, valor_original, valor_pago) values
  ('61000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 10, null),
  ('61000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', 30, 30),
  ('61000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', 20, 20);

insert into public.tarefas_operacionais (empresa_id, cliente_id, cobranca_id, tipo, status) values
  ('21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 'renovar', 'pendente'),
  ('21000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000003', 'renovar', 'concluida');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);

select is((public.buscar_clientes_paginados_ordenados('21000000-0000-4000-8000-000000000001', current_date, '', 'Todos', null, 'cliente', 'asc')->'items'->0->>'nome'), 'Alpha Silva', 'clientes ordenam de A a Z no servidor');
select is((public.buscar_clientes_paginados_ordenados('21000000-0000-4000-8000-000000000001', current_date, '', 'Todos', null, 'cliente', 'desc')->'items'->0->>'nome'), 'Gamma Reis', 'clientes ordenam de Z a A no servidor');
select is((public.buscar_clientes_paginados_ordenados('21000000-0000-4000-8000-000000000001', current_date, '', 'Todos', null, 'vencimento', 'asc')->'items'->0->>'nome'), 'Beta Lima', 'vencimento crescente respeita os dias da assinatura');
select is((public.buscar_clientes_paginados_ordenados('21000000-0000-4000-8000-000000000001', current_date, '', 'Todos', null, 'vencimento', 'desc')->'items'->0->>'nome'), 'Alpha Silva', 'vencimento decrescente respeita os dias da assinatura');
select is((public.buscar_cobrancas_paginadas_ordenadas('21000000-0000-4000-8000-000000000001', current_date, date_trunc('month', current_date)::date, '', 'Todos', 0, 25, null, null, null, null, 'Todas', 'Todas', 'valor', 'asc')->'items'->0->>'cliente'), 'Alpha Silva', 'valor financeiro ordena numericamente no servidor');
select is((public.buscar_cobrancas_paginadas_ordenadas('21000000-0000-4000-8000-000000000001', current_date, date_trunc('month', current_date)::date, '', 'Todos', 0, 25, null, null, null, null, 'Todas', 'Pendente', 'cliente', 'asc')->'items'->0->>'renovacao'), 'Pendente', 'tarefa renovar pendente classifica o ciclo como pendente');
select is((public.buscar_cobrancas_paginadas_ordenadas('21000000-0000-4000-8000-000000000001', current_date, date_trunc('month', current_date)::date, '', 'Todos', 0, 25, null, null, null, null, 'Todas', 'Renovado', 'cliente', 'asc')->'items'->0->>'renovacao'), 'Renovado', 'tarefa renovar concluída classifica o ciclo como renovado');
select is((public.buscar_clientes_paginados_ordenados('21000000-0000-4000-8000-000000000001', current_date, 'a', 'Todos', null, 'cliente', 'asc', 1, 1)->'items'->0->>'nome'), 'Beta Lima', 'busca, ordenação e paginação são combinadas server-side');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.buscar_cobrancas_paginadas_ordenadas('21000000-0000-4000-8000-000000000001', current_date, date_trunc('month', current_date)::date)$$,
  '42501', 'Somente administradores podem consultar cobranças', 'admin de outro tenant não acessa cobranças'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.buscar_cobrancas_paginadas_ordenadas('21000000-0000-4000-8000-000000000001', current_date, date_trunc('month', current_date)::date)$$,
  '42501', 'Somente administradores podem consultar cobranças', 'operador não recebe acesso financeiro'
);

select * from finish();
rollback;
