begin;
select plan(19);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-a@example.test', '', now(), now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'operator-a@example.test', '', now(), now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin-b@example.test', '', now(), now(), now());

insert into public.empresas (id, nome, slug) values
  ('20000000-0000-4000-8000-000000000001', 'Empresa A', 'test-delete-a'),
  ('20000000-0000-4000-8000-000000000002', 'Empresa B', 'test-delete-b');

insert into public.usuarios_empresa (empresa_id, user_id, papel) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'admin'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'operador'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'admin');

insert into public.clientes (id, empresa_id, nome, telefone, origem) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Importado sem pagamento', null, 'importacao'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Cliente pago', null, 'manual'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Importado valor zero', null, 'importacao'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'Cliente parcial', null, 'manual'),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'Cliente aprovado', null, 'manual');

insert into public.planos (id, empresa_id, nome) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Plano teste');

insert into public.assinaturas (id, empresa_id, cliente_id, plano_id, dia_vencimento) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 10),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 10);

insert into public.cobrancas (id, empresa_id, cliente_id, assinatura_id, competencia, vencimento, status_pagamento, pago_em) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', current_date, current_date, 'pendente', null),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', current_date, current_date, 'pago', now()),
  ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', null, current_date, current_date, 'pago', now()),
  ('60000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', null, current_date, current_date, 'pendente', null),
  ('60000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', null, current_date, current_date, 'pendente', null);

insert into public.cobrancas_financeiras (cobranca_id, empresa_id, valor_original, valor_pago) values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 50, null),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 50, 50),
  ('60000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 0, null),
  ('60000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 100, null),
  ('60000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 100, null);

insert into public.pagamentos (id, empresa_id, cobranca_id, provedor, status) values
  ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'manual', 'pendente'),
  ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', 'manual', 'pago'),
  ('70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'manual', 'parcial'),
  ('70000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', 'mercado_pago', 'approved');

insert into public.tarefas_operacionais (empresa_id, cliente_id, cobranca_id, tipo)
values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'acompanhar');

insert into public.mensagens_whatsapp (empresa_id, cliente_id, cobranca_id, direcao)
values ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'saida');

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.excluir_cliente('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001')$$,
  '42501', 'Autenticação necessária', 'usuário não autenticado não pode excluir cliente'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((public.excluir_cliente('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'importacao')->>'deleted')::boolean, true, 'admin exclui cliente sem recebimento confirmado');
select is((select count(*) from public.clientes where id = '30000000-0000-4000-8000-000000000001'), 0::bigint, 'cliente excluído');
select is((select count(*) from public.assinaturas where id = '50000000-0000-4000-8000-000000000001'), 0::bigint, 'assinatura removida');
select is((select count(*) from public.cobrancas where id = '60000000-0000-4000-8000-000000000001'), 0::bigint, 'cobrança removida');
select is((select count(*) from public.pagamentos where id = '70000000-0000-4000-8000-000000000001'), 0::bigint, 'tentativa pendente removida');
select is((select count(*) from public.tarefas_operacionais where cliente_id = '30000000-0000-4000-8000-000000000001'), 0::bigint, 'tarefas removidas');
select is((select count(*) from public.mensagens_whatsapp where cliente_id = '30000000-0000-4000-8000-000000000001'), 0::bigint, 'mensagens removidas');
select is((select count(*) from public.audit_logs where acao = 'cliente.excluido' and entidade_id = '30000000-0000-4000-8000-000000000001' and metadados->>'motivo' = 'importacao'), 1::bigint, 'auditoria permanece com motivo após exclusão');
select is((public.excluir_cliente('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001')->>'reason'), 'not_found', 'repetir exclusão é consistente');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.excluir_cliente('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')$$,
  '42501', 'Somente administradores da empresa podem excluir clientes', 'operador não pode excluir cliente'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.excluir_cliente('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')$$,
  '42501', 'Somente administradores da empresa podem excluir clientes', 'admin de outro tenant não pode excluir cliente'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((public.excluir_cliente('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002')->>'reason'), 'not_found', 'admin de outra empresa não encontra cliente');
select is((public.excluir_cliente('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')->>'reason'), 'financial_history', 'pagamento histórico impede exclusão');
select is((select count(*) from public.clientes where id = '30000000-0000-4000-8000-000000000002'), 1::bigint, 'cliente com pagamento é preservado');
select is((public.excluir_cliente('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003')->>'deleted')::boolean, true, 'cobrança paga de valor zero sem pagamento confirmado permite exclusão');
select is((select count(*) from public.clientes where id = '30000000-0000-4000-8000-000000000003'), 0::bigint, 'cliente importado de valor zero é removido');
select is((public.excluir_cliente('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004')->>'reason'), 'financial_history', 'pagamento parcial impede exclusão');
select is((public.excluir_cliente('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005')->>'reason'), 'financial_history', 'pagamento aprovado impede exclusão');

select * from finish();
rollback;
