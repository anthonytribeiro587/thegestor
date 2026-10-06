# Active Spec - TheGestor

## Goal

Transformar o TheGestor de uma aplicação operacional funcional em um SaaS replicável, confiável e comercializável.

## Current Focus

Consolidar a base do produto e concluir o acabamento de UX/UI nas telas operacionais, preservando identidade, densidade, responsividade e fluxos existentes. Exclusão segura de clientes já está implementada; a validação visual em Preview segue pendente.

## In Scope

- UX/UI e fluxos essenciais;
- consistência visual, densidade, acessibilidade básica e responsividade das telas principais;
- CRUD completo de clientes;
- exclusão definitiva de clientes sem histórico financeiro, com RPC ADMIN-only, auditoria e preservação/cancelamento dos clientes com recebimentos;
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
- cliente com histórico financeiro permanece preservado e pode ser cancelado;
- exclusão sem recebimentos confirma tenant/ADMIN, limpa dependências e mantém auditoria;
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
- Last updated: 2026-10-06
