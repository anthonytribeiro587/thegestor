# Active Handoff

## Snapshot

- Updated: 2026-10-06
- Branch: `feat/finalizacao-saas`
- Project: TheGestor
- State: landing pública, ajustes auth, filtros/tabelas compactos, ordenação server-side e estado de renovação derivados implementados na branch; migration, PgTAP e Chromium/Preview pendentes.
- Orchestration: Orquestrador Maestro V1 beta
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`

## Product State

- Auth, multiempresa, RLS e separação ADMIN/OPERATOR: existentes e preservados.
- Clientes: operações de ciclo completas; cadastro/edição seleciona catálogo ativo e mantém assinaturas antigas.
- Planos: gestão ADMIN, preço atual por RPC e histórico imutável em `planos_precos`.
- Clientes, cobranças e Dashboard: consultas tenant-scoped agregadas/paginadas, com limites de retorno.
- Clientes e Cobranças: layout mais compacto, filtros combináveis persistidos na URL, busca com debounce e novas RPCs paginadas; nenhuma consulta de lista ampla no navegador.
- Landing: `/` é pública, tem metadata SEO/Open Graph e CTAs para `/login` e `/cadastro`; rotas de auth e matcher do middleware permanecem intactos.
- Clientes: tabela única sem agrupamentos por vencimento, filtros compactos com dias em popover (fora/escape fecham), sort por cliente/plano/vencimento/créditos/ciclo/status na RPC paginada e URL.
- Cobranças: filtros diretos de status/renovação/plano/período/financeiro; tabela ordenável server-side por cliente/vencimento/status/valor/recebido/saldo; ações de renovação distinguem confirmação pendente do badge Renovado.
- Migration nova: `20261006180000_operational_sort_and_renewal_filter.sql` adiciona RPCs versionadas; não altera dados nem RPCs aplicadas. PgTAP correspondente aguarda staging.
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
- Landing/filtros/ordenação: lint passou; Vitest 29/29; build passou com 26 rotas; diff check passou.
- Migrations não foram aplicadas: ambiente sem acesso/ferramentas de banco local; precisam de staging/produção e revisão do plano de implantação.
- Migration `20261006170000_secure_client_deletion.sql` corrigida e pgTAP ampliado para 19 assertions; Supabase CLI/psql não disponíveis aqui, portanto executar os testes em banco descartável local ou staging antes da implantação.
- Captura visual não executada: Playwright e navegador não estão disponíveis neste ambiente.
- Visual QA harness retornou `ENVIRONMENT_LIMITATION` por ausência de Playwright; Supabase CLI via npx falhou com versão ausente e `psql` não existe.
- UX/UI final: lint, 29 testes, build com 26 rotas e diff check passaram; Preview continua pendente para 390/768/1280/1440 px e drawers.
- Credenciais, crons, webhook e envio Evolution reais precisam de validação no ambiente comercial.
- Branch obrigatória `feat/finalizacao-saas`; nenhuma alteração em `main`, sem push ou merge.

## Próximo contexto

Aplicar migrations pendentes em staging e executar `supabase/tests/excluir_cliente.test.sql` e `supabase/tests/operational_sort_and_renewal.test.sql`. Conferir Preview/Chromium em 390/768/1024/1280/1440 px, incluindo landing/login/cadastro, popovers, tabelas e drawers; validar com ADMIN e OPERATOR que isolamento e dados financeiros permanecem protegidos.
