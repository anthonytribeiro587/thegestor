# Active Spec - TheGestor

## Goal

Transformar o TheGestor de uma aplicação operacional funcional em um SaaS replicável, confiável e comercializável.

## Current Focus

Consolidar a base do produto e priorizar funcionalidades que removam dependência de operação manual antes de adicionar integrações financeiras mais complexas.

## In Scope

- UX/UI e fluxos essenciais;
- CRUD completo de clientes;
- planos/preços configuráveis;
- paginação;
- automações de cobrança;
- WhatsApp/Evolution;
- Mercado Pago;
- testes, segurança, observabilidade e onboarding.

## Out Of Scope

- customizações que só façam sentido para um único cliente sem possibilidade de parametrização;
- segredos versionados;
- acesso financeiro do perfil operador;
- mudanças destrutivas sem migração segura.

## Acceptance

- fluxo implementado e verificável;
- isolamento multiempresa preservado;
- papéis preservados;
- testes aplicáveis passando;
- build passando;
- documentação operacional atualizada.

## Verification Plan

```bash
npm run build
```

## Status

- State: active
- Owner: project
- Last updated: 2026-09-30
