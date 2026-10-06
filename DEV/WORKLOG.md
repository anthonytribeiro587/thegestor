# Worklog

## 2026-10-06 — Corrige exclusão de importações de valor zero

- Scope: corrigir a regra de histórico financeiro em `20261006170000_secure_client_deletion.sql` antes de a migration ser aplicada.
- Changed: status `pago`/`pago_em` da cobrança só conta quando `valor_original > 0`; `cobrancas_financeiras.valor_pago > 0` e pagamentos confirmados (`pago_em`, `approved`, `pago`, `parcial`) seguem bloqueando. PgTAP agora tem 19 assertions e cobre a exceção R$ 0,00, parcial e aprovado.
- Verified: `npm run lint`, `npm test` (29/29), `npm run build` (26 páginas), `git diff --check` passaram.
- Limits: pgTAP não executado porque `psql` e Supabase CLI não estão instalados; nenhuma migration aplicada. Commit corrigido por amend na branch `feat/finalizacao-saas`, sem merge/push.

## 2026-10-06 — Exclusão segura de clientes

- Scope: ADMIN pode excluir clientes importados/duplicados sem recebimentos confirmados; histórico financeiro permanece preservado.
- Changed: RPC transacional `excluir_cliente` valida sessão, papel e tenant, grava auditoria antes da remoção, limpa cobranças/tentativas/dependências; drawer ganhou confirmação e caminho de cancelamento para histórico financeiro; lista/KPIs atualizam e recuam página vazia com toast. Adicionado teste pgTAP com 15 assertions.
- Verified: lint passou; Vitest 29/29; build Next passou (26 páginas); `git diff --check` passou.
- Limits: pgTAP/migration não executados por ausência de `psql`/Supabase CLI e config local; staging necessário.
- Commit: `07e2a39 feat: adiciona exclusao segura de clientes` na branch `feat/finalizacao-saas`; sem push/merge.
- Next: executar `supabase/tests/excluir_cliente.test.sql` em banco descartável após aplicar migration; depois revisar visual mobile/desktop.

## 2026-10-06 — Finalização comercial

- Spec: `DEV/SPECS/ACTIVE.md`
- Branch: `feat/finalizacao-saas`
- Audit: confirmado que clientes, renovações, billing mensal, WhatsApp/Evolution/Vault, histórico/limites/deduplicação, Pix e webhook já existiam apesar do roadmap desatualizado. Pendências reais identificadas: gestão de planos, paginação e textos/configuração duplicada.
- Changed: tela e RPCs de planos/preços; catálogo ativo nos formulários de cliente; paginação real para clientes/cobranças; agregação de Dashboard; reserva atômica diária de mensagens; reserva/idempotência de criação Pix; limpeza em Configurações/Integrações; rota de Dashboard dinâmica; documentação comercial.
- Migrations: `20261006120000_saas_catalog_and_pagination.sql`, `20261006130000_whatsapp_atomic_daily_reservations.sql`, `20261006140000_mercado_pago_pix_attempts.sql`, `20261006150000_dashboard_aggregates.sql`.
- Verified: lint passou; 29 testes em 7 arquivos passaram; `npm run build` passou e gerou 26 páginas.
- Limits: sem banco/Supabase CLI local, migrations não aplicadas; dependem de validação em staging. Credenciais e execução real dos provedores/crons/webhook dependem do ambiente comercial.
- Next: revisar diff e criar commit final organizado; depois validar visualmente e em produção antes de merge.

## 2026-10-06 — Compactação de Clientes e Cobranças

- Scope: densidade visual, filtros operacionais e paginação server-side em `feat/finalizacao-saas`.
- Changed: topbar/sidebar, títulos, cards e KPIs mais compactos; filtros por status, plano, dia, intervalo, vencimento, ciclo e créditos; chips rápidos, limpar filtros, URL, debounce e skeletons; linhas de cobrança reorganizadas e régua de dias sem scrollbar horizontal.
- Migration: `20261006160000_operational_filters.sql` adiciona RPCs paginadas versionadas, com validação ADMIN/tenant, preservando as RPCs atuais durante rollout; sem alteração de dados.
- Verified: lint passou; 29 testes em 7 arquivos passaram; build passou com 26 páginas; `git diff --check` passou.
- Limits: Playwright/browser e ferramentas PostgreSQL/Supabase não estão disponíveis; captura visual e execução da migration em staging ficam pendentes.

## 2026-10-06 — Acabamento final UX/UI

- Scope: polimento localizado preservando identidade navy/azul e densidade de SaaS/ERP.
- Changed: cobranças deixam ações de pagamento/renovação claramente indisponíveis durante outra gravação, feedback de erro é anunciado e os botões usam rótulos mais claros; configurações mantêm apenas atalhos curtos; planos orientam a criação inicial; integrações mostram status simples e recolhem nomes de variáveis/configuração em detalhes técnicos; foco e alvos mobile foram reforçados.
- Bug corrigido: a carga inicial de Automações agora aborta após 15 segundos, apresenta erro acessível e oferece nova tentativa, evitando “Carregando automações...” preso. Lista vazia só aparece após resposta válida.
- Verified: `npm run lint`, `npm test` (29/29), `npm run build` (26 rotas), `git diff --check` passaram.
- Limits: Playwright e navegador indisponíveis; falta inspeção visual em Preview nos tamanhos 390, 768, 1280 e 1440 px e fluxo com usuários ADMIN/OPERATOR. Nenhuma migration criada.
