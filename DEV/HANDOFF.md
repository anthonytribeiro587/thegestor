# Active Handoff

## Snapshot

- Updated: 2026-10-06
- Branch: `feat/finalizacao-saas`
- Project: TheGestor
- State: revisão mobile-first de todo o frontend implementada nesta branch; QA público Chromium passou nos cinco viewports. QA autenticado ADMIN/OPERATOR e migrations/PgTAP em staging continuam pendentes.
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
- Mobile: desktop preservado acima de 768px; até 768px há header compacto, drawer lateral, KPIs 2 colunas, folhas de filtro/ordenação, cartões operacionais, ajustes responsivos por tela e formulários/drawers em largura total.
- QA mobile: `/`, `/login`, `/cadastro` passaram em 390x844, 430x932, 768x1024, 1280x800 e 1440x900; sem overflow/elementos fora do viewport/erros. Evidência em `.qa/screenshots/mobile-review/` e `DEV/QA-FINAL.md`.
- QA operacional: menu/filtros/vencimento/ordenação foram exercitados em 390px sem dados. Sem sessão nem variáveis Supabase, drawers com dados, ações e separação ADMIN/OPERATOR não foram validados.
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
- QA Chromium público: Preview do commit `c572face` passou em `/`, `/login`, `/cadastro` nos viewports 390/768/1280/1440; build local após correção de contraste passou novamente. 12 screenshots em `.qa/screenshots/`.
- Contraste muted ajustado para `#64748b`; medição de texto auxiliar/tab auth passou de 4,36:1 para 4,76:1. Correção local aguarda um novo Preview.
- QA autenticado não executado: nenhuma conta de teste disponível; validar páginas operacionais, drawers, automações, integrações e separação ADMIN/OPERATOR com dados isolados.
- `next dev` reportou hydration mismatch de `caret-color` em alguns carregamentos; não reproduziu no Preview nem em produção local. Registro em `DEV/QA-FINAL.md`.
- Gates após QA: lint, 29 testes, build de 26 rotas e diff check passaram.
- Credenciais, crons, webhook e envio Evolution reais precisam de validação no ambiente comercial.
- Branch obrigatória `feat/finalizacao-saas`; nenhuma alteração em `main`, sem push ou merge.

## Próximo contexto

Executar QA autenticado descrito em `DEV/QA-FINAL.md` com usuários isolados ADMIN/OPERATOR e dados seguros; validar drawers, listas, ações e proteção financeira no Preview. A tela “Início” usa `/dashboard`; `/inicio` é 404. Depois, aplicar migrations pendentes em staging e executar `supabase/tests/excluir_cliente.test.sql` e `supabase/tests/operational_sort_and_renewal.test.sql`. Nenhum merge/push.
