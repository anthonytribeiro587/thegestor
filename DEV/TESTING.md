# Testing And Verification

## Gate principal

```bash
npm run build
```

O `prebuild` executa:

```bash
npm run lint
npm test
```

e então o Next.js build.

## Estratégia

- Regra de negócio: adicionar/atualizar Vitest.
- RLS/multiempresa: testar isolamento entre empresas.
- Perfis: testar admin vs operador.
- Integrações: usar mocks/ambiente seguro; nunca dados de produção para testes destrutivos.
- Webhooks: testar assinatura, repetição e idempotência.
- Fluxos críticos: adicionar E2E antes de escalar comercialmente.
