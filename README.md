# thegestor

SaaS administrativo para gestão de clientes, cobranças recorrentes e fila operacional.

## Estado atual

V0.1 é um protótipo funcional de front-end com navegação real e dados mockados. O foco desta fase é validar fluxo, responsividade, hierarquia de informação e permissões antes de conectar banco e meios de pagamento.

### Telas

- Login e criação de conta
- Visão Geral
- Clientes + cadastro em drawer
- Cobranças + fila operacional
- Integrações (Mercado Pago, WhatsApp/Evolution e Webhooks)
- Usuários e permissões
- Configurações
- Painel do Operador sem valores financeiros

## Stack

- Next.js App Router
- React + TypeScript
- CSS responsivo sem dependência de framework visual
- Lucide Icons

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Próximas fases

1. Supabase Auth e banco multi-tenant.
2. RLS para administrador e operador.
3. CRUD real de clientes, planos e cobranças.
4. Mercado Pago com cobrança individual, `external_reference`, validação de webhook e idempotência.
5. Serviço de WhatsApp desacoplado da UI, começando por Evolution e permitindo migração para Cloud API.
6. Jobs de geração mensal de cobranças e lembretes.
7. Auditoria operacional de renovação/ativação.
8. Testes E2E e integração.

## Segurança

Credenciais nunca devem ser gravadas no front-end ou versionadas. Use `.env.local` baseado em `.env.example`.
