# Current Context

## State

- Project: `thegestor`
- Produto: SaaS administrativo para clientes, cobranças recorrentes e renovações
- Framework: Next.js App Router + React + TypeScript
- Backend: Supabase Auth + PostgreSQL + RLS
- Deploy: Vercel
- Tests: Vitest
- Integrações previstas/ativas: Evolution/WhatsApp, Mercado Pago

## Commands

- Install: `npm install`
- Development: `npm run dev`
- Typecheck: `npm run lint`
- Tests: `npm test`
- Build/full gate: `npm run build`
- Maestro bootstrap: `bash scripts/setup-maestro-codespace.sh`

## Constraints And Risks

- Multiempresa: toda consulta deve respeitar tenant/empresa.
- Operador não pode receber dados financeiros.
- Segredos de integrações ficam no servidor/Vault.
- Dados reais existem no ambiente; testes não podem destruir produção.
- Cobranças, créditos e renovação possuem impacto financeiro.
- Webhooks devem ser autenticados/idempotentes.
- Evolution deve ficar desacoplada para futura troca por Cloud API se necessário.

## Next Context

- Revisão mobile-first do frontend implementada na branch `feat/finalizacao-saas`; QA Chromium público passou em 390, 430, 768, 1280 e 1440px. QA autenticado ADMIN/OPERATOR continua pendente porque este ambiente não tem sessão nem configuração Supabase.
- Priorizar funcionalidades que transformem o sistema em produto replicável.
- Exclusão segura de clientes está implementada no código, mas depende da migration `20261006170000_secure_client_deletion.sql` e validação pgTAP em Supabase local/staging.
- Evitar customização excessivamente específica de um único cliente.
- Antes de mexer em banco/RLS, ler migrations e políticas relacionadas.
