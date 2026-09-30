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
