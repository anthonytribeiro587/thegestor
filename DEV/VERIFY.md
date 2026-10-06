# Verify

## Exclusão segura de clientes — 2026-10-06

### Checks executados

- `npm run lint` — passou (`tsc --noEmit`).
- `npm test` — passou: 29 testes em 7 arquivos.
- `npm run build` — passou; Next.js compilou e gerou 26 páginas.
- `git diff --check` — passou.
- Regressão da cobrança importada R$ 0,00: regra corrigida na migration; caso coberto por teste pgTAP, junto com pagamentos parcial e aprovado.
- Revisão de migration: função `SECURITY DEFINER` com `search_path` vazio, validação `auth.uid()`/ADMIN, tenant nos filtros, grants restritos e audit log sem FK ao cliente.

### Pendente

- A suíte `supabase/tests/excluir_cliente.test.sql` tem 19 assertions pgTAP, mas não foi executada: `psql`, Supabase CLI e configuração local não estão disponíveis neste ambiente.
- Aplicar migration e executar os cenários em Supabase local/staging antes da implantação em produção.

## Finalização comercial — 2026-10-06

### Checks executados

- `npm run lint` — passou (`tsc --noEmit`).
- `npm test` — passou: 29 testes em 7 arquivos.
- `npm run build` — passou; Next.js compilou e gerou as 26 páginas.
- Auditoria de fonte: roadmap comparado às páginas, rotas, bibliotecas e migrations existentes.
- `git branch --show-current` — `feat/finalizacao-saas`.

### Evidências no código

- Planos: RPCs de criação/alteração transacionais, proteção contra exclusão/edição histórica e tela restrita a ADMIN.
- Paginação: RPCs tenant-scoped de clientes/cobranças com filtros, totais, limites e agregados; Dashboard com retorno limitado e cálculos no banco.
- WhatsApp: reserva atômica por empresa/dia com bloqueio de concorrência e validação de estado antes do envio.
- Mercado Pago: tentativa Pix persistida antes da chamada externa e reutilização da chave de idempotência.
- UI: aviso obsoleto removido de Configurações e configuração duplicada removida de Integrações.
- RLS: novas funções validam `private.e_admin`; a RPC de mensagem é exclusiva do `service_role`; integrações seguem server-side/Vault.

### Não verificável localmente

- Não há `psql`, Supabase CLI ou banco local para aplicar/testar migrations.
- Migrations novas ainda precisam ser aplicadas e validadas em staging antes de produção.
- Credenciais/conta Mercado Pago, notificações webhook, cron e conexão Evolution/Vault dependem do ambiente comercial.
- Fluxos visuais mobile, E2E e isolamento com usuários reais ADMIN/OPERATOR seguem no checklist de staging.

### Ambiente/build

O build inicial de baseline falhou ao prerenderizar `/dashboard` sem credenciais Supabase. A rota autenticada foi marcada dinâmica e o build final passou.

## Compactação de Clientes e Cobranças — 2026-10-06

### Checks executados

- `npm run lint` — passou (`tsc --noEmit`).
- `npm test` — passou: 29 testes em 7 arquivos.
- `npm run build` — passou; Next.js compilou e gerou 26 páginas. Avisos restantes são sobre serialização de cache do webpack.
- `git diff --check` — passou.
- Branch confirmada: `feat/finalizacao-saas`.

### Verificações não disponíveis neste ambiente

- Visual QA: o harness detectou que Playwright não está instalado; também não há binário de navegador para a captura alternativa.
- Banco: não há `psql` nem Supabase CLI; a migration não foi aplicada nem executada contra PostgreSQL.

### Próxima validação

Aplicar `20261006160000_operational_filters.sql` em staging e revisar os filtros e larguras nas telas Clientes/Cobranças em 390, 768, 1280 e 1440 px, com sessão ADMIN e checagem de acesso OPERATOR.

## Landing pública, filtros, renovação e ordenação — 2026-10-06

### Checks executados

- `npm run lint` — passou (`tsc --noEmit`).
- `npm test` — passou: 29 testes em 7 arquivos.
- `npm run build` — passou; compilou e gerou 26 rotas.
- `git diff --check` — passou.
- Smoke HTTP pós-build: `/`, `/login` e `/cadastro` retornaram HTTP 200; landing serviu headline, OG title e CTA.
- Migration incremental criada: `20261006180000_operational_sort_and_renewal_filter.sql`; sem alteração de dados, RLS ou RPCs legadas.
- PgTAP criado para ordenação A-Z/Z-A, vencimento crescente/decrescente, valor numérico, renovação pendente/concluída, busca+sort+paginação, isolamento tenant e restrição OPERATOR.

### Verificações não disponíveis neste ambiente

- PgTAP e migration não foram executados: `psql` e Supabase CLI funcional não estão disponíveis. A tentativa via `npx supabase@latest` falhou porque o registry não encontrou a versão `supabase@2.120.0`.
- Visual QA executado contra `http://localhost:3030`, mas o harness retornou `ENVIRONMENT_LIMITATION` (`playwright-not-installed`); não há Chromium instalado.
- Não foi possível inspecionar Preview nos tamanhos solicitados nem executar com sessões ADMIN/OPERATOR.

### Próxima validação

Aplicar a migration nova em staging, executar `supabase/tests/operational_sort_and_renewal.test.sql` e inspecionar landing, login, cadastro, filtros/popovers, tabelas, drawers e exclusão em Chromium nos tamanhos 390, 768, 1024, 1280 e 1440 px. Verificar ações e separação financeira com ADMIN e OPERATOR.

## Acabamento final UX/UI — 2026-10-06

### Checks executados

- `npm run lint` — passou (`tsc --noEmit`).
- `npm test` — passou: 29 testes em 7 arquivos.
- `npm run build` — passou; 26 rotas geradas.
- `git diff --check` — passou.
- Revisão estática das telas Dashboard, Clientes, Cobranças, Planos, Automações, Integrações e Configurações, componentes de drawer e breakpoints CSS.
- Nenhuma migration criada; regra financeira não foi alterada.

### Limites e verificação pendente

- Playwright e binário de navegador não estão disponíveis; não foi possível capturar ou inspecionar telas do Preview.
- Em Preview, validar visualmente 390, 768, 1280 e 1440 px, incluindo Cobranças, drawers de Clientes/Cobranças/Planos/Automações e estados de integração.
- Validar as ações com ADMIN e confirmar que OPERATOR não acessa informação financeira protegida.
