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

- Priorizar funcionalidades que transformem o sistema em produto replicável.
- Evitar customização excessivamente específica de um único cliente.
- Antes de mexer em banco/RLS, ler migrations e políticas relacionadas.
