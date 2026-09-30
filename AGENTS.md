# TheGestor — Orquestrador Maestro

Este projeto usa o Orquestrador Maestro como contrato operacional para agentes de IA.

## Bootstrap no Codespace

Se `orquestrador-maestro` não estiver disponível no ambiente atual:

```bash
bash scripts/setup-maestro-codespace.sh
```

## Ordem de leitura

Antes de alterar código:

1. Leia `AGENTS.md`.
2. Leia `DEV/README.md` ou `DEV/INDEX.md`.
3. Leia `DEV/HANDOFF.md`.
4. Leia `DEV/CONTEXT.md`.
5. Leia `DEV/SPECS/ACTIVE.md`.
6. Abra somente o contexto necessário para a tarefa.

Use o Orquestrador Maestro para selecionar a capacidade mínima adequada e mantenha o contexto proporcional ao problema.

## Regras do TheGestor

- Preserve isolamento multiempresa e RLS.
- Nunca exponha credenciais de Supabase, Mercado Pago, Evolution ou outros provedores.
- Integrações externas devem permanecer server-side quando envolverem segredos.
- Não quebre a separação entre administrador e operador.
- Operador nunca deve receber dados financeiros que hoje são protegidos.
- Mudanças em cobrança, renovação, créditos ou pagamentos exigem verificação de regras de negócio.
- Webhooks e automações precisam ser idempotentes.
- Não faça mudança destrutiva de banco sem plano de migração e rollback.
- Investigue causa raiz antes de corrigir.
- Evite refatoração ampla sem necessidade para a tarefa.
- Antes de concluir mudança substantiva, rode `npm run build`.
- Para mudanças focadas, rode ao menos `npm run lint` e `npm test` quando aplicável.
- Após trabalho substantivo, atualize `DEV/WORKLOG.md`, `DEV/VERIFY.md` e `DEV/HANDOFF.md`.

## Critério de conclusão

Uma tarefa só está concluída quando:

1. o fluxo solicitado funciona;
2. isolamento e segurança permanecem preservados;
3. testes/verificações aplicáveis passam;
4. o estado útil foi persistido em `DEV/`.
