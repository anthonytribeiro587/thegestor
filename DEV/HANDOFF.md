# Active Handoff

## Snapshot

- Updated: 2026-10-06
- Branch: `feat/finalizacao-saas`
- Project: TheGestor
- State: finalização comercial, compactação operacional, exclusão segura e acabamento UX/UI implementados no código; migrations e validação visual/produção pendentes.
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
- UX/UI: acabamento final preserva o design navy/azul, inclui foco visível e alvos mobile, simplifica status de integrações e reduz duplicação em Configurações.
- Automações: requisição inicial limitada a 15 segundos com estado de erro e nova tentativa; mensagem de carregamento não fica presa indefinidamente.
- Cobranças: ações rápidas comunicam o estado de envio e ficam desabilitadas durante gravação concorrente.

## Verificação e limites

- `npm run lint`: passou.
- `npm test`: 29 testes em 7 arquivos passaram.
- `npm run build`: passou (lint + Vitest no prebuild e Next.js gerou 26 páginas).
- `npm run lint`, `npm test`, `npm run build` — passaram novamente após compactação (29 testes; 26 páginas).
- Migrations não foram aplicadas: ambiente sem acesso/ferramentas de banco local; precisam de staging/produção e revisão do plano de implantação.
- Migration `20261006170000_secure_client_deletion.sql` corrigida e pgTAP ampliado para 19 assertions; Supabase CLI/psql não disponíveis aqui, portanto executar os testes em banco descartável local ou staging antes da implantação.
- Captura visual não executada: Playwright e navegador não estão disponíveis neste ambiente.
- UX/UI final: lint, 29 testes, build com 26 rotas e diff check passaram; Preview continua pendente para 390/768/1280/1440 px e drawers.
- Credenciais, crons, webhook e envio Evolution reais precisam de validação no ambiente comercial.
- Commit da exclusão segura está sendo atualizado por amend em `feat/finalizacao-saas`; sem push ou merge.

## Próximo contexto

Aplicar migrations pendentes em staging, executar `supabase/tests/excluir_cliente.test.sql` e conferir visualmente Preview em 390/768/1280/1440 px (incluindo as sete telas revisadas e seus drawers); validar com ADMIN e confirmar isolamento e ausência de dados financeiros para OPERATOR. Não declarar integrações prontas para produção sem validar credenciais e eventos reais.
