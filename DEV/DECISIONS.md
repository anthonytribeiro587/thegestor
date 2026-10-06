# Decisions

## 2026-09-30 — Orquestração

- Orquestrador Maestro V1 beta será usado como contrato operacional.
- Contexto durável fica em `AGENTS.md` e `DEV/`.

## Produto

- TheGestor deve evoluir como SaaS replicável, não como solução presa a um único cliente.
- Separação ADMIN/OPERATOR e isolamento multiempresa são invariantes.
- Dados financeiros permanecem invisíveis ao operador.
- Credenciais de integrações devem permanecer server-side/Vault.
- Evolution deve ficar atrás de uma camada desacoplada.
- Automação financeira/webhooks devem ser idempotentes.

## 2026-10-06 — Finalização comercial: catálogo e consultas paginadas

- Status: aceito para esta branch
- Contexto: o produto já contém `planos` e `planos_precos`, mas não oferece gestão administrativa do catálogo. Clientes e cobranças limitam a consulta a 500 linhas e calculam busca, filtros e indicadores no navegador. O build local também tenta renderizar `/dashboard` sem sessão/env durante o prerender.
- Decisão: adicionar uma superfície de planos restrita a ADMIN; manter o histórico na tabela financeira existente e trocar preços por RPC transacional; usar seleção de planos ativos nos formulários novos e manter o caminho legado para assinaturas existentes; introduzir consultas paginadas com filtros e agregados coerentes sob RLS; tornar dashboard autenticado explicitamente dinâmico.
- Alternativas: reutilizar texto livre e continuar com limite 500; filtrar uma página parcial no navegador; expor consultas financeiras ao operador para simplificar paginação; sobrescrever o preço atual.
- Consequências: novas chamadas e migração aditiva; preço atual e histórico continuam separados dos dados operacionais; contadores são calculados no banco para o conjunto filtrado/global definido; nenhuma migração será aplicada ao banco de produção nesta tarefa.
- Limites: não alterar credenciais nem integração server-side; não redesenhar o produto; preservar APIs/RPCs legadas; registrar no handoff qualquer etapa que dependa de credenciais ou validação em produção.
- Verificação: lint, suíte Vitest, build Next, inspeção de políticas/grants e testes de domínio para transição de preço/paginação.
