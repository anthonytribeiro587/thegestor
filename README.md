# thegestor

SaaS administrativo para gestão de clientes, cobranças recorrentes e operação de renovações.

## Estado atual

A aplicação já está conectada ao Supabase e publicada na Vercel.

### Implementado

- Autenticação Supabase por e-mail e senha.
- Criação automática da empresa e do primeiro administrador.
- Banco multiempresa com RLS.
- Separação física dos dados financeiros para impedir acesso do operador.
- Dashboard com dados reais.
- Clientes com cadastro real de cliente + plano + assinatura + primeira cobrança.
- Cobranças com dados reais e classificação de vencimento.
- Fila operacional real.
- Perfil operador sem valores financeiros.
- Auditoria básica.
- Estrutura de integrações Mercado Pago / WhatsApp.
- Layout responsivo desktop, tablet e mobile.
- Loading states por rota.
- Testes unitários executados automaticamente antes de cada build.

## Stack

- Next.js App Router
- React + TypeScript
- Supabase Auth + PostgreSQL + RLS
- Vercel
- Lucide Icons
- Vitest

## Qualidade

O comando de build executa primeiro validação de TypeScript e testes:

```bash
npm run build
```

Fluxo executado automaticamente:

1. `npm run lint` (`tsc --noEmit`)
2. `npm test` (`vitest run`)
3. `next build`

Isso faz o deploy falhar antes da publicação caso tipos ou regras unitárias quebrem.

## Roadmap

### Fase 1 — Base operacional

- [x] Auth e empresa.
- [x] RLS admin/operador.
- [x] Clientes reais.
- [x] Cobranças reais.
- [x] Dashboard real.
- [x] Fila operacional.
- [x] Operador sem valores.
- [ ] Editar, cancelar e reativar clientes.
- [ ] Gestão própria de planos e preços.
- [ ] Paginação server-side para clientes e cobranças.

### Fase 2 — Usuários e operação

- [ ] Convite de operador por e-mail.
- [ ] Ativar/desativar usuários.
- [ ] Tela de permissões real.
- [ ] Histórico completo por cliente.
- [ ] Auditoria de alterações administrativas.
- [ ] Busca global funcional.

### Fase 3 — Mercado Pago

- [ ] Conectar conta Mercado Pago.
- [ ] Gerar cobrança PIX individual por cliente/cobrança.
- [ ] `external_reference` vinculado à cobrança do thegestor.
- [ ] Assinatura e validação de webhook.
- [ ] Idempotência para eventos repetidos.
- [ ] Baixa automática quando pagamento for aprovado.
- [ ] Reconciliação para pagamentos que não chegaram por webhook.
- [ ] Link público de pagamento para novos clientes.

### Fase 4 — Automação de cobranças

- [ ] Gerar próximas cobranças automaticamente.
- [ ] Atualizar vencidas de forma agendada.
- [ ] Lembrete antes do vencimento.
- [ ] Aviso no dia do vencimento.
- [ ] Cobrança após atraso.
- [ ] Parar mensagens automaticamente após pagamento.
- [ ] Configuração de dias/horários por empresa.

### Fase 5 — WhatsApp

- [ ] Conectar Evolution API por instância.
- [ ] QR/status da conexão no painel.
- [ ] Templates de mensagens.
- [ ] Envio automático associado à cobrança.
- [ ] Histórico e status das mensagens.
- [ ] Retentativa controlada e limites de envio.
- [ ] Camada desacoplada para futura migração à WhatsApp Cloud API.

### Fase 6 — Painel do operador

- [x] Visualização sem valores financeiros.
- [x] Fila de renovação/ativação.
- [x] Concluir tarefa operacional.
- [ ] Filtros por prioridade e vencimento.
- [ ] Observações e histórico de execução.
- [ ] Indicador de novo cliente pago.
- [ ] SLA/tempo em fila.

### Fase 7 — Relatórios e gestão

- [ ] Recebimentos por período.
- [ ] Inadimplência.
- [ ] Clientes ativos/cancelados.
- [ ] Novos clientes.
- [ ] Exportação CSV/Excel.
- [ ] Indicadores operacionais sem expor financeiro a operadores.

### Fase 8 — Qualidade e segurança

- [x] Unit tests das regras de Auth e cobrança.
- [x] TypeScript obrigatório antes do build.
- [ ] Testes de integração Supabase/RLS.
- [ ] Testes E2E de cadastro → cobrança → pagamento → renovação.
- [ ] Testes de webhook Mercado Pago.
- [ ] Rate limiting nas rotas públicas.
- [ ] Observabilidade e captura de erros.
- [ ] Paginação e índices revisados com volume real.

## Segurança

- Credenciais nunca são gravadas no front-end ou versionadas.
- O operador não recebe colunas financeiras pela Data API.
- Todas as tabelas de negócio usam RLS.
- Integrações devem guardar segredos apenas em ambiente de servidor/Vault.
