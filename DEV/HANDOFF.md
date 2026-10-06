# Active Handoff

## Snapshot

- Updated: 2026-10-06
- Branch: `feat/finalizacao-saas`
- Project: TheGestor
- State: finalização comercial e compactação operacional implementadas no código; novas migrations e validação visual/produção pendentes.
- Orchestration: Orquestrador Maestro V1 beta
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`

## Product State

- Auth, multiempresa, RLS e separação ADMIN/OPERATOR: existentes e preservados.
- Clientes: operações de ciclo completas; cadastro/edição seleciona catálogo ativo e mantém assinaturas antigas.
- Planos: gestão ADMIN, preço atual por RPC e histórico imutável em `planos_precos`.
- Clientes, cobranças e Dashboard: consultas tenant-scoped agregadas/paginadas, com limites de retorno.
- Clientes e Cobranças: layout mais compacto, filtros combináveis persistidos na URL, busca com debounce e novas RPCs paginadas; nenhuma consulta de lista ampla no navegador.
- Billing, renovações, créditos, WhatsApp/Evolution e Mercado Pago: implementação existente auditada; a branch acrescenta reservas idempotentes para envio e criação de Pix.
- Integrações e Automações: removida configuração duplicada da Evolution na tela de Integrações.

## Verificação e limites

- `npm run lint`: passou.
- `npm test`: 29 testes em 7 arquivos passaram.
- `npm run build`: passou (lint + Vitest no prebuild e Next.js gerou 26 páginas).
- `npm run lint`, `npm test`, `npm run build` — passaram novamente após compactação (29 testes; 26 páginas).
- Migrations não foram aplicadas: ambiente sem acesso/ferramentas de banco local; precisam de staging/produção e revisão do plano de implantação.
- Captura visual não executada: Playwright e navegador não estão disponíveis neste ambiente.
- Credenciais, crons, webhook e envio Evolution reais precisam de validação no ambiente comercial.
- Commit final desta branch será registrado ao concluir a revisão do diff; sem push ou merge.

## Próximo contexto

Aplicar as migrations pendentes em staging e confirmar Clientes/Cobranças em larguras mobile/tablet/desktop com ADMIN; confirmar isolamento e ausência de dados financeiros para OPERATOR. Não declarar integrações prontas para produção sem validar credenciais e eventos reais.
