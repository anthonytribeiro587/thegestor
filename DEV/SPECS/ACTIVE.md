# Active Spec - TheGestor

## Goal

Transformar o TheGestor de uma aplicação operacional funcional em um SaaS replicável, confiável e comercializável.

## Current Focus

Resolver o bloqueador de experiência mobile em todo o produto, preservando a composição desktop e os fluxos existentes. O layout deve ser próprio até 768px, manter filtros e ordenação server-side, evitar overflow e oferecer controles confortáveis nos viewports 390, 430 e 768px. QA público Chromium foi concluído; as páginas operacionais ainda precisam de inspeção autenticada com ADMIN/OPERATOR e dados isolados.

## In Scope

- Landing pública, SEO, UX/UI e fluxos essenciais;
- Filtros, ordenação server-side e estado de renovação derivado de tarefas/ciclos;
- consistência visual, densidade, acessibilidade básica e responsividade das telas principais;
- layout mobile-first dedicado para navegação, indicadores, filtros, ordenação, listas, drawers, modais, login, cadastro e landing;
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
- mobile navegável sem zoom nem overflow horizontal nos viewports exigidos; desktop preservado;
- landing `/` pública; login/cadastro preservados; filtros e ordenação persistidos na URL;
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
