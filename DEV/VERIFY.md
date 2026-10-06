# Verify

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
