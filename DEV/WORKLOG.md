# Worklog

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
