# Active Handoff

## Snapshot

- Updated: 2026-09-30
- Project: TheGestor
- State: SaaS publicado, conectado ao Supabase e com dados reais
- Orchestration: Orquestrador Maestro V1 beta
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`

## Product State

- Auth, empresa e multiempresa com RLS: implementados
- Perfis admin/operador: implementados
- Dashboard, clientes, cobranças e fila operacional: implementados
- Importação XLSX: implementada
- Controle de créditos/custo: implementado
- Evolution: base de integração existente, reutilizando infraestrutura do NextLead com Vault
- Mercado Pago: planejado
- Automação de cobranças: planejada
- E2E e observabilidade: pendentes

## Latest Work

- Entry: camada local do Orquestrador Maestro instalada
- Changed: `AGENTS.md`, `DEV/`, `scripts/setup-maestro-codespace.sh`
- Risks: cada Codespace precisa ter o CLI instalado no próprio home
- Next context: consolidar backlog de produto e atacar primeiro os itens que aproximam o SaaS de venda repetível
