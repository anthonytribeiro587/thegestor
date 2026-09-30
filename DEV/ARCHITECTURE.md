# Architecture

## Frontend/Application

- Next.js App Router
- React
- TypeScript
- UI responsiva desktop/tablet/mobile

## Data And Auth

- Supabase Auth
- PostgreSQL
- RLS multiempresa
- perfis ADMIN e OPERATOR
- dados financeiros segregados do operador

## Business Domains

- empresas e usuários
- clientes
- assinaturas/planos
- cobranças
- renovações
- créditos utilizados e previstos
- importação XLSX
- auditoria

## Integrations

- Evolution API / WhatsApp
- Mercado Pago (roadmap)

## Deployment

- Vercel

## Quality Gate

```bash
npm run build
```

O prebuild executa TypeScript e Vitest antes do build Next.js.
