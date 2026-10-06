# Active Handoff

## Snapshot

- Updated: 2026-10-06
- Branch: `feat/finalizacao-saas`
- Project: TheGestor
- State: finalização comercial, compactação operacional e exclusão segura de clientes implementadas no código; migrations e validação visual/produção pendentes.
- Orchestration: Orquestrador Maestro V1 beta
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`

## Product State

- Auth, multiempresa, RLS e separação ADMIN/OPERATOR: existentes e preservados.
- Clientes: operações de ciclo completas; cadastro/edição seleciona catálogo ativo e mantém assinaturas antigas.
- Planos: gestão ADMIN, preço atual por RPC e histórico imutável em `planos_precos`.
- Clientes, cobranças e Dashboard: consultas tenant-scoped agregadas/paginadas, com limites de retorno.
- Clientes e Cobranças: layout mais compacto, filtros combináveis persistidos na URL, busca com debounce e novas RPCs paginadas; nenhuma consulta de lista ampla no navegador.
- Clientes: RPC transacional ADMIN-only permite hard delete sem recebimentos confirmados, remove dependências e grava auditoria; clientes com pagamentos confirmados/parciais são preservados e orientados a cancelamento.
- Exclusão segura: cobrança importada com valor original R$ 0,00 e `status_pagamento = 'pago'`/`pago_em` automático não conta como histórico sem recebimento; `valor_pago > 0` ou pagamento confirmado/parcial continuam bloqueando. PgTAP cobre zero, parcial, aprovado e o caso pago acima de zero.
- Billing, renovações, créditos, WhatsApp/Evolution e Mercado Pago: implementação existente auditada; a branch acrescenta reservas idempotentes para envio e criação de Pix.
- Integrações e Automações: removida configuração duplicada da Evolution na tela de Integrações.

## Verificação e limites

- `npm run lint`: passou.
- `npm test`: 29 testes em 7 arquivos passaram.
- `npm run build`: passou (lint + Vitest no prebuild e Next.js gerou 26 páginas).
- `npm run lint`, `npm test`, `npm run build` — passaram novamente após compactação (29 testes; 26 páginas).
- Migrations não foram aplicadas: ambiente sem acesso/ferramentas de banco local; precisam de staging/produção e revisão do plano de implantação.
- Migration `20261006170000_secure_client_deletion.sql` corrigida e pgTAP ampliado para 19 assertions; Supabase CLI/psql não disponíveis aqui, portanto executar os testes em banco descartável local ou staging antes da implantação.
- Captura visual não executada: Playwright e navegador não estão disponíveis neste ambiente.
- Credenciais, crons, webhook e envio Evolution reais precisam de validação no ambiente comercial.
- Commit da exclusão segura está sendo atualizado por amend em `feat/finalizacao-saas`; sem push ou merge.

## Próximo contexto

Aplicar migrations pendentes em staging, executar `supabase/tests/excluir_cliente.test.sql` e confirmar Clientes/Cobranças em larguras mobile/tablet/desktop com ADMIN; confirmar isolamento e ausência de dados financeiros para OPERATOR. Não declarar integrações prontas para produção sem validar credenciais e eventos reais.
